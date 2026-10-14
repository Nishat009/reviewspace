"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { getWorkspaceAccess } from "@/lib/authz/guards";
import type { ActionResult } from "@/lib/errors";
import { paths } from "@/lib/paths";
import { rateLimit } from "@/lib/rate-limit";
import { projectSchema } from "@/lib/validation/project";
import { projectMemberSchema } from "@/lib/validation/members";
import { idSchema } from "@/lib/validation/shared";
import * as projects from "@/server/project-service";
import { toActionResult } from "@/server/request-actor";

const SESSION_EXPIRED: ActionResult = { ok: false, error: "Your session has expired. Please sign in again." };

export async function createProjectAction(slug: string, values: unknown): Promise<ActionResult & { href?: string }> {
  const user = await getCurrentUser();
  if (!user) return SESSION_EXPIRED;
  const parsed = projectSchema.safeParse(values);
  if (!parsed.success) {
    return { ok: false, error: "Please fix the highlighted fields.", fieldErrors: z.flattenError(parsed.error).fieldErrors };
  }
  const access = await getWorkspaceAccess(user.id, slug);
  if (!access) return { ok: false, error: "Workspace not found." };
  if (!rateLimit(`create-project:${user.id}`, 30, 60 * 60_000)) return { ok: false, error: "Too many projects created. Try again later." };

  const result = await toActionResult(() => projects.createProject(user.id, access.workspace.id, parsed.data));
  if (!result.ok) return result;
  return { ok: true, href: paths.project(slug, result.data!.id) };
}

export async function updateProjectAction(projectId: string, values: unknown): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return SESSION_EXPIRED;
  const parsed = projectSchema.safeParse(values);
  if (!parsed.success) {
    return { ok: false, error: "Please fix the highlighted fields.", fieldErrors: z.flattenError(parsed.error).fieldErrors };
  }
  const result = await toActionResult(() => projects.updateProject(user.id, idSchema.parse(projectId), parsed.data));
  if (result.ok) refresh();
  return result.ok ? { ok: true, message: "Project updated." } : result;
}

export async function setProjectArchivedAction(projectId: string, archived: boolean): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return SESSION_EXPIRED;
  const result = await toActionResult(() => projects.setProjectArchived(user.id, idSchema.parse(projectId), archived));
  if (result.ok) refresh();
  return result.ok ? { ok: true, message: archived ? "Project archived." : "Project restored." } : result;
}

export async function addProjectMemberAction(values: unknown): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return SESSION_EXPIRED;
  const input = projectMemberSchema.safeParse(values);
  if (!input.success) return { ok: false, error: "Choose someone to add." };
  const result = await toActionResult(() => projects.addProjectMember(user.id, input.data.projectId, input.data.userId));
  if (result.ok) refresh();
  return result.ok ? { ok: true, message: "Access granted." } : result;
}

export async function removeProjectMemberAction(values: unknown): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return SESSION_EXPIRED;
  const input = projectMemberSchema.safeParse(values);
  if (!input.success) return { ok: false, error: "Invalid request." };
  const result = await toActionResult(() => projects.removeProjectMember(user.id, input.data.projectId, input.data.userId));
  if (result.ok) refresh();
  return result.ok ? { ok: true, message: "Access removed." } : result;
}
