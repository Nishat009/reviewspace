import type { WorkspaceRole } from "@/generated/prisma/enums";

/**
 * Role → capability matrix. This module is pure (no I/O) so the rules can be
 * unit-tested exhaustively; the DB-backed guards in `./guards` load the
 * caller's membership and then ask these functions.
 *
 * Role alone is never enough to touch a project: MEMBER and CLIENT also need
 * a project_members row (see `hasImplicitProjectAccess`).
 */
export type Action =
  | "workspace.settings.update"
  | "workspace.ownership.transfer"
  | "workspace.delete"
  | "members.view"
  | "members.manage"
  | "project.create"
  | "project.update"
  | "project.members.manage"
  | "asset.upload"
  | "comment.create"
  | "comment.view_internal"
  | "thread.resolve_any"
  | "review.request";

const TEAM: readonly WorkspaceRole[] = ["OWNER", "ADMIN", "MEMBER"];
const MANAGERS: readonly WorkspaceRole[] = ["OWNER", "ADMIN"];
const EVERYONE: readonly WorkspaceRole[] = ["OWNER", "ADMIN", "MEMBER", "CLIENT"];

const MATRIX: Record<Action, readonly WorkspaceRole[]> = {
  "workspace.settings.update": MANAGERS, // admins: name/logo only, see canEditWorkspaceField
  "workspace.ownership.transfer": ["OWNER"],
  "workspace.delete": ["OWNER"],
  "members.view": TEAM,
  "members.manage": MANAGERS,
  "project.create": TEAM,
  "project.update": TEAM,
  "project.members.manage": TEAM,
  "asset.upload": TEAM,
  "comment.create": EVERYONE,
  "comment.view_internal": TEAM,
  "thread.resolve_any": TEAM,
  "review.request": TEAM,
};

export function can(role: WorkspaceRole, action: Action): boolean {
  return MATRIX[action].includes(role);
}

export function isTeamRole(role: WorkspaceRole): boolean {
  return TEAM.includes(role);
}

/** Owners and admins see every project in the workspace without assignment. */
export function hasImplicitProjectAccess(role: WorkspaceRole): boolean {
  return MANAGERS.includes(role);
}

export type WorkspaceField = "name" | "logo";
export function canEditWorkspaceField(role: WorkspaceRole, field: WorkspaceField): boolean {
  switch (field) {
    case "name":
    case "logo":
      return MANAGERS.includes(role);
  }
}

/**
 * Who may invite, change or remove whom. Admins manage everyone below owner
 * and can never mint or demote an owner; ownership only moves via transfer.
 */
export function canManageMember(
  actor: WorkspaceRole,
  target: WorkspaceRole,
  nextRole?: WorkspaceRole,
): boolean {
  if (!can(actor, "members.manage")) return false;
  if (nextRole === "OWNER") return false; // use ownership transfer instead
  if (actor === "OWNER") return true;
  return target !== "OWNER";
}

/** Roles an actor may assign when inviting. */
export function invitableRoles(actor: WorkspaceRole): WorkspaceRole[] {
  if (!can(actor, "members.manage")) return [];
  return ["ADMIN", "MEMBER", "CLIENT"];
}

/** Team can resolve any visible thread; clients only threads they opened. */
export function canResolveThread(
  role: WorkspaceRole,
  actorId: string,
  threadCreatorId: string,
): boolean {
  return can(role, "thread.resolve_any") || actorId === threadCreatorId;
}

export function canSeeThread(role: WorkspaceRole, visibility: "PUBLIC" | "INTERNAL"): boolean {
  return visibility === "PUBLIC" || can(role, "comment.view_internal");
}

/**
 * Approval is tied to the designated approver of an open review, never to a
 * role. Holding a share link is not enough: the actor must be a signed-in
 * workspace member.
 */
export function canDecideReview(input: {
  actorId: string;
  approverId: string;
  requestStatus: "OPEN" | "DECIDED" | "CANCELLED";
}): boolean {
  return input.requestStatus === "OPEN" && input.actorId === input.approverId;
}
