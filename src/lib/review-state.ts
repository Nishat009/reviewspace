import type { DecisionType, ReviewState, UploadStatus } from "@/generated/prisma/enums";

/**
 * Version review state machine. Pure so the transitions can be tested
 * exhaustively; the service layer applies them inside transactions with
 * conditional updates so concurrent requests cannot skip a step.
 *
 *   DRAFT ──request──▶ IN_REVIEW ──approve──▶ APPROVED (final)
 *     ▲                    │
 *     └──────cancel────────┤
 *                          └──request changes──▶ CHANGES_REQUESTED ──request──▶ IN_REVIEW
 */
export const REVIEW_STATE_LABELS: Record<ReviewState, string> = {
  DRAFT: "Draft",
  IN_REVIEW: "In review",
  CHANGES_REQUESTED: "Changes requested",
  APPROVED: "Approved",
};

export function canRequestReview(version: { uploadStatus: UploadStatus; reviewState: ReviewState }) {
  return version.uploadStatus === "READY" && (version.reviewState === "DRAFT" || version.reviewState === "CHANGES_REQUESTED");
}

export function canCancelReview(reviewState: ReviewState) {
  return reviewState === "IN_REVIEW";
}

export function stateAfterDecision(decision: DecisionType): ReviewState {
  return decision === "APPROVED" ? "APPROVED" : "CHANGES_REQUESTED";
}

/** States a version can be in when a decision is recorded. */
export function canDecideInState(reviewState: ReviewState) {
  return reviewState === "IN_REVIEW";
}
