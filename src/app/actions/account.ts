"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { signOut } from "@/auth";
import type { NotificationType } from "@/generated/prisma/enums";
import { getCurrentUser } from "@/lib/auth/session";
import type { ActionResult } from "@/lib/errors";
import { rateLimit } from "@/lib/rate-limit";
import { changePasswordSchema, profileSchema } from "@/lib/validation/members";
import { idSchema } from "@/lib/validation/shared";
import { toActionResult } from "@/server/request-actor";
import * as users from "@/server/user-service";

const SESSION_EXPIRED = { ok: false as const, error: "Your session has expired. Please sign in again." };

export async function updateProfileAction(values: unknown): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return SESSION_EXPIRED;
  const parsed = profileSchema.safeParse(values);
  if (!parsed.success) {
    return { ok: false, error: "Please fix the highlighted fields.", fieldErrors: z.flattenError(parsed.error).fieldErrors };
  }
  await users.updateProfileName(user.id, parsed.data.name);
  refresh();
  return { ok: true, message: "Profile updated." };
}

export async function updateAvatarAction(formData: FormData): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return SESSION_EXPIRED;
  if (!rateLimit(`avatar:${user.id}`, 20, 60 * 60_000)) return { ok: false, error: "Too many changes. Try again later." };
  const file = formData.get("avatar");
  const remove = formData.get("remove") === "1";
  const result = await toActionResult(() => users.updateAvatar(user.id, remove || !(file instanceof File) ? null : file));
  if (result.ok) refresh();
  return result.ok ? { ok: true, message: remove ? "Photo removed." : "Photo updated." } : result;
}

/** Signs out other sessions; this one is re-issued by signing in again. */
export async function changePasswordAction(values: unknown): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return SESSION_EXPIRED;
  const parsed = changePasswordSchema.safeParse(values);
  if (!parsed.success) {
    return { ok: false, error: "Please fix the highlighted fields.", fieldErrors: z.flattenError(parsed.error).fieldErrors };
  }
  if (!rateLimit(`change-password:${user.id}`, 5, 15 * 60_000)) return { ok: false, error: "Too many attempts. Please wait a few minutes." };
  const result = await toActionResult(() => users.changePassword(user.id, parsed.data.currentPassword, parsed.data.newPassword));
  if (!result.ok) return { ...result, fieldErrors: { currentPassword: [result.error] } };
  await signOut({ redirectTo: "/sign-in?reset=1" });
  return { ok: true };
}

export async function signOutEverywhereAction(): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return SESSION_EXPIRED;
  await users.signOutEverywhere(user.id);
  await signOut({ redirectTo: "/sign-in" });
  return { ok: true };
}

export async function setEmailPreferenceAction(type: NotificationType, enabled: boolean): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return SESSION_EXPIRED;
  const result = await toActionResult(() => users.setEmailPreference(user.id, type, enabled === true));
  return result.ok ? { ok: true, message: "Preference saved." } : result;
}

// ─── Notifications ───────────────────────────────────────────────────────────

export async function openNotificationAction(notificationId: string): Promise<ActionResult & { href?: string }> {
  const user = await getCurrentUser();
  if (!user) return SESSION_EXPIRED;
  const id = idSchema.safeParse(notificationId);
  if (!id.success) return { ok: false, error: "Notification not found." };
  const result = await toActionResult(() => users.markNotificationRead(user.id, id.data));
  if (!result.ok) return result;
  return { ok: true, href: result.data };
}

export async function markNotificationReadAction(notificationId: string): Promise<ActionResult> {
  const result = await openNotificationAction(notificationId);
  if (result.ok) refresh();
  return result.ok ? { ok: true } : result;
}

export async function markAllNotificationsReadAction(): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return SESSION_EXPIRED;
  await users.markAllNotificationsRead(user.id);
  refresh();
  return { ok: true, message: "All caught up." };
}
