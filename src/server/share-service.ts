import "server-only";
import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { generateToken, hashToken } from "@/lib/auth/tokens";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { signPayload, verifyPayload } from "@/lib/signed-token";
import { shareLinkSchema } from "@/lib/validation/members";
import { authorizeProject, assertNotArchived, type Actor } from "@/server/access";
import { recordAudit } from "@/server/audit";

/**
 * External review links. Only the SHA-256 of the 256-bit token is stored. A
 * link grants view or comment access to one project — never approval, which
 * needs an identifiable, signed-in reviewer.
 */
const UNLOCK_PURPOSE = "share-unlock";
const GUEST_PURPOSE = "share-guest";
const UNLOCK_TTL = 12 * 60 * 60;
const GUEST_TTL = 30 * 24 * 60 * 60;

const unlockCookie = (linkId: string) => `rs_su_${linkId}`;
const guestCookie = (linkId: string) => `rs_sg_${linkId}`;

async function authorizeShareManagement(userId: string, projectId: string) {
  const context = await authorizeProject({ kind: "member", userId }, projectId);
  if (!context.viewer.isTeam) throw new AppError("FORBIDDEN", "Only the team can manage share links.");
  return context;
}

export async function createShareLink(userId: string, raw: unknown) {
  const input = shareLinkSchema.parse(raw);
  const context = await authorizeShareManagement(userId, input.projectId);
  assertNotArchived(context);
  const token = generateToken();
  const passwordHash = input.password ? await hashPassword(input.password) : null;
  await db.$transaction(async (tx) => {
    const link = await tx.shareLink.create({
      data: {
        projectId: input.projectId,
        workspaceId: context.workspaceId,
        tokenHash: hashToken(token),
        label: input.label ?? null,
        permission: input.permission,
        passwordHash,
        expiresAt: input.expiresInDays > 0 ? new Date(Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000) : null,
        createdById: userId,
      },
      select: { id: true },
    });
    await recordAudit(tx, {
      workspaceId: context.workspaceId,
      projectId: input.projectId,
      actorId: userId,
      type: "share_link.created",
      targetType: "share_link",
      targetId: link.id,
      metadata: { permission: input.permission, label: input.label ?? null },
    });
  });
  // The raw token is shown once; only its hash is kept.
  return { token };
}

export async function listShareLinks(userId: string, projectId: string) {
  await authorizeShareManagement(userId, projectId);
  const links = await db.shareLink.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      label: true,
      permission: true,
      expiresAt: true,
      revokedAt: true,
      createdAt: true,
      passwordHash: true,
      createdBy: { select: { name: true } },
      _count: { select: { guests: true } },
    },
  });
  const now = Date.now();
  return links.map(({ passwordHash, ...link }) => ({
    ...link,
    hasPassword: passwordHash !== null,
    expired: link.expiresAt !== null && link.expiresAt.getTime() <= now,
  }));
}

export async function revokeShareLink(userId: string, linkId: string) {
  const link = await db.shareLink.findUnique({ where: { id: linkId }, select: { projectId: true, revokedAt: true } });
  if (!link) throw new AppError("NOT_FOUND", "Share link not found.");
  const context = await authorizeShareManagement(userId, link.projectId);
  if (link.revokedAt) return;
  await db.$transaction(async (tx) => {
    await tx.shareLink.update({ where: { id: linkId }, data: { revokedAt: new Date() } });
    await recordAudit(tx, {
      workspaceId: context.workspaceId,
      projectId: link.projectId,
      actorId: userId,
      type: "share_link.revoked",
      targetType: "share_link",
      targetId: linkId,
    });
  });
}

export type ShareLinkState =
  | { status: "invalid" }
  | { status: "locked"; linkId: string; projectName: string }
  | {
      status: "ok";
      link: { id: string; projectId: string; workspaceId: string; permission: "VIEW" | "COMMENT"; label: string | null };
      projectName: string;
      clientName: string | null;
      workspaceName: string;
      actor: Extract<Actor, { kind: "guest" }>;
      guestName: string | null;
    };

/**
 * Resolves a share token for the current request: rejects revoked, expired
 * and archived-project links (all look the same: "invalid"), asks for the
 * password when one is set, and attaches the guest identity if the browser
 * has one for this link.
 */
export async function resolveShareLink(token: string | null | undefined): Promise<ShareLinkState> {
  const jar = await cookies();
  return resolveShareLinkWith(token, (name) => jar.get(name)?.value);
}

/** Same as resolveShareLink with an explicit cookie reader (used by tests). */
export async function resolveShareLinkWith(
  token: string | null | undefined,
  readCookie: (name: string) => string | undefined,
): Promise<ShareLinkState> {
  if (!token || token.length > 200) return { status: "invalid" };
  const link = await db.shareLink.findUnique({
    where: { tokenHash: hashToken(token) },
    select: {
      id: true,
      projectId: true,
      workspaceId: true,
      permission: true,
      label: true,
      passwordHash: true,
      expiresAt: true,
      revokedAt: true,
      project: { select: { name: true, clientName: true, status: true, workspace: { select: { name: true } } } },
    },
  });
  if (!link || link.revokedAt || (link.expiresAt && link.expiresAt <= new Date()) || link.project.status !== "ACTIVE") {
    return { status: "invalid" };
  }

  if (link.passwordHash) {
    const unlocked = verifyPayload<{ lid: string }>(UNLOCK_PURPOSE, readCookie(unlockCookie(link.id)));
    if (unlocked?.lid !== link.id) return { status: "locked", linkId: link.id, projectName: link.project.name };
  }

  let guest: { id: string; name: string } | null = null;
  const claims = verifyPayload<{ uid: string; lid: string }>(GUEST_PURPOSE, readCookie(guestCookie(link.id)));
  if (claims?.lid === link.id) {
    guest = await db.user.findFirst({ where: { id: claims.uid, guestShareLinkId: link.id }, select: { id: true, name: true } });
  }

  return {
    status: "ok",
    link: { id: link.id, projectId: link.projectId, workspaceId: link.workspaceId, permission: link.permission, label: link.label },
    projectName: link.project.name,
    clientName: link.project.clientName,
    workspaceName: link.project.workspace.name,
    guestName: guest?.name ?? null,
    actor: {
      kind: "guest",
      userId: guest?.id ?? null,
      shareLinkId: link.id,
      projectId: link.projectId,
      workspaceId: link.workspaceId,
      permission: link.permission,
    },
  };
}

/** For API routes and actions: the guest actor, or a 404-style error. */
export async function requireShareActor(token: string | null | undefined) {
  const state = await resolveShareLink(token);
  if (state.status !== "ok") throw new AppError("NOT_FOUND", "This link is invalid or has expired.");
  return state;
}

export async function unlockShareLink(token: string, password: string) {
  const link = await db.shareLink.findUnique({
    where: { tokenHash: hashToken(token) },
    select: { id: true, passwordHash: true, revokedAt: true, expiresAt: true },
  });
  if (!link || link.revokedAt || (link.expiresAt && link.expiresAt <= new Date())) {
    throw new AppError("NOT_FOUND", "This link is invalid or has expired.");
  }
  if (link.passwordHash && !(await verifyPassword(link.passwordHash, password))) {
    throw new AppError("INVALID", "That password isn't right.");
  }
  (await cookies()).set(unlockCookie(link.id), signPayload(UNLOCK_PURPOSE, { lid: link.id }, UNLOCK_TTL), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: UNLOCK_TTL,
    path: "/",
  });
}

/**
 * Creates (or renames) the guest identity that comments through this link.
 * Guests get a placeholder email on a reserved domain and no password, so
 * they can never sign in or receive mail.
 */
export async function setGuestName(token: string, name: string) {
  const state = await requireShareActor(token);
  if (state.link.permission !== "COMMENT") throw new AppError("FORBIDDEN", "This link is view-only.");

  let guestId = state.actor.userId;
  if (guestId) {
    await db.user.update({ where: { id: guestId }, data: { name } });
  } else {
    const guest = await db.user.create({
      data: { name, email: `guest-${randomBytes(12).toString("hex")}@guest.reviewspace.invalid`, guestShareLinkId: state.link.id },
      select: { id: true },
    });
    guestId = guest.id;
  }
  (await cookies()).set(guestCookie(state.link.id), signPayload(GUEST_PURPOSE, { uid: guestId, lid: state.link.id }, GUEST_TTL), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: GUEST_TTL,
    path: "/",
  });
}
