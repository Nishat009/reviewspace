"use server";

import { refresh } from "next/cache";
import { AppError, type ActionResult } from "@/lib/errors";
import { rateLimit } from "@/lib/rate-limit";
import type { UploadTarget } from "@/lib/storage";
import type { CreateThreadInput, ReplyInput } from "@/lib/validation/review";
import * as comments from "@/server/comment-service";
import * as reviews from "@/server/review-service";
import { requireActor, toActionResult } from "@/server/request-actor";

/**
 * Review mutations. Every action resolves the caller itself (session, or the
 * share link when `shareToken` is given) and the service re-authorizes
 * against the version/thread, so nothing sent by the browser is trusted.
 */
type Result<T = void> = ActionResult & { data?: T };

function assertNotTooFast(actorKey: string) {
  if (!rateLimit(`comment:${actorKey}`, 40, 60_000)) {
    throw new AppError("RATE_LIMITED", "You're commenting very quickly. Wait a moment and try again.");
  }
}

export async function createThreadAction(
  input: CreateThreadInput,
  shareToken?: string | null,
): Promise<Result<{ threadId: string; number: number; duplicate: boolean }>> {
  return toActionResult(async () => {
    const actor = await requireActor(shareToken);
    assertNotTooFast(actor.userId ?? "anon");
    return comments.createThread(actor, input);
  });
}

export async function replyAction(
  input: ReplyInput,
  shareToken?: string | null,
): Promise<Result<{ commentId: string; duplicate: boolean }>> {
  return toActionResult(async () => {
    const actor = await requireActor(shareToken);
    assertNotTooFast(actor.userId ?? "anon");
    return comments.reply(actor, input);
  });
}

export async function editCommentAction(input: { commentId: string; body: string }, shareToken?: string | null): Promise<Result> {
  return toActionResult(async () => comments.editComment(await requireActor(shareToken), input));
}

export async function deleteCommentAction(commentId: string, shareToken?: string | null): Promise<Result> {
  return toActionResult(async () => comments.deleteComment(await requireActor(shareToken), commentId));
}

export async function setThreadResolvedAction(
  input: { threadId: string; resolved: boolean },
  shareToken?: string | null,
): Promise<Result> {
  return toActionResult(async () => comments.setThreadResolved(await requireActor(shareToken), input));
}

export async function toggleReactionAction(input: { commentId: string; emoji: string }, shareToken?: string | null): Promise<Result> {
  return toActionResult(async () => comments.toggleReaction(await requireActor(shareToken), input));
}

export async function startAttachmentUploadAction(
  input: { versionId: string; fileName: string; contentType: string; sizeBytes: number },
  shareToken?: string | null,
): Promise<Result<{ uploadId: string; upload: UploadTarget }>> {
  return toActionResult(async () => comments.startAttachmentUpload(await requireActor(shareToken), input));
}

// Approval needs an identifiable member: share-link guests can never call these.

async function memberId() {
  const actor = await requireActor(null);
  if (actor.kind !== "member") throw new AppError("FORBIDDEN", "Sign in to review.");
  return actor.userId;
}

export async function requestReviewAction(input: { versionId: string; approverId: string }): Promise<Result> {
  const result = await toActionResult(async () => reviews.requestReview(await memberId(), input));
  if (result.ok) refresh();
  return result.ok ? { ok: true, message: "Review requested." } : result;
}

export async function cancelReviewAction(input: { reviewRequestId: string }): Promise<Result> {
  const result = await toActionResult(async () => reviews.cancelReview(await memberId(), input));
  if (result.ok) refresh();
  return result.ok ? { ok: true, message: "Review cancelled." } : result;
}

export async function decideReviewAction(input: {
  reviewRequestId: string;
  decision: "APPROVED" | "CHANGES_REQUESTED";
  note?: string;
}): Promise<Result> {
  const result = await toActionResult(async () => reviews.decideReview(await memberId(), input));
  if (result.ok) refresh();
  return result.ok
    ? { ok: true, message: input.decision === "APPROVED" ? "Version approved." : "Changes requested." }
    : result;
}
