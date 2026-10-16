import { afterAll, describe, expect, it } from "vitest";
import { cleanupFixtures } from "./cleanup";
import { db } from "@/lib/db";
import { authorizeProject, authorizeThread } from "@/server/access";
import { startUpload } from "@/server/asset-service";
import { createThread, listComments, listMentionCandidates, listThreads, reply } from "@/server/comment-service";
import { changeMemberRole, inviteMember, removeMember, transferOwnership } from "@/server/member-service";
import { addProjectMember } from "@/server/project-service";
import { channels, subscribe, type RealtimeEvent } from "@/server/realtime";
import { decideReview, getReviewInfo, requestReview } from "@/server/review-service";
import { createShareLink, resolveShareLinkWith, revokeShareLink } from "@/server/share-service";
import { createAgency, createUser, expectAppError, member, mutationId, uploadVersion } from "./fixtures";

/**
 * Service-level tests for the behaviours the product spec calls out:
 * isolation, permissions, internal-comment privacy, version integrity,
 * idempotency, sharing security and concurrent decisions.
 */
afterAll(async () => {
  try { await cleanupFixtures(db); } finally { await db.$disconnect(); }
  delete (globalThis as { prisma?: unknown }).prisma;
});

const noCookies = () => undefined;

describe("workspace isolation", () => {
  it("blocks access to another workspace's project and its comments", async () => {
    const a = await createAgency();
    const b = await createAgency();
    const v = await uploadVersion(b.designer.id, b.project.id);

    await expectAppError(authorizeProject(member(a.owner.id), b.project.id), "NOT_FOUND");
    await expectAppError(listThreads(member(a.owner.id), v.versionId), "NOT_FOUND");
    await expectAppError(
      createThread(member(a.owner.id), { versionId: v.versionId, x: 0.5, y: 0.5, body: "hi", clientMutationId: mutationId() }),
      "NOT_FOUND",
    );
  });

  it("hides unassigned projects from members and clients until they are added", async () => {
    const a = await createAgency();
    const other = await db.project.create({ data: { workspaceId: a.workspace.id, name: "Other" } });
    await expectAppError(authorizeProject(member(a.client.id), other.id), "NOT_FOUND");
    await addProjectMember(a.owner.id, other.id, a.client.id);
    await expect(authorizeProject(member(a.client.id), other.id)).resolves.toMatchObject({ projectId: other.id });
  });
});

describe("role permissions", () => {
  it("clients can't upload or manage members; members can't change roles", async () => {
    const a = await createAgency();
    await expectAppError(
      startUpload(a.client.id, { projectId: a.project.id, fileName: "x.png", contentType: "image/png", sizeBytes: 100 }),
      "FORBIDDEN",
    );
    await expectAppError(inviteMember(a.client.id, a.workspace.id, { email: "x@test.local", role: "CLIENT" }), "FORBIDDEN");
    const clientMembership = await db.workspaceMember.findFirstOrThrow({ where: { userId: a.client.id, workspaceId: a.workspace.id } });
    await expectAppError(changeMemberRole(a.designer.id, a.workspace.id, clientMembership.id, "ADMIN"), "FORBIDDEN");
  });

  it("the owner can't be removed; ownership moves only by transfer", async () => {
    const a = await createAgency();
    const ownerMembership = await db.workspaceMember.findFirstOrThrow({ where: { userId: a.owner.id, workspaceId: a.workspace.id } });
    const designerMembership = await db.workspaceMember.findFirstOrThrow({ where: { userId: a.designer.id, workspaceId: a.workspace.id } });
    await expectAppError(removeMember(a.owner.id, a.workspace.id, ownerMembership.id), "INVALID");

    await transferOwnership(a.owner.id, a.workspace.id, designerMembership.id);
    const roles = await db.workspaceMember.findMany({ where: { workspaceId: a.workspace.id, role: "OWNER" } });
    expect(roles.map((r) => r.userId)).toEqual([a.designer.id]);
  });

  it("one pending invitation per email per workspace", async () => {
    const a = await createAgency();
    await inviteMember(a.owner.id, a.workspace.id, { email: "new@test.local", role: "CLIENT" });
    await expectAppError(inviteMember(a.owner.id, a.workspace.id, { email: "NEW@test.local", role: "MEMBER" }), "CONFLICT");
  });
});

describe("internal comments", () => {
  it("never reach a client: not listed, not readable, not repliable, not in realtime", async () => {
    const a = await createAgency();
    const v = await uploadVersion(a.designer.id, a.project.id);
    const events: RealtimeEvent[] = [];
    const unsubscribe = await subscribe(channels.version(v.versionId), (e) => events.push(e));

    const internal = await createThread(member(a.designer.id), {
      versionId: v.versionId,
      x: 0.2,
      y: 0.2,
      body: "Client's budget is tight — keep it simple",
      visibility: "INTERNAL",
      clientMutationId: mutationId(),
    });
    await createThread(member(a.client.id), { versionId: v.versionId, x: 0.5, y: 0.5, body: "Looks good", clientMutationId: mutationId() });
    unsubscribe();

    const teamView = await listThreads(member(a.owner.id), v.versionId);
    const clientView = await listThreads(member(a.client.id), v.versionId);
    expect(teamView).toHaveLength(2);
    expect(clientView.map((t) => t.visibility)).toEqual(["PUBLIC"]);

    await expectAppError(authorizeThread(member(a.client.id), internal.threadId), "NOT_FOUND");
    await expectAppError(listComments(member(a.client.id), internal.threadId), "NOT_FOUND");
    await expectAppError(reply(member(a.client.id), { threadId: internal.threadId, body: "?", clientMutationId: mutationId() }), "NOT_FOUND");

    const internalEvent = events.find((e) => e.data.threadId === internal.threadId);
    expect(internalEvent?.internal).toBe(true);

    const mentionable = await listMentionCandidates(member(a.designer.id), v.versionId, true);
    expect(mentionable.map((m) => m.id)).not.toContain(a.client.id);
  });

  it("clients can't start internal threads", async () => {
    const a = await createAgency();
    const v = await uploadVersion(a.designer.id, a.project.id);
    await expectAppError(
      createThread(member(a.client.id), { versionId: v.versionId, x: 0.1, y: 0.1, body: "x", visibility: "INTERNAL", clientMutationId: mutationId() }),
      "FORBIDDEN",
    );
  });
});

describe("versions", () => {
  it("V1 comments stay on V1", async () => {
    const a = await createAgency();
    const v1 = await uploadVersion(a.designer.id, a.project.id);
    await createThread(member(a.client.id), { versionId: v1.versionId, x: 0.3, y: 0.3, body: "Bigger button", clientMutationId: mutationId() });
    const v2 = await uploadVersion(a.designer.id, a.project.id, { assetId: v1.assetId });
    expect(v2.versionNumber).toBe(2);
    expect(await listThreads(member(a.client.id), v2.versionId)).toHaveLength(0);
    expect(await listThreads(member(a.client.id), v1.versionId)).toHaveLength(1);
  });

  it("assigns unique version numbers under concurrent uploads", async () => {
    const a = await createAgency();
    const v1 = await uploadVersion(a.designer.id, a.project.id);
    const results = await Promise.all([1, 2, 3].map(() => uploadVersion(a.designer.id, a.project.id, { assetId: v1.assetId })));
    expect(results.map((r) => r.versionNumber).sort()).toEqual([2, 3, 4]);
  });

  it("a new version doesn't inherit the previous approval", async () => {
    const a = await createAgency();
    const v1 = await uploadVersion(a.designer.id, a.project.id);
    await requestReview(a.owner.id, { versionId: v1.versionId, approverId: a.client.id });
    const request = await db.reviewRequest.findFirstOrThrow({ where: { versionId: v1.versionId, status: "OPEN" } });
    await decideReview(a.client.id, { reviewRequestId: request.id, decision: "APPROVED" });

    const v2 = await uploadVersion(a.designer.id, a.project.id, { assetId: v1.assetId });
    const info = await getReviewInfo(member(a.client.id), v2.versionId);
    expect(info.reviewState).toBe("DRAFT");
    expect(info.decisions).toHaveLength(0);
    expect((await getReviewInfo(member(a.client.id), v1.versionId)).reviewState).toBe("APPROVED");
  });
});

describe("review decisions", () => {
  it("only the designated approver decides", async () => {
    const a = await createAgency();
    const v = await uploadVersion(a.designer.id, a.project.id);
    await requestReview(a.owner.id, { versionId: v.versionId, approverId: a.client.id });
    const request = await db.reviewRequest.findFirstOrThrow({ where: { versionId: v.versionId, status: "OPEN" } });
    await expectAppError(decideReview(a.owner.id, { reviewRequestId: request.id, decision: "APPROVED" }), "FORBIDDEN");
  });

  it("of two conflicting decisions at once, exactly one wins", async () => {
    const a = await createAgency();
    const v = await uploadVersion(a.designer.id, a.project.id);
    await requestReview(a.owner.id, { versionId: v.versionId, approverId: a.client.id });
    const request = await db.reviewRequest.findFirstOrThrow({ where: { versionId: v.versionId, status: "OPEN" } });

    const results = await Promise.allSettled([
      decideReview(a.client.id, { reviewRequestId: request.id, decision: "APPROVED" }),
      decideReview(a.client.id, { reviewRequestId: request.id, decision: "CHANGES_REQUESTED" }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await db.reviewDecision.count({ where: { reviewRequestId: request.id } })).toBe(1);
  });

  it("a version can't have two open reviews", async () => {
    const a = await createAgency();
    const v = await uploadVersion(a.designer.id, a.project.id);
    await requestReview(a.owner.id, { versionId: v.versionId, approverId: a.client.id });
    await expectAppError(requestReview(a.owner.id, { versionId: v.versionId, approverId: a.client.id }), "INVALID");
  });
});

describe("idempotent comments", () => {
  it("a double-clicked submit creates one thread and one reply", async () => {
    const a = await createAgency();
    const v = await uploadVersion(a.designer.id, a.project.id);
    const input = { versionId: v.versionId, x: 0.4, y: 0.4, body: "Once", clientMutationId: mutationId() };
    const [first, second] = await Promise.all([createThread(member(a.client.id), input), createThread(member(a.client.id), input)]);
    expect(first.threadId).toBe(second.threadId);
    expect(await db.commentThread.count({ where: { versionId: v.versionId } })).toBe(1);

    const replyInput = { threadId: first.threadId, body: "Reply once", clientMutationId: mutationId() };
    await reply(member(a.designer.id), replyInput);
    const again = await reply(member(a.designer.id), replyInput);
    expect(again.duplicate).toBe(true);
    expect(await db.comment.count({ where: { threadId: first.threadId } })).toBe(2);
  });
});

describe("notifications", () => {
  it("notify the thread starter on reply, never the actor", async () => {
    const a = await createAgency();
    const v = await uploadVersion(a.designer.id, a.project.id);
    const t = await createThread(member(a.client.id), { versionId: v.versionId, x: 0.1, y: 0.9, body: "Footer?", clientMutationId: mutationId() });
    await reply(member(a.designer.id), { threadId: t.threadId, body: "On it", clientMutationId: mutationId() });
    expect(await db.notification.count({ where: { userId: a.client.id, type: "THREAD_REPLY" } })).toBe(1);
    expect(await db.notification.count({ where: { userId: a.designer.id, type: "THREAD_REPLY" } })).toBe(0);
  });
});

describe("share links", () => {
  it("revoked and expired links stop working; guests see public threads only", async () => {
    const a = await createAgency();
    const v = await uploadVersion(a.designer.id, a.project.id);
    await createThread(member(a.designer.id), { versionId: v.versionId, x: 0.2, y: 0.2, body: "internal", visibility: "INTERNAL", clientMutationId: mutationId() });
    await createThread(member(a.client.id), { versionId: v.versionId, x: 0.6, y: 0.6, body: "public", clientMutationId: mutationId() });

    const { token } = await createShareLink(a.owner.id, { projectId: a.project.id, permission: "VIEW", expiresInDays: 7 });
    const state = await resolveShareLinkWith(token, noCookies);
    expect(state.status).toBe("ok");
    if (state.status !== "ok") return;
    expect((await listThreads(state.actor, v.versionId)).map((t) => t.preview)).toEqual(["public"]);
    await expectAppError(
      createThread(state.actor, { versionId: v.versionId, x: 0.5, y: 0.5, body: "view-only", clientMutationId: mutationId() }),
      "FORBIDDEN",
    );

    await revokeShareLink(a.owner.id, state.link.id);
    expect((await resolveShareLinkWith(token, noCookies)).status).toBe("invalid");

    const second = await createShareLink(a.owner.id, { projectId: a.project.id, permission: "VIEW", expiresInDays: 1 });
    await db.shareLink.updateMany({ where: { projectId: a.project.id, revokedAt: null }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await resolveShareLinkWith(second.token, noCookies)).status).toBe("invalid");
  });

  it("password-protected links stay locked without the unlock cookie", async () => {
    const a = await createAgency();
    const { token } = await createShareLink(a.owner.id, { projectId: a.project.id, permission: "COMMENT", expiresInDays: 0, password: "secret-123" });
    expect((await resolveShareLinkWith(token, noCookies)).status).toBe("locked");
  });

  it("share links never grant approval", async () => {
    const a = await createAgency();
    const outsider = await createUser("Outsider");
    const v = await uploadVersion(a.designer.id, a.project.id);
    await requestReview(a.owner.id, { versionId: v.versionId, approverId: a.client.id });
    const request = await db.reviewRequest.findFirstOrThrow({ where: { versionId: v.versionId, status: "OPEN" } });
    await expectAppError(decideReview(outsider.id, { reviewRequestId: request.id, decision: "APPROVED" }), "NOT_FOUND");
  });
});
