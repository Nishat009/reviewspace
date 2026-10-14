import "server-only";
import { Prisma } from "@/generated/prisma/client";
import type { WorkspaceRole } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { assertWorkspaceAccess } from "@/lib/authz/guards";
import { canManageMember, invitableRoles } from "@/lib/authz/permissions";
import { generateToken, hashToken, TOKEN_TTL } from "@/lib/auth/tokens";
import { ROLE_LABELS } from "@/lib/constants";
import { actionEmail, appUrl, sendEmail } from "@/lib/email";
import { paths } from "@/lib/paths";
import { removeObjects } from "@/lib/storage";
import { inviteSchema } from "@/lib/validation/members";
import { recordAudit } from "@/server/audit";
import { NotificationOutbox } from "@/server/notifications";
import { channels, publish } from "@/server/realtime";

const userSelect = { id: true, name: true, email: true, image: true } as const;

export async function listMembers(workspaceId: string) {
  const members = await db.workspaceMember.findMany({
    where: { workspaceId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      role: true,
      createdAt: true,
      user: { select: userSelect },
      projectAccess: { select: { project: { select: { id: true, name: true, status: true } } } },
    },
  });
  const order: Record<WorkspaceRole, number> = { OWNER: 0, ADMIN: 1, MEMBER: 2, CLIENT: 3 };
  return members
    .map((m) => ({ ...m, projects: m.projectAccess.map((p) => p.project) }))
    .sort((a, b) => order[a.role] - order[b.role] || a.createdAt.getTime() - b.createdAt.getTime());
}

export async function listInvitations(workspaceId: string) {
  const invitations = await db.invitation.findMany({
    where: { workspaceId, status: "PENDING" },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      email: true,
      role: true,
      expiresAt: true,
      createdAt: true,
      project: { select: { id: true, name: true } },
      invitedBy: { select: { name: true } },
    },
  });
  const now = Date.now();
  return invitations.map((i) => ({ ...i, expired: i.expiresAt.getTime() <= now }));
}

async function sendInvitationEmail(input: {
  email: string;
  token: string;
  workspaceName: string;
  inviterName: string;
  role: WorkspaceRole;
  projectName: string | null;
}) {
  const what = input.projectName ? `review “${input.projectName}”` : `join ${input.workspaceName}`;
  await sendEmail({
    to: input.email,
    subject: `${input.inviterName} invited you to ${input.workspaceName} on ReviewSpace`,
    ...actionEmail({
      heading: `You're invited to ${what}`,
      body: `${input.inviterName} invited you to ${input.workspaceName} as ${ROLE_LABELS[input.role].toLowerCase()}.`,
      actionLabel: "Accept invitation",
      url: appUrl(paths.invite(input.token)),
      footer: "This invitation expires in 7 days. If you weren't expecting it, you can ignore this email.",
    }),
  });
}

/**
 * Invites an email to the workspace (optionally straight into one project).
 * At most one pending invitation per email per workspace: an expired one is
 * retired first, a live one is a conflict (resend it instead).
 */
export async function inviteMember(actorId: string, workspaceId: string, raw: unknown) {
  const input = inviteSchema.parse(raw);
  const actorRole = await assertWorkspaceAccess(actorId, workspaceId, "members.manage");
  if (!invitableRoles(actorRole).includes(input.role)) throw new AppError("FORBIDDEN", "You can't invite with that role.");

  const [workspace, inviter, project, existingMember] = await Promise.all([
    db.workspace.findUniqueOrThrow({ where: { id: workspaceId }, select: { name: true } }),
    db.user.findUniqueOrThrow({ where: { id: actorId }, select: { name: true } }),
    input.projectId
      ? db.project.findFirst({ where: { id: input.projectId, workspaceId }, select: { id: true, name: true } })
      : Promise.resolve(null),
    db.workspaceMember.findFirst({ where: { workspaceId, user: { email: input.email } }, select: { id: true } }),
  ]);
  if (input.projectId && !project) throw new AppError("NOT_FOUND", "Project not found.");
  if (existingMember) {
    throw new AppError("CONFLICT", "That person is already a member. Add them to the project from its People tab.");
  }

  const token = generateToken();
  const existingUser = await db.user.findUnique({ where: { email: input.email }, select: { id: true, guestShareLinkId: true } });
  const outbox = new NotificationOutbox();
  try {
    await db.$transaction(async (tx) => {
      await tx.invitation.updateMany({
        where: { workspaceId, email: input.email, status: "PENDING", expiresAt: { lte: new Date() } },
        data: { status: "REVOKED", revokedAt: new Date() },
      });
      const invitation = await tx.invitation.create({
        data: {
          workspaceId,
          email: input.email,
          role: input.role,
          projectId: project?.id ?? null,
          tokenHash: hashToken(token),
          invitedById: actorId,
          expiresAt: new Date(Date.now() + TOKEN_TTL.INVITATION),
        },
        select: { id: true },
      });
      await recordAudit(tx, {
        workspaceId,
        projectId: project?.id ?? null,
        actorId,
        type: "member.invited",
        targetType: "invitation",
        targetId: invitation.id,
        metadata: { email: input.email, role: input.role },
      });
      if (existingUser && !existingUser.guestShareLinkId) {
        await outbox.add(tx, {
          type: "WORKSPACE_INVITATION",
          workspaceId,
          actorId,
          recipientIds: [existingUser.id],
          target: { invitationId: invitation.id, path: `/invite/accept/${invitation.id}`, label: workspace.name },
          eventKey: invitation.id,
        });
      }
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new AppError("CONFLICT", "There's already a pending invitation for that email. Resend it instead.");
    }
    throw error;
  }
  await outbox.flush();
  await sendInvitationEmail({
    email: input.email,
    token,
    workspaceName: workspace.name,
    inviterName: inviter.name,
    role: input.role,
    projectName: project?.name ?? null,
  });
}

async function loadInvitationForManager(actorId: string, workspaceId: string, invitationId: string) {
  await assertWorkspaceAccess(actorId, workspaceId, "members.manage");
  const invitation = await db.invitation.findFirst({
    where: { id: invitationId, workspaceId },
    select: { id: true, email: true, role: true, status: true, project: { select: { name: true } }, workspace: { select: { name: true } } },
  });
  if (!invitation) throw new AppError("NOT_FOUND", "Invitation not found.");
  if (invitation.status !== "PENDING") throw new AppError("INVALID", "This invitation is no longer pending.");
  return invitation;
}

/** Issues a fresh link (the old one stops working) and a new 7-day window. */
export async function resendInvitation(actorId: string, workspaceId: string, invitationId: string) {
  const invitation = await loadInvitationForManager(actorId, workspaceId, invitationId);
  const token = generateToken();
  await db.invitation.update({
    where: { id: invitationId },
    data: { tokenHash: hashToken(token), expiresAt: new Date(Date.now() + TOKEN_TTL.INVITATION) },
  });
  const inviter = await db.user.findUniqueOrThrow({ where: { id: actorId }, select: { name: true } });
  await sendInvitationEmail({
    email: invitation.email,
    token,
    workspaceName: invitation.workspace.name,
    inviterName: inviter.name,
    role: invitation.role,
    projectName: invitation.project?.name ?? null,
  });
}

export async function revokeInvitation(actorId: string, workspaceId: string, invitationId: string) {
  await loadInvitationForManager(actorId, workspaceId, invitationId);
  await db.$transaction(async (tx) => {
    const { count } = await tx.invitation.updateMany({
      where: { id: invitationId, status: "PENDING" },
      data: { status: "REVOKED", revokedAt: new Date() },
    });
    if (count !== 1) throw new AppError("INVALID", "This invitation is no longer pending.");
    await recordAudit(tx, { workspaceId, actorId, type: "invitation.revoked", targetType: "invitation", targetId: invitationId });
  });
}

const invitationViewSelect = {
  id: true,
  email: true,
  role: true,
  status: true,
  expiresAt: true,
  workspaceId: true,
  projectId: true,
  workspace: { select: { name: true, slug: true } },
  project: { select: { name: true } },
  invitedBy: { select: { name: true } },
} satisfies Prisma.InvitationSelect;

export type InvitationView = Prisma.InvitationGetPayload<{ select: typeof invitationViewSelect }> & { expired: boolean };

export async function getInvitationByToken(token: string): Promise<InvitationView | null> {
  if (!token || token.length > 200) return null;
  const invitation = await db.invitation.findUnique({ where: { tokenHash: hashToken(token) }, select: invitationViewSelect });
  return invitation ? { ...invitation, expired: invitation.expiresAt.getTime() <= Date.now() } : null;
}

export async function getInvitationForUser(userId: string, invitationId: string): Promise<InvitationView | null> {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true } });
  const invitation = await db.invitation.findFirst({ where: { id: invitationId, email: user.email }, select: invitationViewSelect });
  return invitation ? { ...invitation, expired: invitation.expiresAt.getTime() <= Date.now() } : null;
}

/**
 * Accepts an invitation for the signed-in user. The account email must match
 * the invited address. Accepting through the emailed token proves inbox
 * ownership (and verifies the email); accepting in-app requires an already
 * verified email.
 */
async function accept(userId: string, invitation: InvitationView, viaToken: boolean) {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true, emailVerified: true, name: true } });
  if (user.email !== invitation.email) {
    throw new AppError("FORBIDDEN", `This invitation is for ${invitation.email}. Sign in with that email to accept it.`);
  }
  if (!viaToken && !user.emailVerified) throw new AppError("INVALID", "Verify your email address first, then accept the invitation.");
  if (invitation.status === "ACCEPTED") return invitation.workspace.slug;
  if (invitation.status !== "PENDING") throw new AppError("INVALID", "This invitation was revoked. Ask for a new one.");
  if (invitation.expired) throw new AppError("INVALID", "This invitation has expired. Ask for a new one.");

  await db.$transaction(async (tx) => {
    const { count } = await tx.invitation.updateMany({
      where: { id: invitation.id, status: "PENDING", expiresAt: { gt: new Date() } },
      data: { status: "ACCEPTED", acceptedAt: new Date() },
    });
    if (count !== 1) throw new AppError("INVALID", "This invitation is no longer valid.");
    if (viaToken && !user.emailVerified) await tx.user.update({ where: { id: userId }, data: { emailVerified: new Date() } });

    const membership = await tx.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: invitation.workspaceId, userId } },
      select: { id: true },
    });
    if (!membership) {
      await tx.workspaceMember.create({ data: { workspaceId: invitation.workspaceId, userId, role: invitation.role } });
      await recordAudit(tx, {
        workspaceId: invitation.workspaceId,
        actorId: userId,
        type: "member.joined",
        targetType: "user",
        targetId: userId,
        metadata: { role: invitation.role, name: user.name },
      });
    }
    if (invitation.projectId) {
      await tx.projectMember.upsert({
        where: { projectId_userId: { projectId: invitation.projectId, userId } },
        create: { projectId: invitation.projectId, workspaceId: invitation.workspaceId, userId },
        update: {},
      });
      await recordAudit(tx, {
        workspaceId: invitation.workspaceId,
        projectId: invitation.projectId,
        actorId: userId,
        type: "project_access.granted",
        targetType: "user",
        targetId: userId,
        metadata: { name: user.name, via: "invitation" },
      });
    }
    await tx.notification.updateMany({
      where: { userId, type: "WORKSPACE_INVITATION", readAt: null, target: { path: ["invitationId"], equals: invitation.id } },
      data: { readAt: new Date() },
    });
  });
  return invitation.workspace.slug;
}

export async function acceptInvitationByToken(userId: string, token: string) {
  const invitation = await getInvitationByToken(token);
  if (!invitation) throw new AppError("NOT_FOUND", "This invitation link is invalid.");
  return accept(userId, invitation, true);
}

export async function acceptInvitationById(userId: string, invitationId: string) {
  const invitation = await getInvitationForUser(userId, invitationId);
  if (!invitation) throw new AppError("NOT_FOUND", "Invitation not found.");
  return accept(userId, invitation, false);
}

async function loadTarget(workspaceId: string, memberId: string) {
  const target = await db.workspaceMember.findFirst({
    where: { id: memberId, workspaceId },
    select: { id: true, role: true, userId: true, user: { select: { name: true } } },
  });
  if (!target) throw new AppError("NOT_FOUND", "Member not found.");
  return target;
}

export async function changeMemberRole(actorId: string, workspaceId: string, memberId: string, role: WorkspaceRole) {
  const actorRole = await assertWorkspaceAccess(actorId, workspaceId, "members.manage");
  const target = await loadTarget(workspaceId, memberId);
  if (target.userId === actorId) throw new AppError("INVALID", "You can't change your own role.");
  if (!canManageMember(actorRole, target.role, role)) throw new AppError("FORBIDDEN", "You can't make that change.");
  if (target.role === role) return;
  await db.$transaction(async (tx) => {
    await tx.workspaceMember.update({ where: { id: memberId }, data: { role } });
    await recordAudit(tx, {
      workspaceId,
      actorId,
      type: "member.role_changed",
      targetType: "user",
      targetId: target.userId,
      metadata: { from: target.role, to: role, name: target.user.name },
    });
  });
  await publish(channels.user(target.userId), "access.changed");
}

/**
 * Removing a member cascades away their project access (composite FK). The
 * owner can't be removed: ownership must be transferred first, so a workspace
 * always has exactly one owner.
 */
export async function removeMember(actorId: string, workspaceId: string, memberId: string) {
  const target = await loadTarget(workspaceId, memberId);
  const self = target.userId === actorId;
  if (target.role === "OWNER") throw new AppError("INVALID", "Transfer ownership before the owner can leave.");
  if (!self) {
    const actorRole = await assertWorkspaceAccess(actorId, workspaceId, "members.manage");
    if (!canManageMember(actorRole, target.role)) throw new AppError("FORBIDDEN", "You can't remove this member.");
  }
  await db.$transaction(async (tx) => {
    await tx.workspaceMember.delete({ where: { id: memberId } });
    await tx.reviewRequest.updateMany({
      where: { approverId: target.userId, status: "OPEN", version: { asset: { workspaceId } } },
      data: { status: "CANCELLED", closedAt: new Date() },
    });
    await recordAudit(tx, {
      workspaceId,
      actorId,
      type: "member.removed",
      targetType: "user",
      targetId: target.userId,
      metadata: { name: target.user.name, self },
    });
  });
  // Versions whose only open review was just cancelled go back to draft.
  await db.assetVersion.updateMany({
    where: { reviewState: "IN_REVIEW", asset: { workspaceId }, reviewRequests: { none: { status: "OPEN" } } },
    data: { reviewState: "DRAFT" },
  });
  await publish(channels.user(target.userId), "access.changed");
}

export async function transferOwnership(actorId: string, workspaceId: string, memberId: string) {
  const actorRole = await assertWorkspaceAccess(actorId, workspaceId, "workspace.ownership.transfer");
  if (actorRole !== "OWNER") throw new AppError("FORBIDDEN", "Only the owner can transfer ownership.");
  const target = await loadTarget(workspaceId, memberId);
  if (target.userId === actorId) throw new AppError("INVALID", "You already own this workspace.");
  if (target.role === "CLIENT") throw new AppError("INVALID", "Make this person a team member before transferring ownership.");

  await db.$transaction(async (tx) => {
    // Lock the owner rows so two concurrent transfers can't both succeed.
    await tx.$queryRaw`SELECT id FROM "workspace_members" WHERE "workspaceId" = ${workspaceId} AND role = 'OWNER' FOR UPDATE`;
    const demoted = await tx.workspaceMember.updateMany({
      where: { workspaceId, userId: actorId, role: "OWNER" },
      data: { role: "ADMIN" },
    });
    if (demoted.count !== 1) throw new AppError("CONFLICT", "Ownership already changed.");
    await tx.workspaceMember.update({ where: { id: memberId }, data: { role: "OWNER" } });
    await recordAudit(tx, {
      workspaceId,
      actorId,
      type: "workspace.ownership_transferred",
      targetType: "user",
      targetId: target.userId,
      metadata: { name: target.user.name },
    });
  });
}

export async function updateWorkspaceName(actorId: string, workspaceId: string, name: string) {
  await assertWorkspaceAccess(actorId, workspaceId, "workspace.settings.update");
  await db.$transaction(async (tx) => {
    await tx.workspace.update({ where: { id: workspaceId }, data: { name } });
    await recordAudit(tx, { workspaceId, actorId, type: "workspace.updated", targetType: "workspace", targetId: workspaceId, metadata: { name } });
  });
}

export async function setWorkspaceLogo(actorId: string, workspaceId: string, logoPath: string | null) {
  await assertWorkspaceAccess(actorId, workspaceId, "workspace.settings.update");
  const previous = await db.workspace.findUniqueOrThrow({ where: { id: workspaceId }, select: { logoPath: true } });
  await db.$transaction(async (tx) => {
    await tx.workspace.update({ where: { id: workspaceId }, data: { logoPath } });
    await recordAudit(tx, {
      workspaceId,
      actorId,
      type: "workspace.updated",
      targetType: "workspace",
      targetId: workspaceId,
      metadata: { logo: logoPath ? "updated" : "removed" },
    });
  });
  if (previous.logoPath && previous.logoPath !== logoPath) await removeObjects([previous.logoPath]);
}

/**
 * Permanently deletes a workspace and everything in it, then its files.
 * Owner only, confirmed by typing the workspace name.
 */
export async function deleteWorkspace(actorId: string, workspaceId: string, confirmName: string) {
  await assertWorkspaceAccess(actorId, workspaceId, "workspace.delete");
  const workspace = await db.workspace.findUniqueOrThrow({ where: { id: workspaceId }, select: { name: true, logoPath: true } });
  if (confirmName.trim() !== workspace.name) throw new AppError("INVALID", "Type the workspace name exactly to confirm.");

  const [versions, attachments, guests] = await Promise.all([
    db.assetVersion.findMany({ where: { asset: { workspaceId } }, select: { storagePath: true, thumbnailPath: true } }),
    db.commentAttachment.findMany({ where: { comment: { thread: { version: { asset: { workspaceId } } } } }, select: { storagePath: true } }),
    db.user.findMany({ where: { guestShareLink: { workspaceId } }, select: { id: true } }),
  ]);
  await db.workspace.delete({ where: { id: workspaceId } });
  // Guest identities only ever existed for this workspace's share links.
  if (guests.length > 0) await db.user.deleteMany({ where: { id: { in: guests.map((g) => g.id) }, passwordHash: null } });
  await removeObjects([
    ...versions.flatMap((v) => [v.storagePath, v.thumbnailPath ?? ""]),
    ...attachments.map((a) => a.storagePath),
    workspace.logoPath ?? "",
  ]);
}
