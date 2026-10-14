"use server";

import { refresh } from "next/cache";
import { getCurrentUser } from "@/lib/auth/session";
import type { ActionResult } from "@/lib/errors";
import { rateLimit } from "@/lib/rate-limit";
import type { UploadTarget } from "@/lib/storage";
import { assetNameSchema, type StartUploadInput } from "@/lib/validation/project";
import { idSchema } from "@/lib/validation/shared";
import * as assets from "@/server/asset-service";
import { toActionResult } from "@/server/request-actor";

const SESSION_EXPIRED = { ok: false as const, error: "Your session has expired. Please sign in again." };

export async function startUploadAction(
  input: StartUploadInput,
): Promise<ActionResult & { data?: { assetId: string; versionId: string; upload: UploadTarget } }> {
  const user = await getCurrentUser();
  if (!user) return SESSION_EXPIRED;
  if (!rateLimit(`upload:${user.id}`, 60, 10 * 60_000)) return { ok: false, error: "Too many uploads. Wait a few minutes." };
  return toActionResult(() => assets.startUpload(user.id, input));
}

export async function finalizeUploadAction(
  versionId: string,
): Promise<ActionResult & { data?: { versionId: string; versionNumber: number; assetId: string } }> {
  const user = await getCurrentUser();
  if (!user) return SESSION_EXPIRED;
  const result = await toActionResult(() => assets.finalizeUpload(user.id, idSchema.parse(versionId)));
  if (result.ok) refresh();
  return result;
}

export async function abandonUploadAction(versionId: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;
  const id = idSchema.safeParse(versionId);
  if (id.success) await assets.abandonUpload(user.id, id.data);
}

export async function renameAssetAction(assetId: string, name: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return SESSION_EXPIRED;
  const parsed = assetNameSchema.safeParse(name);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Enter a name." };
  const result = await toActionResult(() => assets.renameAsset(user.id, idSchema.parse(assetId), parsed.data));
  if (result.ok) refresh();
  return result.ok ? { ok: true, message: "Asset renamed." } : result;
}

export async function archiveAssetAction(assetId: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return SESSION_EXPIRED;
  const result = await toActionResult(() => assets.archiveAsset(user.id, idSchema.parse(assetId)));
  if (result.ok) refresh();
  return result.ok ? { ok: true, message: "Asset archived." } : result;
}
