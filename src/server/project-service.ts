import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { WorkspaceRole } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { assertWorkspaceAccess } from "@/lib/authz/guards";
import { can, hasImplicitProjectAccess } from "@/lib/authz/permissions";
import type { ProjectInput } from "@/lib/validation/project";
import { authorizeProject, assertNotArchived } from "@/server/access";
import { recordAudit } from "@/server/audit";
import { channels, publish } from "@/server/realtime";

export type ProjectListFilter = { q?: string; status?: "active" | "archived" | "all" };

/** Projects the user can see: all for owners/admins, assigned ones otherwise. */
export async function listProjects(
  userId: string,
  workspaceId: string,
  role: WorkspaceRole,
  filter: ProjectListFilter = {},
) {
  const where: Prisma.ProjectWhereInput = {
    workspaceId,
    ...(hasImplicitProjectAccess(role) ? {} : { members: { some: { userId } } }),
    ...(filter.status === "archived"
      ? { status: "ARCHIVED" }
      : filter.status === "all"
        ? {}
        : { status: "ACTIVE" }),
    ...(filter.q
      ? {
          OR: [
            { name: { contains: filter.q, mode: "insensitive" } },
            { clientName: { contains: filter.q, mode: "insensitive" } },
            { description: { contains: filter.q, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  return db.project.findMany({
    where,
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
    select: {
      id: true,
      name: true,
      description: true,
      clientName: true,
      dueDate: true,
      status: true,
      updatedAt: true,
      _count: { select: { assets: { where: { archivedAt: null, versions: { some: { uploadStatus: "READY" } } } }, members: true } },
    },
  });
}

export async function createProject(userId: string, workspaceId: string, input: ProjectInput) {
  await assertWorkspaceAccess(userId, workspaceId, "project.create");
  const project = await db.$transaction(async (tx) => {
    const project = await tx.project.create({
      data: {
        workspaceId,
        name: input.name,
        description: input.description ?? null,
        clientName: input.clientName ?? null,
        dueDate: input.dueDate ?? null,
        // The creator always keeps access, even as a plain member.
        members: { create: { userId } },
      },
      select: { id: true },
    });
    await recordAudit(tx, {
      workspaceId,
      projectId: project.id,
      actorId: userId,
      type: "project.created",
      targetType: "project",
      targetId: project.id,
    });
    return project;
  });
  return project;
}

async function authorizeProjectEdit(userId: string, projectId: string) {
  const context = await authorizeProject({ kind: "member", userId }, projectId);
  if (!context.viewer.role || !can(context.viewer.role, "project.update")) {
    throw new AppError("FORBIDDEN", "You don't have permission to change this project.");
  }
  return context;
}

export async function updateProject(userId: string, projectId: string, input: ProjectInput) {
  const context = await authorizeProjectEdit(userId, projectId);
  assertNotArchived(context);
  await db.$transaction(async (tx) => {
    await tx.project.update({
      where: { id: projectId },
      data: {
        name: input.name,
        description: input.description ?? null,
        clientName: input.clientName ?? null,
        dueDate: input.dueDate ?? null,
      },
    });
    await recordAudit(tx, {
      workspaceId: context.workspaceId,
      projectId,
      actorId: userId,
      type: "project.updated",
      targetType: "project",
      targetId: projectId,
    });
  });
}

/** Archive instead of delete: history, comments and approvals stay intact. */
export async function setProjectArchived(userId: string, projectId: string, archived: boolean) {
  const context = await authorizeProjectEdit(userId, projectId);
  await db.$transaction(async (tx) => {
    await tx.project.update({
      where: { id: projectId },
      data: archived ? { status: "ARCHIVED", archivedAt: new Date() } : { status: "ACTIVE", archivedAt: null },
    });
    await recordAudit(tx, {
      workspaceId: context.workspaceId,
      projectId,
      actorId: userId,
      type: archived ? "project.archived" : "project.restored",
      targetType: "project",
      targetId: projectId,
    });
  });
  await publish(channels.project(projectId), "project.updated");
}

export async function getProject(userId: string, projectId: string) {
  const context = await authorizeProject({ kind: "member", userId }, projectId);
  const project = await db.project.findUniqueOrThrow({
    where: { id: projectId },
    select: {
      id: true,
      name: true,
      description: true,
      clientName: true,
      dueDate: true,
      status: true,
      archivedAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  return { project, context };
}

/** People with access: explicit project members plus owners/admins. */
export async function listProjectPeople(projectId: string, workspaceId: string) {
  const [explicit, managers] = await Promise.all([
    db.projectMember.findMany({
      where: { projectId },
      orderBy: { createdAt: "asc" },
      select: {
        userId: true,
        createdAt: true,
        workspaceMember: { select: { role: true, user: { select: { id: true, name: true, email: true, image: true } } } },
      },
    }),
    db.workspaceMember.findMany({
      where: { workspaceId, role: { in: ["OWNER", "ADMIN"] } },
      select: { role: true, user: { select: { id: true, name: true, email: true, image: true } } },
    }),
  ]);
  const people = new Map<
    string,
    { id: string; name: string; email: string; image: string | null; role: WorkspaceRole; explicit: boolean }
  >();
  for (const m of managers) people.set(m.user.id, { ...m.user, role: m.role, explicit: false });
  for (const m of explicit) {
    people.set(m.userId, { ...m.workspaceMember.user, role: m.workspaceMember.role, explicit: true });
  }
  const order: Record<WorkspaceRole, number> = { OWNER: 0, ADMIN: 1, MEMBER: 2, CLIENT: 3 };
  return [...people.values()].sort((a, b) => order[a.role] - order[b.role] || a.name.localeCompare(b.name));
}

async function authorizeAccessManagement(userId: string, projectId: string) {
  const context = await authorizeProject({ kind: "member", userId }, projectId);
  if (!context.viewer.role || !can(context.viewer.role, "project.members.manage")) {
    throw new AppError("FORBIDDEN", "You don't have permission to manage project access.");
  }
  return context;
}

export async function addProjectMember(actorId: string, projectId: string, userId: string) {
  const context = await authorizeAccessManagement(actorId, projectId);
  const membership = await db.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId: context.workspaceId, userId } },
    select: { id: true },
  });
  if (!membership) throw new AppError("NOT_FOUND", "That person isn't a member of this workspace.");

  await db.$transaction(async (tx) => {
    const existing = await tx.projectMember.findUnique({ where: { projectId_userId: { projectId, userId } } });
    if (existing) return;
    await tx.projectMember.create({ data: { projectId, workspaceId: context.workspaceId, userId } });
    await recordAudit(tx, {
      workspaceId: context.workspaceId,
      projectId,
      actorId,
      type: "project_access.granted",
      targetType: "user",
      targetId: userId,
    });
  });
}

export async function removeProjectMember(actorId: string, projectId: string, userId: string) {
  const context = await authorizeAccessManagement(actorId, projectId);
  await db.$transaction(async (tx) => {
    const { count } = await tx.projectMember.deleteMany({ where: { projectId, userId } });
    if (count === 0) return;
    await recordAudit(tx, {
      workspaceId: context.workspaceId,
      projectId,
      actorId,
      type: "project_access.revoked",
      targetType: "user",
      targetId: userId,
    });
  });
  // Live connections re-check access right away and drop the user.
  await Promise.all([
    publish(channels.project(projectId), "access.changed", { userId }),
    publish(channels.user(userId), "access.changed"),
  ]);
}

/** Workspace members who could be added to the project. */
export async function listAssignableMembers(workspaceId: string, projectId: string) {
  return db.workspaceMember.findMany({
    where: { workspaceId, role: { in: ["MEMBER", "CLIENT"] }, projectAccess: { none: { projectId } } },
    orderBy: { createdAt: "asc" },
    select: { role: true, user: { select: { id: true, name: true, email: true } } },
  });
}

export async function listProjectActivity(projectId: string, take = 50) {
  return db.auditEvent.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
    take,
    select: {
      id: true,
      type: true,
      targetType: true,
      targetId: true,
      metadata: true,
      createdAt: true,
      actor: { select: { id: true, name: true } },
    },
  });
}
