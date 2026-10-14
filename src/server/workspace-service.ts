import "server-only";
import { randomBytes } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { slugify } from "@/lib/slug";
import type { OnboardingInput } from "@/lib/validation/workspace";

/**
 * Creates a workspace with the caller as OWNER, plus the first project, in one
 * transaction so onboarding never leaves a half-built workspace behind.
 */
export async function createWorkspaceWithProject(userId: string, input: OnboardingInput) {
  const base = slugify(input.workspaceName) || "workspace";

  for (let attempt = 0; attempt < 5; attempt++) {
    const slug = attempt === 0 ? base : `${base}-${randomBytes(3).toString("hex")}`;
    try {
      return await db.$transaction(async (tx) => {
        const workspace = await tx.workspace.create({
          data: {
            name: input.workspaceName,
            slug,
            members: { create: { userId, role: "OWNER" } },
          },
          select: { id: true, slug: true },
        });
        const project = await tx.project.create({
          data: {
            workspaceId: workspace.id,
            name: input.projectName,
            clientName: input.clientName || null,
            // workspaceId comes from the composite project relation.
            members: { create: { userId } },
          },
          select: { id: true },
        });
        await tx.auditEvent.createMany({
          data: [
            { workspaceId: workspace.id, actorId: userId, type: "workspace.created", targetType: "workspace", targetId: workspace.id },
            { workspaceId: workspace.id, projectId: project.id, actorId: userId, type: "project.created", targetType: "project", targetId: project.id },
          ],
        });
        return { workspace, project };
      });
    } catch (error) {
      const slugTaken =
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002" &&
        JSON.stringify(error.meta ?? {}).includes("slug");
      if (!slugTaken) throw error;
    }
  }
  throw new Error("Could not allocate a unique workspace slug");
}

export async function listWorkspacesForUser(userId: string) {
  const memberships = await db.workspaceMember.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
    select: { role: true, workspace: { select: { id: true, name: true, slug: true } } },
  });
  return memberships.map((m) => ({ ...m.workspace, role: m.role }));
}

/**
 * Projects visible to the user in a workspace. Owners/admins see all; members
 * and clients see only projects they are assigned to.
 */
export async function listVisibleProjects(userId: string, workspaceId: string, seesAll: boolean) {
  return db.project.findMany({
    where: {
      workspaceId,
      status: "ACTIVE",
      ...(seesAll ? {} : { members: { some: { userId } } }),
    },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      name: true,
      clientName: true,
      dueDate: true,
      updatedAt: true,
      _count: { select: { assets: true, members: true } },
    },
  });
}

export async function listRecentActivity(workspaceId: string, projectIds: string[] | null, take = 10) {
  return db.auditEvent.findMany({
    where: {
      workspaceId,
      // Clients/members only see activity for projects they can access.
      ...(projectIds ? { projectId: { in: projectIds } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take,
    select: {
      id: true,
      type: true,
      createdAt: true,
      metadata: true,
      actor: { select: { name: true } },
      project: { select: { name: true } },
    },
  });
}
