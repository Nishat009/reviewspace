/**
 * Demo data for the portfolio walkthrough: "Travel Website Redesign" with an
 * agency owner, a designer and a client reviewer.
 *
 *   pnpm db:seed
 *
 * Runs through the real service layer (uploads are validated and
 * thumbnailed, comments and decisions go through the same permission checks
 * as the app), so the seed doubles as an end-to-end check of the backend.
 * Re-running replaces the demo workspace and demo users; nothing else is touched.
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { uploadObject } from "@/lib/storage";
import { finalizeUpload, startUpload } from "@/server/asset-service";
import { createThread, reply, setThreadResolved } from "@/server/comment-service";
import { deleteWorkspace } from "@/server/member-service";
import { createProject, setProjectArchived } from "@/server/project-service";
import { decideReview, requestReview } from "@/server/review-service";
import { createWorkspaceWithProject } from "@/server/workspace-service";
import { mentionMarkup } from "@/lib/mentions";
import { checkoutSvg, homepageSvg, renderPng } from "./seed-images";

export const DEMO_PASSWORD = "reviewspace-demo";
const WORKSPACE_NAME = "Northwind Studio";
const PEOPLE = {
  owner: { name: "Nadia Rahman", email: "owner@demo.reviewspace.test" },
  designer: { name: "Rafi Hasan", email: "designer@demo.reviewspace.test" },
  client: { name: "Sara Ahmed", email: "client@demo.reviewspace.test" },
};

const member = (userId: string) => ({ kind: "member" as const, userId });
const mutationId = () => randomUUID();

async function reset() {
  const existing = await db.workspace.findMany({
    where: { members: { some: { role: "OWNER", user: { email: PEOPLE.owner.email } } } },
    select: { id: true, name: true, members: { where: { role: "OWNER" }, select: { userId: true } } },
  });
  for (const workspace of existing) {
    await deleteWorkspace(workspace.members[0]!.userId, workspace.id, workspace.name);
  }
  const emails = Object.values(PEOPLE).map((p) => p.email);
  await db.notification.deleteMany({ where: { user: { email: { in: emails } } } });
  await db.user.deleteMany({ where: { email: { in: emails } } });
}

async function createUsers() {
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  const [owner, designer, client] = await Promise.all(
    [PEOPLE.owner, PEOPLE.designer, PEOPLE.client].map((p) =>
      db.user.create({ data: { ...p, passwordHash, emailVerified: new Date() }, select: { id: true, name: true } }),
    ),
  );
  return { owner: owner!, designer: designer!, client: client! };
}

async function uploadVersion(
  userId: string,
  projectId: string,
  png: Buffer,
  opts: { assetId?: string; assetName?: string; fileName: string; changeSummary?: string },
) {
  const started = await startUpload(userId, {
    projectId,
    assetId: opts.assetId,
    assetName: opts.assetName,
    fileName: opts.fileName,
    contentType: "image/png",
    sizeBytes: png.byteLength,
    changeSummary: opts.changeSummary,
  });
  const version = await db.assetVersion.findUniqueOrThrow({ where: { id: started.versionId }, select: { storagePath: true } });
  // The browser would PUT to the signed URL; the seed writes the object directly.
  await uploadObject(version.storagePath, png, "image/png");
  return finalizeUpload(userId, started.versionId);
}

async function thread(
  userId: string,
  versionId: string,
  x: number,
  y: number,
  body: string,
  visibility: "PUBLIC" | "INTERNAL" = "PUBLIC",
) {
  const created = await createThread(member(userId), { versionId, x, y, body, visibility, clientMutationId: mutationId() });
  return created.threadId;
}

async function answer(userId: string, threadId: string, body: string) {
  await reply(member(userId), { threadId, body, clientMutationId: mutationId() });
}

async function main() {
  console.log("Seeding demo data…");
  await reset();
  const { owner, designer, client } = await createUsers();

  const { workspace, project } = await createWorkspaceWithProject(owner.id, {
    workspaceName: WORKSPACE_NAME,
    projectName: "Travel Website Redesign",
    clientName: "Skyline Travel",
  });
  await db.project.update({
    where: { id: project.id },
    data: {
      description: "New homepage and checkout for Skyline Travel's summer launch.",
      dueDate: new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() + 1, 15)),
    },
  });
  await db.workspaceMember.createMany({
    data: [
      { workspaceId: workspace.id, userId: designer.id, role: "MEMBER" },
      { workspaceId: workspace.id, userId: client.id, role: "CLIENT" },
    ],
  });
  await db.projectMember.createMany({
    data: [
      { projectId: project.id, workspaceId: workspace.id, userId: designer.id },
      { projectId: project.id, workspaceId: workspace.id, userId: client.id },
    ],
  });

  // ── Homepage: V1 → changes requested, V2 → changes requested, V3 → in review
  const home1 = await uploadVersion(designer.id, project.id, await renderPng(homepageSvg(1)), {
    assetName: "Homepage",
    fileName: "homepage-v1.png",
  });
  const t1 = await thread(client.id, home1.versionId, 0.135, 0.29, "Can the Book Now button stand out more? It's the main thing we want people to click.");
  await answer(designer.id, t1, `Agreed — I'll make it larger and use the brand orange in V2. ${mentionMarkup(client)} anything else above the fold?`);
  await answer(client.id, t1, "Just the headline, see my other note.");
  await setThreadResolved(member(designer.id), { threadId: t1, resolved: true });
  const t2 = await thread(client.id, home1.versionId, 0.2, 0.19, "The headline feels generic. Can it speak to holidays rather than “the world”?");
  await answer(designer.id, t2, "Trying “Your next escape starts here” in V2.");
  await setThreadResolved(member(client.id), { threadId: t2, resolved: true });
  const t3 = await thread(designer.id, home1.versionId, 0.78, 0.23, "Brand guide says orange #EA580C for primary actions — using it from V2.", "INTERNAL");
  await answer(owner.id, t3, "👍 and keep the grey for secondary buttons.");
  await setThreadResolved(member(owner.id), { threadId: t3, resolved: true });
  const r1 = await requestAndDecide(owner.id, client.id, home1.versionId, "CHANGES_REQUESTED", "Button and headline need another pass.");
  void r1;

  const home2 = await uploadVersion(designer.id, project.id, await renderPng(homepageSvg(2)), {
    assetId: home1.assetId,
    fileName: "homepage-v2.png",
    changeSummary: "Bigger orange Book Now button, new headline, search bar in the hero.",
  });
  const t4 = await thread(client.id, home2.versionId, 0.17, 0.3, "Much better! Could we show a starting price under the button?");
  await answer(designer.id, t4, "Yes — adding “From $899 per person” in V3.");
  await setThreadResolved(member(designer.id), { threadId: t4, resolved: true });
  await thread(client.id, home2.versionId, 0.5, 0.86, "Footer looks heavy on mobile. Can we check it?");
  await requestAndDecide(owner.id, client.id, home2.versionId, "CHANGES_REQUESTED", "Almost there — just the price hint.");

  const home3 = await uploadVersion(designer.id, project.id, await renderPng(homepageSvg(3)), {
    assetId: home1.assetId,
    fileName: "homepage-v3.png",
    changeSummary: "Added the starting price and free-cancellation note under Book Now.",
  });
  await thread(designer.id, home3.versionId, 0.18, 0.335, `${mentionMarkup(client)} price hint is in — does the wording work for you?`);
  await thread(owner.id, home3.versionId, 0.62, 0.72, "Double-check the Kyoto price with the client before sign-off.", "INTERNAL");
  await requestReview(owner.id, { versionId: home3.versionId, approverId: client.id });

  // ── Checkout: V1 → changes requested, V2 → approved
  const checkout1 = await uploadVersion(designer.id, project.id, await renderPng(checkoutSvg(1)), {
    assetName: "Checkout",
    fileName: "checkout-v1.png",
  });
  const t5 = await thread(client.id, checkout1.versionId, 0.28, 0.84, "“Continue” is vague on the payment step. Can it say what happens?");
  await answer(designer.id, t5, "Changing it to “Pay $1,618 securely” with the total.");
  await setThreadResolved(member(client.id), { threadId: t5, resolved: true });
  await thread(client.id, checkout1.versionId, 0.75, 0.33, "Can we include taxes in the trip price instead of adding them at the end?");
  await requestAndDecide(owner.id, client.id, checkout1.versionId, "CHANGES_REQUESTED", "Payment button wording and taxes.");

  const checkout2 = await uploadVersion(designer.id, project.id, await renderPng(checkoutSvg(2)), {
    assetId: checkout1.assetId,
    fileName: "checkout-v2.png",
    changeSummary: "Clear pay button with total, taxes included, promo code field, trust line.",
  });
  const t6 = await thread(client.id, checkout2.versionId, 0.28, 0.85, "Perfect, this is exactly it.");
  await setThreadResolved(member(client.id), { threadId: t6, resolved: true });
  await requestAndDecide(owner.id, client.id, checkout2.versionId, "APPROVED", "Approved for launch.");

  // ── More projects so search, filters and the archive have something to show.
  await createProject(owner.id, workspace.id, {
    name: "Brand Refresh",
    clientName: "Skyline Travel",
    description: "Logo, colours and type.",
    dueDate: undefined,
  });
  const old = await createProject(owner.id, workspace.id, {
    name: "Spring Campaign Microsite",
    clientName: "Skyline Travel",
    description: undefined,
    dueDate: undefined,
  });
  await setProjectArchived(owner.id, old.id, true);

  console.log(`
Demo ready. Sign in at ${process.env.APP_URL ?? "http://localhost:3000"}/sign-in with password "${DEMO_PASSWORD}":
  Agency owner     ${PEOPLE.owner.email}
  Designer         ${PEOPLE.designer.email}
  Client reviewer  ${PEOPLE.client.email}   (has a review waiting: Homepage V3)
`);
}

async function requestAndDecide(
  requesterId: string,
  approverId: string,
  versionId: string,
  decision: "APPROVED" | "CHANGES_REQUESTED",
  note: string,
) {
  await requestReview(requesterId, { versionId, approverId });
  const request = await db.reviewRequest.findFirstOrThrow({ where: { versionId, status: "OPEN" }, select: { id: true } });
  await decideReview(approverId, { reviewRequestId: request.id, decision, note });
  return request.id;
}

main()
  .then(() => db.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await db.$disconnect();
    process.exit(1);
  });
