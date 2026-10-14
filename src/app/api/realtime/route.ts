import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { authorizeProject, authorizeVersion, type Actor, type Viewer } from "@/server/access";
import { canReceive } from "@/lib/realtime-filter";
import { announcePresence, listPresence, subscribe, type RealtimeEvent } from "@/server/realtime";
import { actorFromRequest, errorResponse, unauthenticated } from "@/server/request-actor";

export const maxDuration = 300;

const HEARTBEAT_MS = 25_000;
const RECHECK_MS = 20_000;
const MAX_CHANNELS = 6;

type Grant = { channel: string; viewer: Viewer | null; presence: boolean };

/**
 * Authorizes one channel for this actor. Throws (404) when the actor may not
 * see it, so unauthorized subscriptions never open.
 */
async function authorizeChannel(actor: Actor, channel: string): Promise<Grant> {
  const [kind, id] = channel.split(":");
  if (!id || !/^[a-z0-9]{10,40}$/.test(id)) throw new Error("bad channel");
  switch (kind) {
    case "version": {
      const context = await authorizeVersion(actor, id);
      return { channel, viewer: context.viewer, presence: true };
    }
    case "asset": {
      const asset = await db.asset.findUnique({ where: { id }, select: { projectId: true } });
      if (!asset) throw new Error("not found");
      const context = await authorizeProject(actor, asset.projectId);
      return { channel, viewer: context.viewer, presence: false };
    }
    case "project": {
      const context = await authorizeProject(actor, id);
      return { channel, viewer: context.viewer, presence: false };
    }
    case "user": {
      if (actor.kind !== "member" || actor.userId !== id) throw new Error("forbidden");
      return { channel, viewer: null, presence: false };
    }
    default:
      throw new Error("bad channel");
  }
}

/**
 * Server-Sent Events stream. Each event is an invalidation hint (ids only);
 * team-only events are dropped for clients and guests. Access is re-checked
 * periodically, so removing someone from a project also ends their live view.
 */
export async function GET(request: Request) {
  const actor = await actorFromRequest(request);
  if (!actor) return unauthenticated();

  const requested = [...new Set((new URL(request.url).searchParams.get("channels") ?? "").split(",").filter(Boolean))];
  if (requested.length === 0 || requested.length > MAX_CHANNELS) {
    return Response.json({ error: "Invalid channels." }, { status: 400 });
  }

  let grants: Grant[];
  try {
    grants = await Promise.all(requested.map((channel) => authorizeChannel(actor, channel)));
  } catch (error) {
    return error instanceof Error && error.name === "AppError"
      ? errorResponse(error)
      : Response.json({ error: "Not found." }, { status: 404 });
  }

  const name = actor.userId
    ? ((await db.user.findUnique({ where: { id: actor.userId }, select: { name: true } }))?.name ?? "Someone")
    : "Guest viewer";
  const viewerIdentity = {
    connectionId: randomUUID(),
    userId: actor.userId ?? `anon-${randomUUID()}`,
    name,
    guest: actor.kind === "guest",
  };

  const encoder = new TextEncoder();
  const cleanups: (() => void)[] = [];
  let closed = false;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          close();
        }
      };
      const sendEvent = (id: string, payload: unknown) => send(`id: ${id}\ndata: ${JSON.stringify(payload)}\n\n`);

      const close = () => {
        if (closed) return;
        closed = true;
        for (const cleanup of cleanups) cleanup();
        for (const grant of grants) {
          if (grant.presence) void announcePresence(grant.channel, viewerIdentity, "leave");
        }
        try {
          controller.close();
        } catch {
          // already closed
        }
      };

      // Re-authorizes every channel; a role change (e.g. member → client)
      // also updates what this connection may receive.
      const recheckAccess = async () => {
        try {
          const fresh = await Promise.all(grants.map((grant) => authorizeChannel(actor, grant.channel)));
          fresh.forEach((grant, i) => {
            grants[i]!.viewer = grant.viewer;
          });
        } catch {
          sendEvent(randomUUID(), { type: "access.revoked" });
          close();
        }
      };

      for (const grant of grants) {
        const unsubscribe = await subscribe(grant.channel, (event: RealtimeEvent) => {
          if (event.type === "access.changed") {
            void recheckAccess();
            return;
          }
          if (!canReceive(event, grant.viewer?.seesInternal ?? false)) return;
          if (event.type === "presence") {
            sendEvent(event.id, { type: "presence", channel: grant.channel, viewers: listPresence(grant.channel) });
            return;
          }
          sendEvent(event.id, { type: event.type, channel: grant.channel, data: event.data });
        });
        cleanups.push(unsubscribe);
      }

      send("retry: 3000\n\n");
      sendEvent(randomUUID(), { type: "ready", channels: grants.map((g) => g.channel) });
      for (const grant of grants) {
        if (grant.presence) await announcePresence(grant.channel, viewerIdentity, "join");
      }

      const heartbeat = setInterval(() => {
        send(": ping\n\n");
        for (const grant of grants) {
          if (grant.presence) void announcePresence(grant.channel, viewerIdentity, "heartbeat");
        }
      }, HEARTBEAT_MS);
      cleanups.push(() => clearInterval(heartbeat));

      const recheck = setInterval(() => void recheckAccess(), RECHECK_MS);
      cleanups.push(() => clearInterval(recheck));

      request.signal.addEventListener("abort", close);
    },
    cancel() {
      closed = true;
      for (const cleanup of cleanups) cleanup();
      for (const grant of grants) {
        if (grant.presence) void announcePresence(grant.channel, viewerIdentity, "leave");
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}
