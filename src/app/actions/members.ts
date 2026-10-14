"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { assertWorkspaceAccess, getWorkspaceAccess } from "@/lib/authz/guards";
import type { ActionResult } from "@/lib/errors";
import { paths } from "@/lib/paths";
import { rateLimit } from "@/lib/rate-limit";
import {
  changeRoleSchema,
  deleteWorkspaceSchema,
  invitationIdSchema,
  inviteSchema,
  memberIdSchema,
  transferOwnershipSchema,
  workspaceSettingsSchema,
} from "@/lib/validation/members";
import { idSchema } from "@/lib/validation/shared";
import * as members from "@/server/member-service";
import { toActionResult } from "@/server/request-actor";
import { storeWorkspaceLogo } from "@/server/user-service";

const SESSION_EXPIRED = { ok: false as const, error: "Your session has expired. Please sign in again." };

async function context(slug: string) {
  const user = await getCurrentUser();
  if (!user) return null;
  const access = await getWorkspaceAccess(user.id, slug);
  if (!access) return null;
  return { user, workspaceId: access.workspace.id };
}

export async function inviteMemberAction(slug: string, values: unknown): Promise<ActionResult> {
  const ctx = await context(slug);
  if (!ctx) return SESSION_EXPIRED;
  const parsed = inviteSchema.safeParse(values);
  if (!parsed.success) {
    return { ok: false, error: "Please fix the highlighted fields.", fieldErrors: z.flattenError(parsed.error).fieldErrors };
  }
  if (!rateLimit(`invite:${ctx.user.id}`, 30, 60 * 60_000)) return { ok: false, error: "Too many invitations. Try again later." };
  const result = await toActionResult(() => members.inviteMember(ctx.user.id, ctx.workspaceId, parsed.data));
  if (result.ok) refresh();
  return result.ok ? { ok: true, message: `Invitation sent to ${parsed.data.email}.` } : result;
}

export async function resendInvitationAction(slug: string, values: unknown): Promise<ActionResult> {
  const ctx = await context(slug);
  if (!ctx) return SESSION_EXPIRED;
  const input = invitationIdSchema.safeParse(values);
  if (!input.success) return { ok: false, error: "Invalid request." };
  if (!rateLimit(`invite-resend:${ctx.user.id}`, 20, 60 * 60_000)) return { ok: false, error: "Too many resends. Try again later." };
  const result = await toActionResult(() => members.resendInvitation(ctx.user.id, ctx.workspaceId, input.data.invitationId));
  if (result.ok) refresh();
  return result.ok ? { ok: true, message: "Invitation resent with a fresh link." } : result;
}

export async function revokeInvitationAction(slug: string, values: unknown): Promise<ActionResult> {
  const ctx = await context(slug);
  if (!ctx) return SESSION_EXPIRED;
  const input = invitationIdSchema.safeParse(values);
  if (!input.success) return { ok: false, error: "Invalid request." };
  const result = await toActionResult(() => members.revokeInvitation(ctx.user.id, ctx.workspaceId, input.data.invitationId));
  if (result.ok) refresh();
  return result.ok ? { ok: true, message: "Invitation revoked." } : result;
}

export async function changeRoleAction(slug: string, values: unknown): Promise<ActionResult> {
  const ctx = await context(slug);
  if (!ctx) return SESSION_EXPIRED;
  const input = changeRoleSchema.safeParse(values);
  if (!input.success) return { ok: false, error: "Invalid role." };
  const result = await toActionResult(() => members.changeMemberRole(ctx.user.id, ctx.workspaceId, input.data.memberId, input.data.role));
  if (result.ok) refresh();
  return result.ok ? { ok: true, message: "Role updated." } : result;
}

export async function removeMemberAction(slug: string, values: unknown): Promise<ActionResult> {
  const ctx = await context(slug);
  if (!ctx) return SESSION_EXPIRED;
  const input = memberIdSchema.safeParse(values);
  if (!input.success) return { ok: false, error: "Invalid request." };
  const result = await toActionResult(() => members.removeMember(ctx.user.id, ctx.workspaceId, input.data.memberId));
  if (result.ok) refresh();
  return result.ok ? { ok: true, message: "Member removed." } : result;
}

export async function leaveWorkspaceAction(slug: string, values: unknown): Promise<ActionResult> {
  const ctx = await context(slug);
  if (!ctx) return SESSION_EXPIRED;
  const input = memberIdSchema.safeParse(values);
  if (!input.success) return { ok: false, error: "Invalid request." };
  const result = await toActionResult(() => members.removeMember(ctx.user.id, ctx.workspaceId, input.data.memberId));
  if (!result.ok) return result;
  redirect("/dashboard");
}

export async function transferOwnershipAction(slug: string, values: unknown): Promise<ActionResult> {
  const ctx = await context(slug);
  if (!ctx) return SESSION_EXPIRED;
  const input = transferOwnershipSchema.safeParse(values);
  if (!input.success) return { ok: false, error: "Choose a new owner." };
  const result = await toActionResult(() => members.transferOwnership(ctx.user.id, ctx.workspaceId, input.data.memberId));
  if (result.ok) refresh();
  return result.ok ? { ok: true, message: "Ownership transferred. You're now an admin." } : result;
}

export async function updateWorkspaceAction(slug: string, values: unknown): Promise<ActionResult> {
  const ctx = await context(slug);
  if (!ctx) return SESSION_EXPIRED;
  const parsed = workspaceSettingsSchema.safeParse(values);
  if (!parsed.success) {
    return { ok: false, error: "Please fix the highlighted fields.", fieldErrors: z.flattenError(parsed.error).fieldErrors };
  }
  const result = await toActionResult(() => members.updateWorkspaceName(ctx.user.id, ctx.workspaceId, parsed.data.name));
  if (result.ok) refresh();
  return result.ok ? { ok: true, message: "Workspace updated." } : result;
}

export async function updateWorkspaceLogoAction(slug: string, formData: FormData): Promise<ActionResult> {
  const ctx = await context(slug);
  if (!ctx) return SESSION_EXPIRED;
  const file = formData.get("logo");
  const remove = formData.get("remove") === "1";
  const result = await toActionResult(async () => {
    await assertWorkspaceAccess(ctx.user.id, ctx.workspaceId, "workspace.settings.update");
    const path = remove || !(file instanceof File) || file.size === 0 ? null : await storeWorkspaceLogo(ctx.workspaceId, file);
    await members.setWorkspaceLogo(ctx.user.id, ctx.workspaceId, path);
  });
  if (result.ok) refresh();
  return result.ok ? { ok: true, message: remove ? "Logo removed." : "Logo updated." } : result;
}

export async function deleteWorkspaceAction(slug: string, values: unknown): Promise<ActionResult> {
  const ctx = await context(slug);
  if (!ctx) return SESSION_EXPIRED;
  const input = deleteWorkspaceSchema.safeParse(values);
  if (!input.success) return { ok: false, error: "Type the workspace name to confirm." };
  const result = await toActionResult(() => members.deleteWorkspace(ctx.user.id, ctx.workspaceId, input.data.confirmName));
  if (!result.ok) return result;
  redirect("/dashboard");
}

// ─── Invitation acceptance ───────────────────────────────────────────────────

export async function acceptInvitationAction(token: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return SESSION_EXPIRED;
  if (typeof token !== "string" || token.length > 200) return { ok: false, error: "This invitation link is invalid." };
  const result = await toActionResult(() => members.acceptInvitationByToken(user.id, token));
  if (!result.ok) return result;
  redirect(paths.dashboard(result.data!));
}

export async function acceptInvitationByIdAction(invitationId: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return SESSION_EXPIRED;
  const id = idSchema.safeParse(invitationId);
  if (!id.success) return { ok: false, error: "Invitation not found." };
  const result = await toActionResult(() => members.acceptInvitationById(user.id, id.data));
  if (!result.ok) return result;
  redirect(paths.dashboard(result.data!));
}
