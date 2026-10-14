import { describe, expect, it } from "vitest";
import { canReceive } from "./realtime-filter";

describe("realtime delivery filter", () => {
  it("never sends team-only (internal thread) events to clients or guests", () => {
    expect(canReceive({ type: "thread.changed", internal: true }, false)).toBe(false);
    expect(canReceive({ type: "comment.changed", internal: true }, false)).toBe(false);
  });

  it("sends internal events to the team", () => {
    expect(canReceive({ type: "thread.changed", internal: true }, true)).toBe(true);
  });

  it("sends public events to everyone", () => {
    expect(canReceive({ type: "thread.changed" }, false)).toBe(true);
    expect(canReceive({ type: "review.changed", internal: false }, false)).toBe(true);
  });

  it("keeps access-change signals on the server", () => {
    expect(canReceive({ type: "access.changed" }, true)).toBe(false);
  });
});
