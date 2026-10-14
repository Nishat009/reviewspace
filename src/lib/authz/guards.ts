import "server-only";
import { cache } from "react";
import { forbidden, notFound } from "next/navigation";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import type { WorkspaceRole } from "@/generated/prisma/enums";
import { can, hasImplicitProjectAccess, type Action } from "./permissions";

export type WorkspaceAccess = {
  workspace: { id: string; name: string; slug: string; logoPath: string | null };
  role: WorkspaceRole;
};

/**
 * Loads the caller's membership for a workspace. Returns null both when the
 * workspace does not exist and when the user is not a member, so callers
 * cannot tell the two apart (no existence leak across tenants).
 */
export const getWorkspaceAccess = cache(
  async (userId: string, slug: string): Promise<WorkspaceAccess | null> => {
    const membership = await db.workspaceMember.findFirst({
      where: { userId, workspace: { slug } },
      select: {
        role: true,
        workspace: { select: { id: true, name: true, slug: true, logoPath: true } },
      },
    });
    return membership ? { workspace: membership.workspace, role: membership.role } : null;
  },
);

/** Page variant: 404 for non-members, 403 when the role lacks `action`. */
export async function requireWorkspacePage(userId: string, slug: string, action?: Action) {
  const access = await getWorkspaceAccess(userId, slug);
  if (!access) notFound();
  if (action && !can(access.role, action)) forbidden();
  return access;
}

/** Service variant: throws AppError instead of rendering an error page. */
export async function assertWorkspaceAccess(userId: string, workspaceId: string, action?: Action) {
  const membership = await db.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
    select: { role: true },
  });
  if (!membership) throw new AppError("NOT_FOUND", "Workspace not found.");
  if (action && !can(membership.role, action)) {
    throw new AppError("FORBIDDEN", "You don't have permission to do that.");
  }
  return membership.role;
}

/**
 * Project access = workspace membership AND (owner/admin OR explicit project
 * assignment). Every project-scoped read and write goes through this.
 */
export async function assertProjectAccess(userId: string, projectId: string, action?: Action) {
  const project = await db.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      workspaceId: true,
      workspace: { select: { members: { where: { userId }, select: { role: true } } } },
      members: { where: { userId }, select: { id: true } },
    },
  });
  const role = project?.workspace.members[0]?.role;
  if (!project || !role) throw new AppError("NOT_FOUND", "Project not found.");
  if (!hasImplicitProjectAccess(role) && project.members.length === 0) {
    throw new AppError("NOT_FOUND", "Project not found.");
  }
  if (action && !can(role, action)) {
    throw new AppError("FORBIDDEN", "You don't have permission to do that.");
  }
  return { projectId: project.id, workspaceId: project.workspaceId, role };
}
