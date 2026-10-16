import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import { createTestClient, seedTwoWorkspaces } from "./client";
import { cleanupFixtures } from "./cleanup";

let db: PrismaClient;

beforeAll(() => {
  db = createTestClient();
});

afterAll(async () => {
  try { await cleanupFixtures(db); } finally { await db.$disconnect(); }
});

describe("multi-workspace isolation (enforced by the database)", () => {
  it("rejects project access for a user outside the project's workspace", async () => {
    const { alice, workspaceA, workspaceB, projectB } = await seedTwoWorkspaces(db);

    // Claiming workspace A while pointing at B's project breaks the composite FK.
    await expect(
      db.projectMember.create({ data: { projectId: projectB.id, workspaceId: workspaceA.id, userId: alice.id } }),
    ).rejects.toThrow();

    // Correct workspace, but Alice isn't a member of B.
    await expect(
      db.projectMember.create({ data: { projectId: projectB.id, workspaceId: workspaceB.id, userId: alice.id } }),
    ).rejects.toThrow();
  });

  it("rejects an asset whose project belongs to another workspace", async () => {
    const { alice, workspaceA, projectB } = await seedTwoWorkspaces(db);
    await expect(
      db.asset.create({
        data: { projectId: projectB.id, workspaceId: workspaceA.id, name: "Homepage", createdById: alice.id },
      }),
    ).rejects.toThrow();
  });

  it("rejects a share link whose project belongs to another workspace", async () => {
    const { alice, workspaceA, projectB } = await seedTwoWorkspaces(db);
    await expect(
      db.shareLink.create({
        data: { projectId: projectB.id, workspaceId: workspaceA.id, tokenHash: crypto.randomUUID(), createdById: alice.id },
      }),
    ).rejects.toThrow();
  });

  it("revokes project access when the user leaves the workspace", async () => {
    const { bob, workspaceA, projectA } = await seedTwoWorkspaces(db);
    await db.workspaceMember.create({ data: { workspaceId: workspaceA.id, userId: bob.id, role: "CLIENT" } });
    await db.projectMember.create({ data: { projectId: projectA.id, workspaceId: workspaceA.id, userId: bob.id } });

    await db.workspaceMember.delete({ where: { workspaceId_userId: { workspaceId: workspaceA.id, userId: bob.id } } });

    expect(await db.projectMember.count({ where: { projectId: projectA.id, userId: bob.id } })).toBe(0);
  });

  it("rejects duplicate workspace membership", async () => {
    const { alice, workspaceA } = await seedTwoWorkspaces(db);
    await expect(
      db.workspaceMember.create({ data: { workspaceId: workspaceA.id, userId: alice.id, role: "MEMBER" } }),
    ).rejects.toThrow();
  });
});

describe("invitations", () => {
  it("allows only one pending invitation per email per workspace", async () => {
    const { alice, workspaceA } = await seedTwoWorkspaces(db);
    const invite = (tokenHash: string) =>
      db.invitation.create({
        data: {
          workspaceId: workspaceA.id,
          email: "client@test.local",
          role: "CLIENT",
          tokenHash,
          invitedById: alice.id,
          expiresAt: new Date(Date.now() + 60_000),
        },
      });

    const first = await invite(crypto.randomUUID());
    await expect(invite(crypto.randomUUID())).rejects.toThrow();

    // Once revoked, a fresh invitation is fine.
    await db.invitation.update({ where: { id: first.id }, data: { status: "REVOKED", revokedAt: new Date() } });
    await expect(invite(crypto.randomUUID())).resolves.toBeTruthy();
  });
});

describe("versions, pins and reviews", () => {
  async function readyVersion() {
    const fixtures = await seedTwoWorkspaces(db);
    const asset = await db.asset.create({
      data: { projectId: fixtures.projectA.id, workspaceId: fixtures.workspaceA.id, name: "Homepage", createdById: fixtures.alice.id },
    });
    const version = await db.assetVersion.create({
      data: {
        assetId: asset.id,
        versionNumber: 1,
        storagePath: "ws/p/a/v/original.png",
        mimeType: "image/png",
        sizeBytes: 1234,
        width: 1440,
        height: 900,
        uploadStatus: "READY",
        uploadedById: fixtures.alice.id,
      },
    });
    return { ...fixtures, asset, version };
  }

  it("makes a finalized version's file immutable but lets review state change", async () => {
    const { version } = await readyVersion();
    await expect(
      db.assetVersion.update({ where: { id: version.id }, data: { storagePath: "ws/p/a/v/swapped.png" } }),
    ).rejects.toThrow(/immutable/);
    await expect(
      db.assetVersion.update({ where: { id: version.id }, data: { reviewState: "IN_REVIEW" } }),
    ).resolves.toMatchObject({ reviewState: "IN_REVIEW" });
  });

  it("rejects duplicate version numbers on one asset", async () => {
    const { asset, alice } = await readyVersion();
    await expect(
      db.assetVersion.create({
        data: {
          assetId: asset.id,
          versionNumber: 1,
          storagePath: "x",
          mimeType: "image/png",
          sizeBytes: 1,
          width: 1,
          height: 1,
          uploadStatus: "READY",
          uploadedById: alice.id,
        },
      }),
    ).rejects.toThrow();
  });

  it("only accepts normalized pin coordinates", async () => {
    const { version, alice } = await readyVersion();
    const pin = (n: number, x: number, y: number) =>
      db.commentThread.create({
        data: { versionId: version.id, number: n, x, y, createdById: alice.id, clientMutationId: crypto.randomUUID() },
      });
    await expect(pin(1, 0.5, 0.5)).resolves.toBeTruthy();
    await expect(pin(2, 1.2, 0.5)).rejects.toThrow();
    await expect(pin(3, 0.5, -0.01)).rejects.toThrow();
  });

  it("turns a double-submitted thread into a unique-constraint error", async () => {
    const { version, alice } = await readyVersion();
    const clientMutationId = crypto.randomUUID();
    const create = (number: number) =>
      db.commentThread.create({ data: { versionId: version.id, number, x: 0.1, y: 0.1, createdById: alice.id, clientMutationId } });
    await create(1);
    await expect(create(2)).rejects.toThrow();
  });

  it("allows one open review per version and one decision per review", async () => {
    const { version, alice } = await readyVersion();
    const request = await db.reviewRequest.create({
      data: { versionId: version.id, approverId: alice.id, requestedById: alice.id },
    });
    await expect(
      db.reviewRequest.create({ data: { versionId: version.id, approverId: alice.id, requestedById: alice.id } }),
    ).rejects.toThrow();

    const decision = await db.reviewDecision.create({
      data: { reviewRequestId: request.id, versionId: version.id, decidedById: alice.id, decision: "APPROVED" },
    });
    await expect(
      db.reviewDecision.create({
        data: { reviewRequestId: request.id, versionId: version.id, decidedById: alice.id, decision: "CHANGES_REQUESTED" },
      }),
    ).rejects.toThrow();
    await expect(
      db.reviewDecision.update({ where: { id: decision.id }, data: { decision: "CHANGES_REQUESTED" } }),
    ).rejects.toThrow(/append-only/);
  });
});
