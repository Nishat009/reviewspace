"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";

/**
 * One EventSource per tab, shared by every component that needs live
 * updates. Components register channels; the provider reconnects with the
 * union. Events are invalidation hints: handlers refetch through the normal
 * API. After a reconnect every handler receives a synthetic "resync" event so
 * anything missed while offline is fetched from the database.
 */
export type RealtimeMessage =
  | { type: "ready"; channels: string[] }
  | { type: "presence"; channel: string; viewers: { userId: string; name: string; guest: boolean }[] }
  | { type: "resync"; channel: string }
  | { type: "access.revoked"; channel?: undefined }
  | { type: string; channel: string; data?: Record<string, unknown> };

export type ConnectionStatus = "idle" | "connecting" | "live" | "reconnecting" | "revoked";

type Handler = (message: RealtimeMessage) => void;

class RealtimeClient {
  private refs = new Map<string, number>();
  private handlers = new Map<string, Set<Handler>>();
  private source: EventSource | null = null;
  private currentKey = "";
  private seen: string[] = [];
  private seenSet = new Set<string>();
  private hadError = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private status: ConnectionStatus = "idle";
  private statusListeners = new Set<() => void>();

  constructor(private shareToken: string | null) {}

  getStatus = () => this.status;
  subscribeStatus = (listener: () => void) => {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  };
  private setStatus(status: ConnectionStatus) {
    if (this.status === status) return;
    this.status = status;
    for (const listener of this.statusListeners) listener();
  }

  register(channels: string[], handler: Handler) {
    for (const channel of channels) {
      this.refs.set(channel, (this.refs.get(channel) ?? 0) + 1);
      let set = this.handlers.get(channel);
      if (!set) this.handlers.set(channel, (set = new Set()));
      set.add(handler);
    }
    this.scheduleReconnect();
    return () => {
      for (const channel of channels) {
        const count = (this.refs.get(channel) ?? 1) - 1;
        if (count <= 0) this.refs.delete(channel);
        else this.refs.set(channel, count);
        this.handlers.get(channel)?.delete(handler);
      }
      this.scheduleReconnect();
    };
  }

  /** Debounced so a page mounting several subscribers opens one connection. */
  private scheduleReconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => this.connect(), 50);
  }

  private connect() {
    const channels = [...this.refs.keys()].sort();
    const key = channels.join(",");
    if (key === this.currentKey && this.source) return;
    this.source?.close();
    this.source = null;
    this.currentKey = key;
    if (channels.length === 0 || this.status === "revoked") {
      if (this.status !== "revoked") this.setStatus("idle");
      return;
    }

    const params = new URLSearchParams({ channels: key });
    if (this.shareToken) params.set("share", this.shareToken);
    const source = new EventSource(`/api/realtime?${params}`);
    this.source = source;
    this.setStatus(this.hadError ? "reconnecting" : "connecting");

    source.onopen = () => {
      this.setStatus("live");
      if (this.hadError) {
        this.hadError = false;
        // Catch up on anything missed while disconnected.
        for (const channel of channels) this.dispatch({ type: "resync", channel });
      }
    };
    source.onerror = () => {
      this.hadError = true;
      if (this.status !== "revoked") this.setStatus("reconnecting");
      // EventSource retries on its own; if the server refused outright
      // (401/404) it closes, so retry ourselves with backoff.
      if (source.readyState === EventSource.CLOSED) {
        setTimeout(() => {
          if (this.source === source) {
            this.currentKey = "";
            this.connect();
          }
        }, 5_000);
      }
    };
    source.onmessage = (event) => {
      if (event.lastEventId) {
        if (this.seenSet.has(event.lastEventId)) return; // duplicate delivery
        this.seenSet.add(event.lastEventId);
        this.seen.push(event.lastEventId);
        if (this.seen.length > 500) this.seenSet.delete(this.seen.shift()!);
      }
      let message: RealtimeMessage;
      try {
        message = JSON.parse(event.data) as RealtimeMessage;
      } catch {
        return;
      }
      if (message.type === "access.revoked") {
        this.setStatus("revoked");
        source.close();
        for (const set of this.handlers.values()) for (const handler of set) handler(message);
        return;
      }
      if (message.type === "ready") return;
      this.dispatch(message);
    };
  }

  private dispatch(message: RealtimeMessage) {
    const channel = "channel" in message ? message.channel : undefined;
    if (!channel) return;
    for (const handler of this.handlers.get(channel) ?? []) handler(message);
  }

  close() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.source?.close();
    this.source = null;
  }
}

const RealtimeContext = createContext<RealtimeClient | null>(null);

export function RealtimeProvider({ children, shareToken = null }: { children: ReactNode; shareToken?: string | null }) {
  const [client] = useState(() => new RealtimeClient(shareToken));
  useEffect(() => () => client.close(), [client]);
  return <RealtimeContext.Provider value={client}>{children}</RealtimeContext.Provider>;
}

/** Subscribes to channels for the component's lifetime. */
export function useRealtime(channels: (string | null | undefined)[], handler: Handler) {
  const client = useContext(RealtimeContext);
  const handlerRef = useRef(handler);
  useEffect(() => {
    handlerRef.current = handler;
  });
  const key = channels.filter(Boolean).join(",");
  useEffect(() => {
    if (!client || !key) return;
    return client.register(key.split(","), (message) => handlerRef.current(message));
  }, [client, key]);
}

export function useConnectionStatus(): ConnectionStatus {
  const client = useContext(RealtimeContext);
  const subscribe = useMemo(() => client?.subscribeStatus ?? (() => () => {}), [client]);
  return useSyncExternalStore(
    subscribe,
    () => client?.getStatus() ?? "idle",
    () => "idle",
  );
}
