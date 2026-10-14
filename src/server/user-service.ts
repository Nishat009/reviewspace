import "server-only";
import { randomBytes } from "node:crypto";
import sharp from "sharp";
import type { NotificationType } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { MAX_IMAGE_DIMENSION, removeObjects, uploadObject } from "@/lib/storage";

const AVATAR_SIZE = 256;
const LOGO_SIZE = 256;
const MAX_SOURCE_BYTES = 5 * 1024 * 1024;

export async function updateProfileName(userId: string, name: string) {
  await db.user.update({ where: { id: userId }, data: { name } });
}

/**
 * Avatars and logos are small, so they go through the server: it decodes the
 * image (rejecting anything that isn't one), crops to a square, re-encodes to
 * WebP and stores the result under a fresh path.
 */
async function normalizeSquareImage(file: File, size: number) {
  if (file.size > MAX_SOURCE_BYTES) throw new AppError("INVALID", "Use an image up to 5 MB.");
  const input = Buffer.from(await file.arrayBuffer());
  try {
    return await sharp(input, { limitInputPixels: MAX_IMAGE_DIMENSION * MAX_IMAGE_DIMENSION })
      .rotate()
      .resize(size, size, { fit: "cover" })
      .webp({ quality: 85 })
      .toBuffer();
  } catch {
    throw new AppError("INVALID", "That file isn't a readable PNG, JPEG or WebP image.");
  }
}

export async function updateAvatar(userId: string, file: File | null) {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { image: true } });
  let image: string | null = null;
  if (file) {
    image = `avatars/${userId}/${randomBytes(8).toString("hex")}.webp`;
    await uploadObject(image, await normalizeSquareImage(file, AVATAR_SIZE), "image/webp");
  }
  await db.user.update({ where: { id: userId }, data: { image } });
  if (user.image && user.image !== image) await removeObjects([user.image]);
}

export async function storeWorkspaceLogo(workspaceId: string, file: File) {
  const path = `${workspaceId}/branding/logo-${randomBytes(8).toString("hex")}.webp`;
  await uploadObject(path, await normalizeSquareImage(file, LOGO_SIZE), "image/webp");
  return path;
}

/** Changing the password signs out every other session (sessionVersion bump). */
export async function changePassword(userId: string, currentPassword: string, newPassword: string) {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { passwordHash: true } });
  if (!user.passwordHash || !(await verifyPassword(user.passwordHash, currentPassword))) {
    throw new AppError("INVALID", "Your current password isn't right.");
  }
  await db.user.update({
    where: { id: userId },
    data: { passwordHash: await hashPassword(newPassword), sessionVersion: { increment: 1 } },
  });
}

export async function signOutEverywhere(userId: string) {
  await db.user.update({ where: { id: userId }, data: { sessionVersion: { increment: 1 } } });
}

export const EMAIL_PREFERENCE_TYPES: NotificationType[] = [
  "MENTION",
  "THREAD_REPLY",
  "REVIEW_REQUESTED",
  "CHANGES_REQUESTED",
  "VERSION_APPROVED",
];

export async function getEmailPreferences(userId: string) {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { notificationPrefs: true } });
  const email = ((user.notificationPrefs as { email?: Record<string, boolean> })?.email ?? {}) as Record<string, boolean>;
  return Object.fromEntries(EMAIL_PREFERENCE_TYPES.map((type) => [type, email[type] !== false])) as Record<NotificationType, boolean>;
}

export async function setEmailPreference(userId: string, type: NotificationType, enabled: boolean) {
  if (!EMAIL_PREFERENCE_TYPES.includes(type)) throw new AppError("INVALID", "Unknown notification type.");
  const current = await getEmailPreferences(userId);
  await db.user.update({ where: { id: userId }, data: { notificationPrefs: { email: { ...current, [type]: enabled } } } });
}

// ─── Notifications ───────────────────────────────────────────────────────────

export async function countUnreadNotifications(userId: string) {
  return db.notification.count({ where: { userId, readAt: null } });
}

export async function listNotifications(userId: string, options: { unreadOnly?: boolean; take?: number } = {}) {
  return db.notification.findMany({
    where: { userId, ...(options.unreadOnly ? { readAt: null } : {}) },
    orderBy: { createdAt: "desc" },
    take: options.take ?? 50,
    select: {
      id: true,
      type: true,
      target: true,
      readAt: true,
      createdAt: true,
      actor: { select: { name: true } },
      workspace: { select: { name: true } },
    },
  });
}

/** Returns the deep link so the caller can navigate after marking read. */
export async function markNotificationRead(userId: string, notificationId: string) {
  const notification = await db.notification.findFirst({ where: { id: notificationId, userId }, select: { target: true } });
  if (!notification) throw new AppError("NOT_FOUND", "Notification not found.");
  await db.notification.updateMany({ where: { id: notificationId, userId, readAt: null }, data: { readAt: new Date() } });
  return (notification.target as { path?: string }).path ?? "/dashboard";
}

export async function markAllNotificationsRead(userId: string) {
  await db.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } });
}
