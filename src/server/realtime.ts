import "server-only";
import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { Client, Pool } from "pg";
import { env } from "@/lib/env";

/**
 * Realtime fan-out. Events are invalidation hints, not data: they say "thread
 * X on version Y changed" and the client refetches through the normal,
 * permission-checked API. The database stays the source of truth, a missed
 * event is repaired by refetching on reconnect, and private content never
 * travels over the event stream.
 *
 * Drivers:
 * - memory: in-process emitter. Correct for a single server (and `next dev`).
 * - postgres: LISTEN/NOTIFY, so every app instance sees every event.
 */
export type RealtimeEvent = {
  id: string;
  channel: string;
  type: string;
  data: Record<string, unknown>;
  /** Team-only events (internal threads) are never sent to clients or guests. */
  internal?: boolean;
  at: number;
};

type Listener = (event: RealtimeEvent) => void;

const PG_CHANNEL = "reviewspace_events";

type Hub = {
  emitter: EventEmitter;
  pg?: { client: Client | null; connecting: Promise<void> | null };
  presence: Map<string, Map<string, PresenceEntry>>;
};

// Survives hot reloads and is shared by every route bundle in the process.
const globalForRealtime = globalThis as unknown as { __rsRealtime?: Hub };
const hub: Hub = (globalForRealtime.__rsRealtime ??= {
  emitter: new EventEmitter().setMaxListeners(0),
  presence: new Map(),
});

function deliver(event: RealtimeEvent) {
  if (event.type === "presence") trackPresence(event);
  hub.emitter.emit(event.channel, event);
}

async function ensurePgListener() {
  hub.pg ??= { client: null, connecting: null };
  const state = hub.pg;
  if (state.client) return;
  state.connecting ??= (async () => {
    const client = new Client({ connectionString: env.REALTIME_DATABASE_URL || env.DATABASE_URL });
    client.on("notification", (message) => {
      if (message.channel !== PG_CHANNEL || !message.payload) return;
      try {
        deliver(JSON.parse(message.payload) as RealtimeEvent);
      } catch {
        // Ignore malformed payloads.
      }
    });
    client.on("error", () => {
      state.client = null;
      state.connecting = null;
      setTimeout(() => void ensurePgListener().catch(() => {}), 2_000);
    });
    await client.connect();
    await client.query(`LISTEN ${PG_CHANNEL}`);
    state.client = client;
  })().finally(() => {
    state.connecting = null;
  });
  await state.connecting;
}

// One connection, queued by the pool: concurrent publishes neither open extra
// connections nor overlap queries on the same client.
let publisher: Pool | null = null;
async function pgPublish(event: RealtimeEvent) {
  if (!publisher) {
    publisher = new Pool({ connectionString: env.REALTIME_DATABASE_URL || env.DATABASE_URL, max: 1 });
    // Idle-connection errors; the pool replaces the client on next use.
    publisher.on("error", () => {});
  }
  // NOTIFY payloads are capped at 8000 bytes; events carry only ids.
  await publisher.query("SELECT pg_notify($1, $2)", [PG_CHANNEL, JSON.stringify(event)]);
}

/**
 * Publishes after the database write has committed. Never throws: a lost
 * event only delays an update until the next refetch.
 */
export async function publish(
  channel: string,
  type: string,
  data: Record<string, unknown> = {},
  options: { internal?: boolean } = {},
) {
  const event: RealtimeEvent = { id: randomUUID(), channel, type, data, internal: options.internal, at: Date.now() };
  try {
    if (env.REALTIME_DRIVER === "postgres") await pgPublish(event);
    else deliver(event);
  } catch (error) {
    console.error("[realtime] publish failed", { type, error: (error as Error).message });
  }
  return event;
}

/**
 * Closes the Postgres connections so a one-off script can exit. The app
 * server never calls this.
 */
export async function closeRealtime() {
  const closing = [publisher, hub.pg?.client];
  publisher = null;
  if (hub.pg) hub.pg.client = null;
  await Promise.all(closing.map((connection) => connection?.end().catch(() => {})));
}

export async function subscribe(channel: string, listener: Listener) {
  if (env.REALTIME_DRIVER === "postgres") await ensurePgListener();
  hub.emitter.on(channel, listener);
  return () => {
    hub.emitter.off(channel, listener);
  };
}

export const channels = {
  version: (id: string) => `version:${id}`,
  asset: (id: string) => `asset:${id}`,
  project: (id: string) => `project:${id}`,
  user: (id: string) => `user:${id}`,
};

// ─── Presence ────────────────────────────────────────────────────────────────

export type PresenceEntry = { connectionId: string; userId: string; name: string; guest: boolean; seenAt: number };
const PRESENCE_TTL_MS = 75_000;

function trackPresence(event: RealtimeEvent) {
  const { connectionId, userId, name, guest, state } = event.data as {
    connectionId: string;
    userId: string;
    name: string;
    guest: boolean;
    state: "join" | "heartbeat" | "leave";
  };
  let viewers = hub.presence.get(event.channel);
  if (!viewers) hub.presence.set(event.channel, (viewers = new Map()));
  if (state === "leave") viewers.delete(connectionId);
  else viewers.set(connectionId, { connectionId, userId, name, guest, seenAt: event.at });
}

/** Distinct people currently viewing a channel (stale entries expire). */
export function listPresence(channel: string) {
  const viewers = hub.presence.get(channel);
  if (!viewers) return [];
  const now = Date.now();
  const byUser = new Map<string, { userId: string; name: string; guest: boolean }>();
  for (const [id, entry] of viewers) {
    if (now - entry.seenAt > PRESENCE_TTL_MS) viewers.delete(id);
    else byUser.set(entry.userId, { userId: entry.userId, name: entry.name, guest: entry.guest });
  }
  return [...byUser.values()];
}

export function announcePresence(
  channel: string,
  viewer: { connectionId: string; userId: string; name: string; guest: boolean },
  state: "join" | "heartbeat" | "leave",
) {
  return publish(channel, "presence", { ...viewer, state });
}
