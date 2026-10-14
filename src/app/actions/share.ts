"use server";

import { refresh } from "next/cache";
import { headers } from "next/headers";
import { getCurrentUser } from "@/lib/auth/session";
import { appUrl } from "@/lib/email";
import type { ActionResult } from "@/lib/errors";
import { paths } from "@/lib/paths";
import { rateLimit } from "@/lib/rate-limit";
import { guestNameSchema } from "@/lib/validation/review";
import { idSchema } from "@/lib/validation/shared";
import * as share from "@/server/share-service";
import { toActionResult } from "@/server/request-actor";

const SESSION_EXPIRED = { ok: false as const, error: "Your session has expired. Please sign in again." };

export async function createShareLinkAction(values: unknown): Promise<ActionResult & { url?: string }> {
  const user = await getCurrentUser();
  if (!user) return SESSION_EXPIRED;
  const result = await toActionResult(() => share.createShareLink(user.id, values));
  if (!result.ok) return result;
  refresh();
  return { ok: true, url: appUrl(paths.share(result.data!.token)) };
}

export async function revokeShareLinkAction(linkId: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return SESSION_EXPIRED;
  const result = await toActionResult(() => share.revokeShareLink(user.id, idSchema.parse(linkId)));
  if (result.ok) refresh();
  return result.ok ? { ok: true, message: "Link revoked. It stops working immediately." } : result;
}

async function clientIp() {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}

export async function unlockShareAction(token: string, password: string): Promise<ActionResult> {
  if (typeof token !== "string" || typeof password !== "string" || password.length > 128) {
    return { ok: false, error: "Enter the password." };
  }
  if (!rateLimit(`share-unlock:${await clientIp()}:${token.slice(0, 12)}`, 10, 10 * 60_000)) {
    return { ok: false, error: "Too many attempts. Please wait a few minutes." };
  }
  const result = await toActionResult(() => share.unlockShareLink(token, password));
  if (result.ok) refresh();
  return result;
}

export async function setGuestNameAction(token: string, name: string): Promise<ActionResult> {
  const parsed = guestNameSchema.safeParse(name);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Enter your name." };
  if (!rateLimit(`share-guest:${await clientIp()}`, 20, 60 * 60_000)) {
    return { ok: false, error: "Too many attempts. Please wait a while." };
  }
  const result = await toActionResult(() => share.setGuestName(token, parsed.data));
  if (result.ok) refresh();
  return result;
}
