import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";

/**
 * Compact HMAC-signed payloads for short-lived capabilities the server hands
 * out itself: local-storage upload/read URLs, unlocked share links and guest
 * identities. Each use gets its own `purpose`, so a token minted for one
 * thing can never be replayed as another.
 */
function key(purpose: string) {
  return createHmac("sha256", env.AUTH_SECRET).update(`reviewspace:${purpose}`).digest();
}

function sign(purpose: string, body: string) {
  return createHmac("sha256", key(purpose)).update(body).digest("base64url");
}

export function signPayload(purpose: string, payload: Record<string, unknown>, ttlSeconds: number) {
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + ttlSeconds })).toString(
    "base64url",
  );
  return `${body}.${sign(purpose, body)}`;
}

export function verifyPayload<T extends Record<string, unknown>>(purpose: string, token: string | null | undefined) {
  if (!token || token.length > 4096) return null;
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;

  const expected = Buffer.from(sign(purpose, body));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as T & { exp: number };
    if (typeof payload.exp !== "number" || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}
