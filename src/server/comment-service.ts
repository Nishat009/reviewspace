import "server-only";
import { randomBytes } from "node:crypto";
import sharp, { type Metadata } from "sharp";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { avatarUrl } from "@/lib/avatar";
import { bodyToPlainText, extractMentionIds } from "@/lib/mentions";
import { paths } from "@/lib/paths";
import type { CommentDTO, CommentPage, MentionCandidate, PersonDTO, ThreadDTO } from "@/lib/review-types";
import { signPayload, verifyPayload } from "@/lib/signed-token";
import {
  EXTENSION_FOR_TYPE,
  MAX_ATTACHMENT_BYTES,
  MAX_IMAGE_DIMENSION,
  createSignedReadUrl,
  createUploadTarget,
  downloadObject,
  removeObjects,
} from "@/lib/storage";
import {
  attachmentUploadSchema,
  createThreadSchema,
  editCommentSchema,
  reactionSchema,
  replySchema,
  resolveThreadSchema,
  type CreateThreadInput,
  type ReplyInput,
} from "@/lib/validation/review";
import {
  assertCanComment,
  authorizeProject,
  authorizeThread,
  authorizeVersion,
  type Actor,
  type Viewer,
} from "@/server/access";
import { NotificationOutbox, type NotificationEvent } from "@/server/notifications";
import { channels, publish } from "@/server/realtime";

const COMMENT_PAGE_SIZE = 30;
const ATTACHMENT_PURPOSE = "comment-attachment";

const personSelect = { id: true, name: true, image: true, guestShareLinkId: true } as const;
type PersonRow = { id: string; name: string; image: string | null; guestShareLinkId: string | null };

function toPerson(user: PersonRow): PersonDTO {
  return { id: user.id, name: user.name, avatarUrl: avatarUrl(user), isGuest: user.guestShareLinkId !== null };
}

function requireIdentity(actor: Actor) {
  if (!actor.userId) throw new AppError("INVALID", "Tell us your name before commenting.");
  return actor.userId;
}

function canResolve(viewer: Viewer, createdById: string) {
  return viewer.canComment && (viewer.canResolveAny || (viewer.userId !== null && viewer.userId === createdById));
}

const isUniqueViolation = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";

// ─── Reads ───────────────────────────────────────────────────────────────────

export async function listThreads(actor: Actor, versionId: string): Promise<ThreadDTO[]> {
  const context = await authorizeVersion(actor, versionId);
  const threads = await db.commentThread.findMany({
    where: { versionId, ...(context.viewer.seesInternal ? {} : { visibility: "PUBLIC" }) },
    orderBy: { number: "asc" },
    select: {
      id: true,
      number: true,
      x: true,
      y: true,
      visibility: true,
      createdById: true,
      createdAt: true,
      updatedAt: true,
      resolvedAt: true,
      clientMutationId: true,
      createdBy: { select: personSelect },
      resolvedBy: { select: personSelect },
      comments: { orderBy: { createdAt: "asc" }, take: 1, select: { body: true, deletedAt: true } },
      _count: { select: { comments: { where: { deletedAt: null } } } },
    },
  });
  return threads.map((t) => ({
    id: t.id,
    number: t.number,
    x: t.x,
    y: t.y,
    visibility: t.visibility,
    createdBy: toPerson(t.createdBy),
    createdAt: t.createdAt.toISOString(),
    resolvedAt: t.resolvedAt?.toISOString() ?? null,
    resolvedBy: t.resolvedBy ? toPerson(t.resolvedBy) : null,
    clientMutationId: t.clientMutationId,
    preview: t.comments[0] && !t.comments[0].deletedAt ? bodyToPlainText(t.comments[0].body).slice(0, 140) : null,
    commentCount: t._count.comments,
    lastActivityAt: t.updatedAt.toISOString(),
    canResolve: canResolve(context.viewer, t.createdById),
  }));
}

const commentSelect = {
  id: true,
  threadId: true,
  body: true,
  authorId: true,
  createdAt: true,
  editedAt: true,
  deletedAt: true,
  clientMutationId: true,
  author: { select: personSelect },
  reactions: { select: { emoji: true, userId: true, user: { select: { name: true } } } },
  attachments: { select: { id: true, fileName: true, width: true, height: true, storagePath: true } },
} satisfies Prisma.CommentSelect;
type CommentRow = Prisma.CommentGetPayload<{ select: typeof commentSelect }>;

async function toCommentDTO(comment: CommentRow, viewer: Viewer): Promise<CommentDTO> {
  const deleted = comment.deletedAt !== null;
  const reactions = new Map<string, { count: number; mine: boolean; names: string[] }>();
  for (const r of comment.reactions) {
    const entry = reactions.get(r.emoji) ?? { count: 0, mine: false, names: [] };
    entry.count += 1;
    entry.mine ||= r.userId === viewer.userId;
    entry.names.push(r.user.name);
    reactions.set(r.emoji, entry);
  }
  return {
    id: comment.id,
    threadId: comment.threadId,
    body: deleted ? null : comment.body,
    author: toPerson(comment.author),
    createdAt: comment.createdAt.toISOString(),
    editedAt: comment.editedAt?.toISOString() ?? null,
    deletedAt: comment.deletedAt?.toISOString() ?? null,
    clientMutationId: comment.clientMutationId,
    reactions: [...reactions].map(([emoji, r]) => ({ emoji, ...r })),
    attachments: deleted
      ? []
      : await Promise.all(
          comment.attachments.map(async (a) => ({
            id: a.id,
            fileName: a.fileName,
            width: a.width,
            height: a.height,
            url: await createSignedReadUrl(a.storagePath).catch(() => null),
          })),
        ),
    canEdit: !deleted && viewer.canComment && viewer.userId === comment.authorId,
  };
}

/** Newest-first pages; the client shows them oldest-first. */
export async function listComments(actor: Actor, threadId: string, cursor?: string | null): Promise<CommentPage> {
  const context = await authorizeThread(actor, threadId);
  const rows = await db.comment.findMany({
    where: { threadId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: COMMENT_PAGE_SIZE + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: commentSelect,
  });
  const hasMore = rows.length > COMMENT_PAGE_SIZE;
  const page = hasMore ? rows.slice(0, COMMENT_PAGE_SIZE) : rows;
  return {
    comments: await Promise.all(page.map((c) => toCommentDTO(c, context.viewer))),
    nextCursor: hasMore ? page[page.length - 1]!.id : null,
  };
}

/** People who can be @mentioned on a version (internal threads: team only). */
export async function listMentionCandidates(
  actor: Actor,
  versionId: string,
  internal: boolean,
): Promise<MentionCandidate[]> {
  const context = await authorizeVersion(actor, versionId);
  if (context.viewer.isGuest) return [];
  const members = await db.workspaceMember.findMany({
    where: accessibleMembersWhere(context.workspaceId, context.projectId, internal),
    orderBy: { createdAt: "asc" },
    select: { user: { select: { id: true, name: true, email: true } } },
  });
  return members.map((m) => ({ id: m.user.id, name: m.user.name, email: context.viewer.isTeam ? m.user.email : null }));
}

function accessibleMembersWhere(workspaceId: string, projectId: string, teamOnly: boolean): Prisma.WorkspaceMemberWhereInput {
  return {
    workspaceId,
    AND: [
      { OR: [{ role: { in: ["OWNER", "ADMIN"] } }, { projectAccess: { some: { projectId } } }] },
      teamOnly ? { role: { in: ["OWNER", "ADMIN", "MEMBER"] } } : {},
    ],
  };
}

/** Filters user ids down to those who can see a thread. */
async function filterThreadAudience(
  context: { workspaceId: string; projectId: string; visibility: "PUBLIC" | "INTERNAL" },
  userIds: string[],
) {
  if (userIds.length === 0) return [];
  const members = await db.workspaceMember.findMany({
    where: {
      ...accessibleMembersWhere(context.workspaceId, context.projectId, context.visibility === "INTERNAL"),
      userId: { in: userIds },
    },
    select: { userId: true },
  });
  return members.map((m) => m.userId);
}

// ─── Attachments ─────────────────────────────────────────────────────────────

export async function startAttachmentUpload(actor: Actor, raw: unknown) {
  const input = attachmentUploadSchema.parse(raw);
  if (input.sizeBytes > MAX_ATTACHMENT_BYTES) throw new AppError("INVALID", "Attachments must be 5 MB or smaller.");
  const context = await authorizeVersion(actor, input.versionId);
  assertCanComment(context);
  const userId = requireIdentity(actor);

  const storagePath = `${context.workspaceId}/${context.projectId}/attachments/${randomBytes(16).toString("hex")}.${EXTENSION_FOR_TYPE[input.contentType]}`;
  const upload = await createUploadTarget(storagePath, input.contentType, MAX_ATTACHMENT_BYTES);
  const uploadId = signPayload(
    ATTACHMENT_PURPOSE,
    { p: storagePath, v: input.versionId, u: userId, n: input.fileName },
    60 * 60,
  );
  return { uploadId, upload };
}

type ResolvedAttachment = { storagePath: string; fileName: string; mimeType: string; sizeBytes: number; width: number; height: number };

const FORMAT_TYPES: Record<string, string> = { png: "image/png", jpeg: "image/jpeg", webp: "image/webp" };

async function resolveAttachments(userId: string, versionId: string, refs: { uploadId: string }[]) {
  const resolved: ResolvedAttachment[] = [];
  for (const ref of refs) {
    const claims = verifyPayload<{ p: string; v: string; u: string; n: string }>(ATTACHMENT_PURPOSE, ref.uploadId);
    if (!claims || claims.u !== userId || claims.v !== versionId) {
      throw new AppError("INVALID", "An attachment expired. Remove it and attach it again.");
    }
    const file = await downloadObject(claims.p);
    if (!file) throw new AppError("INVALID", "An attachment didn't finish uploading. Try again.");
    let meta: Metadata | null = null;
    try {
      meta = await sharp(file, { limitInputPixels: MAX_IMAGE_DIMENSION * MAX_IMAGE_DIMENSION }).metadata();
    } catch {
      meta = null;
    }
    const mimeType = meta?.format ? FORMAT_TYPES[meta.format] : undefined;
    if (!meta || !mimeType || !meta.width || !meta.height || file.byteLength > MAX_ATTACHMENT_BYTES) {
      await removeObjects([claims.p]);
      throw new AppError("INVALID", "Attachments must be PNG, JPEG or WebP images up to 5 MB.");
    }
    resolved.push({ storagePath: claims.p, fileName: claims.n, mimeType, sizeBytes: file.byteLength, width: meta.width, height: meta.height });
  }
  return resolved;
}

// ─── Writes ──────────────────────────────────────────────────────────────────
//
// Reads (audiences, names, links) happen before each transaction; inside it
// there are only writes through `tx`. Reading through another connection
// mid-transaction wastes a pool slot and deadlocks single-connection servers.

async function workspaceSlug(workspaceId: string) {
  return (await db.workspace.findUniqueOrThrow({ where: { id: workspaceId }, select: { slug: true } })).slug;
}

function threadPath(slug: string, context: { projectId: string; assetId: string; versionId: string }, threadId: string) {
  return paths.asset(slug, context.projectId, context.assetId, { version: context.versionId, thread: threadId });
}

function mentionEvent(input: {
  context: { workspaceId: string; projectId: string; assetId: string; versionId: string };
  threadId: string;
  path: string;
  actor: { id: string; name: string };
  commentId: string;
  body: string;
  recipients: string[];
  label: string;
}): NotificationEvent | null {
  if (input.recipients.length === 0) return null;
  const { context } = input;
  return {
    type: "MENTION",
    workspaceId: context.workspaceId,
    actorId: input.actor.id,
    recipientIds: input.recipients,
    target: {
      projectId: context.projectId,
      assetId: context.assetId,
      versionId: context.versionId,
      threadId: input.threadId,
      path: input.path,
      label: input.label,
    },
    eventKey: input.commentId,
    email: {
      subject: `${input.actor.name} mentioned you in a comment`,
      heading: `${input.actor.name} mentioned you`,
      body: bodyToPlainText(input.body).slice(0, 400),
      actionLabel: "Open comment",
    },
  };
}

async function versionLabel(versionId: string) {
  const version = await db.assetVersion.findUniqueOrThrow({
    where: { id: versionId },
    select: { versionNumber: true, asset: { select: { name: true } } },
  });
  return `${version.asset.name} V${version.versionNumber}`;
}

async function actorName(userId: string) {
  return (await db.user.findUniqueOrThrow({ where: { id: userId }, select: { name: true } })).name;
}

/**
 * Creates a pinned thread with its first comment. Idempotent per
 * (author, clientMutationId): a double-clicked or retried submit returns the
 * thread created the first time instead of a duplicate.
 */
export async function createThread(actor: Actor, raw: CreateThreadInput) {
  const input = createThreadSchema.parse(raw);
  const context = await authorizeVersion(actor, input.versionId);
  assertCanComment(context);
  if (context.uploadStatus !== "READY") throw new AppError("INVALID", "This version isn't ready for comments yet.");
  if (input.visibility === "INTERNAL" && !context.viewer.isTeam) {
    throw new AppError("FORBIDDEN", "Only the team can start internal threads.");
  }
  const userId = requireIdentity(actor);

  const existing = await db.commentThread.findUnique({
    where: { createdById_clientMutationId: { createdById: userId, clientMutationId: input.clientMutationId } },
    select: { id: true, number: true },
  });
  if (existing) return { threadId: existing.id, number: existing.number, duplicate: true };

  const attachments = await resolveAttachments(userId, input.versionId, input.attachments);
  const [name, slug, label, mentioned] = await Promise.all([
    actorName(userId),
    workspaceSlug(context.workspaceId),
    versionLabel(input.versionId),
    context.viewer.isGuest
      ? Promise.resolve([])
      : filterThreadAudience({ ...context, visibility: input.visibility }, extractMentionIds(input.body)),
  ]);
  const outbox = new NotificationOutbox();

  let thread: { id: string; number: number };
  try {
    thread = await db.$transaction(async (tx) => {
      const version = await tx.assetVersion.update({
        where: { id: input.versionId },
        data: { threadCounter: { increment: 1 } },
        select: { threadCounter: true },
      });
      const created = await tx.commentThread.create({
        data: {
          versionId: input.versionId,
          number: version.threadCounter,
          x: input.x,
          y: input.y,
          visibility: input.visibility,
          createdById: userId,
          clientMutationId: input.clientMutationId,
          comments: {
            create: {
              authorId: userId,
              body: input.body,
              clientMutationId: input.clientMutationId,
              attachments: { create: attachments },
            },
          },
        },
        select: { id: true, number: true, comments: { select: { id: true } } },
      });
      const event = mentionEvent({
        context,
        threadId: created.id,
        path: threadPath(slug, context, created.id),
        actor: { id: userId, name },
        commentId: created.comments[0]!.id,
        body: input.body,
        recipients: mentioned,
        label: `${label} · #${created.number}`,
      });
      if (event) await outbox.add(tx, event);
      return { id: created.id, number: created.number };
    });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const winner = await db.commentThread.findUnique({
      where: { createdById_clientMutationId: { createdById: userId, clientMutationId: input.clientMutationId } },
      select: { id: true, number: true },
    });
    if (!winner) throw error;
    await removeObjects(attachments.map((a) => a.storagePath));
    return { threadId: winner.id, number: winner.number, duplicate: true };
  }

  await outbox.flush();
  await publish(channels.version(input.versionId), "thread.changed", { threadId: thread.id }, { internal: input.visibility === "INTERNAL" });
  return { threadId: thread.id, number: thread.number, duplicate: false };
}

/** Replies stay in the thread's visibility: internal threads stay internal. */
export async function reply(actor: Actor, raw: ReplyInput) {
  const input = replySchema.parse(raw);
  const context = await authorizeThread(actor, input.threadId);
  assertCanComment(context);
  const userId = requireIdentity(actor);

  const existing = await db.comment.findUnique({
    where: { authorId_clientMutationId: { authorId: userId, clientMutationId: input.clientMutationId } },
    select: { id: true },
  });
  if (existing) return { commentId: existing.id, duplicate: true };

  const attachments = await resolveAttachments(userId, context.versionId, input.attachments);
  const participants = await db.comment.findMany({
    where: { threadId: input.threadId, deletedAt: null },
    distinct: ["authorId"],
    select: { authorId: true },
  });
  const [name, slug, label, threadNumber, mentioned, audience] = await Promise.all([
    actorName(userId),
    workspaceSlug(context.workspaceId),
    versionLabel(context.versionId),
    db.commentThread.findUniqueOrThrow({ where: { id: input.threadId }, select: { number: true } }).then((t) => t.number),
    context.viewer.isGuest ? Promise.resolve([]) : filterThreadAudience(context, extractMentionIds(input.body)),
    filterThreadAudience(context, [context.createdById, ...participants.map((p) => p.authorId)]),
  ]);
  const path = threadPath(slug, context, context.threadId);
  const threadLabel = `${label} · #${threadNumber}`;
  // One notification per person per event: mentions win over "replied".
  const replyRecipients = audience.filter((id) => !mentioned.includes(id));
  const outbox = new NotificationOutbox();

  let commentId: string;
  try {
    commentId = await db.$transaction(async (tx) => {
      const comment = await tx.comment.create({
        data: {
          threadId: input.threadId,
          authorId: userId,
          body: input.body,
          clientMutationId: input.clientMutationId,
          attachments: { create: attachments },
        },
        select: { id: true },
      });
      await tx.commentThread.update({ where: { id: input.threadId }, data: { updatedAt: new Date() } });

      const mention = mentionEvent({
        context,
        threadId: context.threadId,
        path,
        actor: { id: userId, name },
        commentId: comment.id,
        body: input.body,
        recipients: mentioned,
        label: threadLabel,
      });
      if (mention) await outbox.add(tx, mention);
      if (replyRecipients.length > 0) {
        await outbox.add(tx, {
          type: "THREAD_REPLY",
          workspaceId: context.workspaceId,
          actorId: userId,
          recipientIds: replyRecipients,
          target: {
            projectId: context.projectId,
            assetId: context.assetId,
            versionId: context.versionId,
            threadId: context.threadId,
            path,
            label: threadLabel,
          },
          eventKey: comment.id,
          email: {
            subject: `${name} replied to a comment`,
            heading: `${name} replied`,
            body: bodyToPlainText(input.body).slice(0, 400),
            actionLabel: "Open thread",
          },
        });
      }
      return comment.id;
    });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const winner = await db.comment.findUnique({
      where: { authorId_clientMutationId: { authorId: userId, clientMutationId: input.clientMutationId } },
      select: { id: true },
    });
    if (!winner) throw error;
    await removeObjects(attachments.map((a) => a.storagePath));
    return { commentId: winner.id, duplicate: true };
  }

  await outbox.flush();
  await publish(
    channels.version(context.versionId),
    "comment.changed",
    { threadId: context.threadId, commentId },
    { internal: context.visibility === "INTERNAL" },
  );
  return { commentId, duplicate: false };
}

async function loadOwnComment(actor: Actor, commentId: string) {
  const comment = await db.comment.findUnique({
    where: { id: commentId },
    select: { id: true, threadId: true, authorId: true, body: true, deletedAt: true, attachments: { select: { storagePath: true } } },
  });
  if (!comment) throw new AppError("NOT_FOUND", "Comment not found.");
  const context = await authorizeThread(actor, comment.threadId);
  assertCanComment(context);
  if (comment.authorId !== actor.userId) throw new AppError("FORBIDDEN", "You can only change your own comments.");
  if (comment.deletedAt) throw new AppError("INVALID", "This comment was deleted.");
  return { comment, context };
}

export async function editComment(actor: Actor, raw: unknown) {
  const input = editCommentSchema.parse(raw);
  const { comment, context } = await loadOwnComment(actor, input.commentId);
  if (comment.body === input.body) return;

  // Only people newly mentioned by the edit get notified.
  const before = new Set(extractMentionIds(comment.body));
  const added = context.viewer.isGuest ? [] : extractMentionIds(input.body).filter((id) => !before.has(id));
  const [name, slug, label, mentioned] = await Promise.all([
    actorName(actor.userId!),
    workspaceSlug(context.workspaceId),
    versionLabel(context.versionId),
    filterThreadAudience(context, added),
  ]);
  const outbox = new NotificationOutbox();
  await db.$transaction(async (tx) => {
    await tx.comment.update({ where: { id: comment.id }, data: { body: input.body, editedAt: new Date() } });
    const event = mentionEvent({
      context,
      threadId: context.threadId,
      path: threadPath(slug, context, context.threadId),
      actor: { id: actor.userId!, name },
      commentId: comment.id,
      body: input.body,
      recipients: mentioned,
      label,
    });
    if (event) await outbox.add(tx, event);
  });
  await outbox.flush();
  await publish(
    channels.version(context.versionId),
    "comment.changed",
    { threadId: context.threadId, commentId: comment.id },
    { internal: context.visibility === "INTERNAL" },
  );
}

/** Soft delete: the thread keeps its shape, the text and files are gone. */
export async function deleteComment(actor: Actor, commentId: string) {
  const { comment, context } = await loadOwnComment(actor, commentId);
  await db.$transaction([
    db.comment.update({ where: { id: comment.id }, data: { body: "", deletedAt: new Date() } }),
    db.commentAttachment.deleteMany({ where: { commentId: comment.id } }),
    db.commentReaction.deleteMany({ where: { commentId: comment.id } }),
  ]);
  await removeObjects(comment.attachments.map((a) => a.storagePath));
  await publish(
    channels.version(context.versionId),
    "comment.changed",
    { threadId: context.threadId, commentId: comment.id },
    { internal: context.visibility === "INTERNAL" },
  );
}

export async function setThreadResolved(actor: Actor, raw: unknown) {
  const input = resolveThreadSchema.parse(raw);
  const context = await authorizeThread(actor, input.threadId);
  assertCanComment(context);
  if (!canResolve(context.viewer, context.createdById)) {
    throw new AppError("FORBIDDEN", "You can only resolve threads you started.");
  }
  // Conditional update: two people resolving at once is a no-op, not an error.
  await db.commentThread.updateMany({
    where: { id: input.threadId, resolvedAt: input.resolved ? null : { not: null } },
    data: input.resolved
      ? { resolvedAt: new Date(), resolvedById: actor.userId }
      : { resolvedAt: null, resolvedById: null },
  });
  await publish(
    channels.version(context.versionId),
    "thread.changed",
    { threadId: input.threadId },
    { internal: context.visibility === "INTERNAL" },
  );
}

export async function toggleReaction(actor: Actor, raw: unknown) {
  const input = reactionSchema.parse(raw);
  const comment = await db.comment.findUnique({ where: { id: input.commentId }, select: { threadId: true, deletedAt: true } });
  if (!comment || comment.deletedAt) throw new AppError("NOT_FOUND", "Comment not found.");
  const context = await authorizeThread(actor, comment.threadId);
  assertCanComment(context);
  const userId = requireIdentity(actor);

  const { count } = await db.commentReaction.deleteMany({ where: { commentId: input.commentId, userId, emoji: input.emoji } });
  if (count === 0) {
    try {
      await db.commentReaction.create({ data: { commentId: input.commentId, userId, emoji: input.emoji } });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
    }
  }
  await publish(
    channels.version(context.versionId),
    "comment.changed",
    { threadId: context.threadId, commentId: input.commentId },
    { internal: context.visibility === "INTERNAL" },
  );
}

/** Unresolved public threads of earlier versions, for the "previous feedback" link. */
export async function countOpenThreadsByVersion(actor: Actor, projectId: string, versionIds: string[]) {
  const context = await authorizeProject(actor, projectId);
  const rows = await db.commentThread.groupBy({
    by: ["versionId"],
    where: {
      versionId: { in: versionIds },
      resolvedAt: null,
      ...(context.viewer.seesInternal ? {} : { visibility: "PUBLIC" }),
    },
    _count: { _all: true },
  });
  return new Map(rows.map((r) => [r.versionId, r._count._all]));
}
