import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { avatarUrl } from "@/lib/avatar";
import { paths } from "@/lib/paths";
import { canCancelReview, canDecideInState, canRequestReview, stateAfterDecision } from "@/lib/review-state";
import { canDecideReview } from "@/lib/authz/permissions";
import { cancelReviewSchema, decideReviewSchema, requestReviewSchema } from "@/lib/validation/review";
import { authorizeProject, authorizeVersion, assertNotArchived, type Actor } from "@/server/access";
import { recordAudit } from "@/server/audit";
import { NotificationOutbox } from "@/server/notifications";
import { channels, publish } from "@/server/realtime";
import { listProjectPeople } from "@/server/project-service";

const personSelect = { id: true, name: true, image: true } as const;

/** Current review, decision history and (for the team) who can approve. */
export async function getReviewInfo(actor: Actor, versionId: string) {
  const context = await authorizeVersion(actor, versionId);
  const [requests, decisions] = await Promise.all([
    db.reviewRequest.findMany({
      where: { versionId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        status: true,
        createdAt: true,
        closedAt: true,
        approver: { select: personSelect },
        requestedBy: { select: personSelect },
      },
    }),
    db.reviewDecision.findMany({
      where: { versionId },
      orderBy: { createdAt: "desc" },
      select: { id: true, decision: true, note: true, createdAt: true, decidedBy: { select: personSelect } },
    }),
  ]);
  const open = requests.find((r) => r.status === "OPEN") ?? null;
  const approvers =
    context.viewer.canRequestReview && !context.viewer.isGuest
      ? (await listProjectPeople(context.projectId, context.workspaceId)).map((p) => ({ id: p.id, name: p.name, role: p.role }))
      : [];

  const person = (p: { id: string; name: string; image: string | null }) => ({ id: p.id, name: p.name, avatarUrl: avatarUrl(p) });
  return {
    reviewState: context.reviewState,
    openRequest: open
      ? { id: open.id, createdAt: open.createdAt.toISOString(), approver: person(open.approver), requestedBy: person(open.requestedBy) }
      : null,
    decisions: decisions.map((d) => ({
      id: d.id,
      decision: d.decision,
      note: d.note,
      createdAt: d.createdAt.toISOString(),
      decidedBy: person(d.decidedBy),
    })),
    cancelled: requests
      .filter((r) => r.status === "CANCELLED")
      .map((r) => ({ id: r.id, closedAt: r.closedAt?.toISOString() ?? null, approver: person(r.approver) })),
    approvers,
    canRequest: context.viewer.canRequestReview && !context.archived,
    canDecide:
      !!open && actor.kind === "member" && canDecideReview({ actorId: actor.userId, approverId: open.approver.id, requestStatus: "OPEN" }),
  };
}

export type ReviewInfo = Awaited<ReturnType<typeof getReviewInfo>>;

async function versionPath(workspaceId: string, projectId: string, assetId: string, versionId: string) {
  const workspace = await db.workspace.findUniqueOrThrow({ where: { id: workspaceId }, select: { slug: true } });
  return paths.asset(workspace.slug, projectId, assetId, { version: versionId });
}

async function versionLabel(versionId: string) {
  const version = await db.assetVersion.findUniqueOrThrow({
    where: { id: versionId },
    select: { versionNumber: true, uploadedById: true, asset: { select: { name: true } } },
  });
  return { label: `${version.asset.name} V${version.versionNumber}`, uploadedById: version.uploadedById };
}

export async function requestReview(userId: string, raw: unknown) {
  const input = requestReviewSchema.parse(raw);
  const context = await authorizeVersion({ kind: "member", userId }, input.versionId);
  if (!context.viewer.canRequestReview) throw new AppError("FORBIDDEN", "Only the team can request a review.");
  assertNotArchived(context);
  const version = await db.assetVersion.findUniqueOrThrow({
    where: { id: input.versionId },
    select: { uploadStatus: true, reviewState: true },
  });
  if (!canRequestReview(version)) {
    throw new AppError("INVALID", version.reviewState === "APPROVED" ? "This version is already approved." : "This version is already in review.");
  }
  try {
    await authorizeProject({ kind: "member", userId: input.approverId }, context.projectId);
  } catch {
    throw new AppError("INVALID", "The approver needs access to this project first.");
  }

  const [{ label }, requester, path] = await Promise.all([
    versionLabel(input.versionId),
    db.user.findUniqueOrThrow({ where: { id: userId }, select: { name: true } }),
    versionPath(context.workspaceId, context.projectId, context.assetId, input.versionId),
  ]);
  const outbox = new NotificationOutbox();
  try {
    await db.$transaction(async (tx) => {
      const request = await tx.reviewRequest.create({
        data: { versionId: input.versionId, approverId: input.approverId, requestedById: userId },
        select: { id: true },
      });
      const { count } = await tx.assetVersion.updateMany({
        where: { id: input.versionId, reviewState: { in: ["DRAFT", "CHANGES_REQUESTED"] } },
        data: { reviewState: "IN_REVIEW" },
      });
      if (count !== 1) throw new AppError("CONFLICT", "This version's review state just changed. Refresh and try again.");

      const common = { workspaceId: context.workspaceId, projectId: context.projectId, actorId: userId };
      await recordAudit(tx, {
        ...common,
        type: "reviewer.assigned",
        targetType: "review_request",
        targetId: request.id,
        metadata: { versionId: input.versionId, approverId: input.approverId, label },
      });
      await recordAudit(tx, {
        ...common,
        type: "review.requested",
        targetType: "review_request",
        targetId: request.id,
        metadata: { versionId: input.versionId, label },
      });
      await outbox.add(tx, {
        type: "REVIEW_REQUESTED",
        workspaceId: context.workspaceId,
        actorId: userId,
        recipientIds: [input.approverId],
        target: { projectId: context.projectId, assetId: context.assetId, versionId: input.versionId, path, label },
        eventKey: request.id,
        email: {
          subject: `Review requested: ${label}`,
          heading: `${requester.name} asked you to review ${label}`,
          body: "Leave comments on the image, then approve this version or request changes.",
          actionLabel: "Open review",
        },
      });
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new AppError("CONFLICT", "This version already has an open review.");
    }
    throw error;
  }
  await outbox.flush();
  await announce(context);
}

export async function cancelReview(userId: string, raw: unknown) {
  const input = cancelReviewSchema.parse(raw);
  const request = await db.reviewRequest.findUnique({ where: { id: input.reviewRequestId }, select: { versionId: true } });
  if (!request) throw new AppError("NOT_FOUND", "Review not found.");
  const context = await authorizeVersion({ kind: "member", userId }, request.versionId);
  if (!context.viewer.canRequestReview) throw new AppError("FORBIDDEN", "Only the team can cancel a review.");
  if (!canCancelReview(context.reviewState)) throw new AppError("INVALID", "This review is no longer open.");
  const { label } = await versionLabel(request.versionId);

  await db.$transaction(async (tx) => {
    const { count } = await tx.reviewRequest.updateMany({
      where: { id: input.reviewRequestId, status: "OPEN" },
      data: { status: "CANCELLED", closedAt: new Date() },
    });
    if (count !== 1) throw new AppError("CONFLICT", "This review was already decided or cancelled.");
    await tx.assetVersion.updateMany({ where: { id: request.versionId, reviewState: "IN_REVIEW" }, data: { reviewState: "DRAFT" } });
    await recordAudit(tx, {
      workspaceId: context.workspaceId,
      projectId: context.projectId,
      actorId: userId,
      type: "review.cancelled",
      targetType: "review_request",
      targetId: input.reviewRequestId,
      metadata: { versionId: request.versionId, label },
    });
  });
  await announce(context);
}

/**
 * Records the designated approver's decision. Both the request and the
 * version move with conditional updates inside one transaction, so of two
 * conflicting decisions arriving together exactly one wins and the other
 * gets a conflict. Decisions are append-only (DB trigger).
 */
export async function decideReview(userId: string, raw: unknown) {
  const input = decideReviewSchema.parse(raw);
  const request = await db.reviewRequest.findUnique({
    where: { id: input.reviewRequestId },
    select: { versionId: true, approverId: true, status: true, requestedById: true },
  });
  if (!request) throw new AppError("NOT_FOUND", "Review not found.");
  // Re-checks that the approver still has access to the project.
  const context = await authorizeVersion({ kind: "member", userId }, request.versionId);
  if (!canDecideReview({ actorId: userId, approverId: request.approverId, requestStatus: request.status })) {
    throw new AppError(
      request.status === "OPEN" ? "FORBIDDEN" : "CONFLICT",
      request.status === "OPEN" ? "Only the designated approver can decide this review." : "This review was already decided or cancelled.",
    );
  }
  if (!canDecideInState(context.reviewState)) throw new AppError("CONFLICT", "This version is not in review.");
  assertNotArchived(context);

  const [{ label, uploadedById }, approver, path] = await Promise.all([
    versionLabel(request.versionId),
    db.user.findUniqueOrThrow({ where: { id: userId }, select: { name: true } }),
    versionPath(context.workspaceId, context.projectId, context.assetId, request.versionId),
  ]);
  const nextState = stateAfterDecision(input.decision);
  const outbox = new NotificationOutbox();

  await db.$transaction(async (tx) => {
    const closed = await tx.reviewRequest.updateMany({
      where: { id: input.reviewRequestId, status: "OPEN", approverId: userId },
      data: { status: "DECIDED", closedAt: new Date() },
    });
    if (closed.count !== 1) throw new AppError("CONFLICT", "This review was already decided or cancelled.");
    const moved = await tx.assetVersion.updateMany({
      where: { id: request.versionId, reviewState: "IN_REVIEW" },
      data: { reviewState: nextState },
    });
    if (moved.count !== 1) throw new AppError("CONFLICT", "This version's review state just changed. Refresh and try again.");

    const decision = await tx.reviewDecision.create({
      data: {
        reviewRequestId: input.reviewRequestId,
        versionId: request.versionId,
        decidedById: userId,
        decision: input.decision,
        note: input.note ?? null,
      },
      select: { id: true },
    });
    await recordAudit(tx, {
      workspaceId: context.workspaceId,
      projectId: context.projectId,
      actorId: userId,
      type: "review.decided",
      targetType: "review_decision",
      targetId: decision.id,
      metadata: { versionId: request.versionId, decision: input.decision, label, note: input.note ?? null },
    });
    await outbox.add(tx, {
      type: input.decision === "APPROVED" ? "VERSION_APPROVED" : "CHANGES_REQUESTED",
      workspaceId: context.workspaceId,
      actorId: userId,
      recipientIds: [request.requestedById, uploadedById],
      target: { projectId: context.projectId, assetId: context.assetId, versionId: request.versionId, path, label },
      eventKey: decision.id,
      email: {
        subject: input.decision === "APPROVED" ? `Approved: ${label}` : `Changes requested: ${label}`,
        heading:
          input.decision === "APPROVED" ? `${approver.name} approved ${label}` : `${approver.name} requested changes on ${label}`,
        body: input.note ?? (input.decision === "APPROVED" ? "This version is signed off." : "See the comments on the image for details."),
        actionLabel: "Open version",
      },
    });
  });
  await outbox.flush();
  await announce(context);
}

async function announce(context: { versionId: string; assetId: string; projectId: string }) {
  await Promise.all([
    publish(channels.version(context.versionId), "review.changed"),
    publish(channels.asset(context.assetId), "review.changed", { versionId: context.versionId }),
    publish(channels.project(context.projectId), "asset.updated", { assetId: context.assetId }),
  ]);
}

/** Open reviews waiting on this user in a workspace (dashboard). */
export async function listPendingReviews(userId: string, workspaceId: string) {
  const requests = await db.reviewRequest.findMany({
    where: {
      approverId: userId,
      status: "OPEN",
      version: { asset: { workspaceId, archivedAt: null, project: { status: "ACTIVE" } } },
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      createdAt: true,
      requestedBy: { select: { name: true } },
      version: {
        select: { id: true, versionNumber: true, asset: { select: { id: true, name: true, projectId: true, project: { select: { name: true } } } } },
      },
    },
  });
  // Drop anything the user lost access to since the request was made.
  const visible = await Promise.all(
    requests.map(async (r) => {
      try {
        await authorizeProject({ kind: "member", userId }, r.version.asset.projectId);
        return r;
      } catch {
        return null;
      }
    }),
  );
  return visible.filter((r) => r !== null);
}
