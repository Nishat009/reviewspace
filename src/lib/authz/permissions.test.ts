import { describe, expect, it } from "vitest";
import type { WorkspaceRole } from "@/generated/prisma/enums";
import {
  can,
  canDecideReview,
  canManageMember,
  canResolveThread,
  canSeeThread,
  hasImplicitProjectAccess,
  invitableRoles,
  type Action,
} from "./permissions";

const ROLES: WorkspaceRole[] = ["OWNER", "ADMIN", "MEMBER", "CLIENT"];

// The product spec's permission table, row by row.
const EXPECTED: Record<Action, WorkspaceRole[]> = {
  "workspace.settings.update": ["OWNER", "ADMIN"],
  "workspace.ownership.transfer": ["OWNER"],
  "workspace.delete": ["OWNER"],
  "members.view": ["OWNER", "ADMIN", "MEMBER"],
  "members.manage": ["OWNER", "ADMIN"],
  "project.create": ["OWNER", "ADMIN", "MEMBER"],
  "project.update": ["OWNER", "ADMIN", "MEMBER"],
  "project.members.manage": ["OWNER", "ADMIN", "MEMBER"],
  "asset.upload": ["OWNER", "ADMIN", "MEMBER"],
  "comment.create": ["OWNER", "ADMIN", "MEMBER", "CLIENT"],
  "comment.view_internal": ["OWNER", "ADMIN", "MEMBER"],
  "thread.resolve_any": ["OWNER", "ADMIN", "MEMBER"],
  "review.request": ["OWNER", "ADMIN", "MEMBER"],
};

describe("can()", () => {
  for (const [action, allowed] of Object.entries(EXPECTED) as [Action, WorkspaceRole[]][]) {
    for (const role of ROLES) {
      const expected = allowed.includes(role);
      it(`${role} ${expected ? "can" : "cannot"} ${action}`, () => {
        expect(can(role, action)).toBe(expected);
      });
    }
  }
});

describe("client reviewer restrictions", () => {
  it("cannot upload, manage members, or see internal comments", () => {
    expect(can("CLIENT", "asset.upload")).toBe(false);
    expect(can("CLIENT", "members.manage")).toBe(false);
    expect(can("CLIENT", "comment.view_internal")).toBe(false);
    expect(canSeeThread("CLIENT", "INTERNAL")).toBe(false);
    expect(canSeeThread("CLIENT", "PUBLIC")).toBe(true);
  });

  it("needs explicit project assignment", () => {
    expect(hasImplicitProjectAccess("CLIENT")).toBe(false);
    expect(hasImplicitProjectAccess("MEMBER")).toBe(false);
    expect(hasImplicitProjectAccess("ADMIN")).toBe(true);
    expect(hasImplicitProjectAccess("OWNER")).toBe(true);
  });

  it("can resolve only threads they opened", () => {
    expect(canResolveThread("CLIENT", "u1", "u1")).toBe(true);
    expect(canResolveThread("CLIENT", "u1", "u2")).toBe(false);
    expect(canResolveThread("MEMBER", "u1", "u2")).toBe(true);
  });
});

describe("canManageMember()", () => {
  it("lets admins manage non-owners but never owners", () => {
    expect(canManageMember("ADMIN", "MEMBER")).toBe(true);
    expect(canManageMember("ADMIN", "CLIENT", "MEMBER")).toBe(true);
    expect(canManageMember("ADMIN", "OWNER")).toBe(false);
  });

  it("never mints owners outside ownership transfer", () => {
    expect(canManageMember("OWNER", "ADMIN", "OWNER")).toBe(false);
    expect(canManageMember("ADMIN", "MEMBER", "OWNER")).toBe(false);
    expect(invitableRoles("OWNER")).not.toContain("OWNER");
  });

  it("denies members and clients entirely", () => {
    expect(canManageMember("MEMBER", "CLIENT")).toBe(false);
    expect(canManageMember("CLIENT", "CLIENT")).toBe(false);
    expect(invitableRoles("MEMBER")).toEqual([]);
  });
});

describe("canDecideReview()", () => {
  it("allows only the designated approver on an open review", () => {
    expect(canDecideReview({ actorId: "a", approverId: "a", requestStatus: "OPEN" })).toBe(true);
    expect(canDecideReview({ actorId: "b", approverId: "a", requestStatus: "OPEN" })).toBe(false);
  });

  it("rejects decisions on closed reviews (no double decisions)", () => {
    expect(canDecideReview({ actorId: "a", approverId: "a", requestStatus: "DECIDED" })).toBe(false);
    expect(canDecideReview({ actorId: "a", approverId: "a", requestStatus: "CANCELLED" })).toBe(false);
  });
});
