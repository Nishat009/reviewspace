import { describe, expect, it } from "vitest";
import type { ReviewState, UploadStatus } from "@/generated/prisma/enums";
import { canCancelReview, canDecideInState, canRequestReview, stateAfterDecision } from "./review-state";

const STATES: ReviewState[] = ["DRAFT", "IN_REVIEW", "CHANGES_REQUESTED", "APPROVED"];

describe("version review state machine", () => {
  it("allows requesting review only from draft or changes-requested, and only once the upload is ready", () => {
    const allowed = STATES.filter((reviewState) => canRequestReview({ uploadStatus: "READY", reviewState }));
    expect(allowed).toEqual(["DRAFT", "CHANGES_REQUESTED"]);
    for (const uploadStatus of ["PENDING", "FAILED"] as UploadStatus[]) {
      expect(canRequestReview({ uploadStatus, reviewState: "DRAFT" })).toBe(false);
    }
  });

  it("never re-opens an approved version", () => {
    expect(canRequestReview({ uploadStatus: "READY", reviewState: "APPROVED" })).toBe(false);
    expect(canCancelReview("APPROVED")).toBe(false);
    expect(canDecideInState("APPROVED")).toBe(false);
  });

  it("decisions and cancellation apply only while in review", () => {
    expect(STATES.filter(canDecideInState)).toEqual(["IN_REVIEW"]);
    expect(STATES.filter(canCancelReview)).toEqual(["IN_REVIEW"]);
  });

  it("maps decisions to states", () => {
    expect(stateAfterDecision("APPROVED")).toBe("APPROVED");
    expect(stateAfterDecision("CHANGES_REQUESTED")).toBe("CHANGES_REQUESTED");
  });
});
