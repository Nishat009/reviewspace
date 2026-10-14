import "server-only";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { can, hasImplicitProjectAccess, isTeamRole } from "@/lib/authz/permissions";
import type { WorkspaceRole } from "@/generated/prisma/enums";

/**
 * Who is acting. Members are signed-in users acting through their workspace
 * role; guests reach a single project through a share link (see
 * share-service), may only ever see public threads, and can never approve.
 */
export type Actor =
  | { kind: "member"; userId: string }
  | {
      kind: "guest";
      /** Guest identity, created on first comment; null for pure viewers. */
      userId: string | null;
      shareLinkId: string;
      projectId: string;
      workspaceId: string;
      permission: "VIEW" | "COMMENT";
    };

export type Viewer = {
  userId: string | null;
  role: WorkspaceRole | null;
  isGuest: boolean;
  isTeam: boolean;
  seesInternal: boolean;
  canComment: boolean;
  canResolveAny: boolean;
  canUpload: boolean;
  canRequestReview: boolean;
};

export type ProjectContext = {
  projectId: string;
  workspaceId: string;
  archived: boolean;
  viewer: Viewer;
};

function memberViewer(userId: string, role: WorkspaceRole): Viewer {
  return {
    userId,
    role,
    isGuest: false,
    isTeam: isTeamRole(role),
    seesInternal: can(role, "comment.view_internal"),
    canComment: can(role, "comment.create"),
    canResolveAny: can(role, "thread.resolve_any"),
    canUpload: can(role, "asset.upload"),
    canRequestReview: can(role, "review.request"),
  };
}

function guestViewer(actor: Extract<Actor, { kind: "guest" }>): Viewer {
  return {
    userId: actor.userId,
    role: null,
    isGuest: true,
    isTeam: false,
    seesInternal: false,
    canComment: actor.permission === "COMMENT",
    canResolveAny: false,
    canUpload: false,
    canRequestReview: false,
  };
}

const notFound = (what: string) => new AppError("NOT_FOUND", `${what} not found.`);

/**
 * Project access = workspace membership AND (owner/admin OR explicit project
 * assignment). For guests: the project the share link points at. Missing and
 * forbidden look the same (404) so tenants can't probe for each other.
 */
export async function authorizeProject(actor: Actor, projectId: string): Promise<ProjectContext> {
  if (actor.kind === "guest") {
    if (actor.projectId !== projectId) throw notFound("Project");
    const project = await db.project.findUnique({ where: { id: projectId }, select: { status: true, workspaceId: true } });
    if (!project) throw notFound("Project");
    return { projectId, workspaceId: project.workspaceId, archived: project.status === "ARCHIVED", viewer: guestViewer(actor) };
  }

  const project = await db.project.findUnique({
    where: { id: projectId },
    select: {
      workspaceId: true,
      status: true,
      workspace: { select: { members: { where: { userId: actor.userId }, select: { role: true } } } },
      members: { where: { userId: actor.userId }, select: { id: true } },
    },
  });
  const role = project?.workspace.members[0]?.role;
  if (!project || !role) throw notFound("Project");
  if (!hasImplicitProjectAccess(role) && project.members.length === 0) throw notFound("Project");
  return { projectId, workspaceId: project.workspaceId, archived: project.status === "ARCHIVED", viewer: memberViewer(actor.userId, role) };
}

export type VersionContext = ProjectContext & {
  versionId: string;
  assetId: string;
  uploadStatus: "PENDING" | "READY" | "FAILED";
  reviewState: "DRAFT" | "IN_REVIEW" | "CHANGES_REQUESTED" | "APPROVED";
};

export async function authorizeVersion(actor: Actor, versionId: string): Promise<VersionContext> {
  const version = await db.assetVersion.findUnique({
    where: { id: versionId },
    select: {
      uploadStatus: true,
      reviewState: true,
      asset: { select: { id: true, projectId: true, archivedAt: true } },
    },
  });
  if (!version) throw notFound("Version");
  // Guests never see pending/failed uploads or archived assets.
  if (actor.kind === "guest" && (version.uploadStatus !== "READY" || version.asset.archivedAt)) throw notFound("Version");

  const project = await authorizeProject(actor, version.asset.projectId);
  return {
    ...project,
    versionId,
    assetId: version.asset.id,
    uploadStatus: version.uploadStatus,
    reviewState: version.reviewState,
  };
}

export type ThreadContext = VersionContext & {
  threadId: string;
  visibility: "PUBLIC" | "INTERNAL";
  createdById: string;
  resolved: boolean;
};

/** Internal threads are invisible (404) to anyone outside the team. */
export async function authorizeThread(actor: Actor, threadId: string): Promise<ThreadContext> {
  const thread = await db.commentThread.findUnique({
    where: { id: threadId },
    select: { versionId: true, visibility: true, createdById: true, resolvedAt: true },
  });
  if (!thread) throw notFound("Thread");
  const version = await authorizeVersion(actor, thread.versionId);
  if (thread.visibility === "INTERNAL" && !version.viewer.seesInternal) throw notFound("Thread");
  return {
    ...version,
    threadId,
    visibility: thread.visibility,
    createdById: thread.createdById,
    resolved: thread.resolvedAt !== null,
  };
}

export function assertNotArchived(context: { archived: boolean }) {
  if (context.archived) throw new AppError("INVALID", "This project is archived. Restore it to make changes.");
}

export function assertCanComment(context: ProjectContext) {
  if (!context.viewer.canComment) throw new AppError("FORBIDDEN", "You can view this project but not comment on it.");
  assertNotArchived(context);
}
