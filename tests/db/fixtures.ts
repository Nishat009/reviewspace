import { randomUUID } from "node:crypto";
import sharp from "sharp";
import type { WorkspaceRole } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { uploadObject } from "@/lib/storage";
import { finalizeUpload, startUpload } from "@/server/asset-service";

/**
 * Fixtures for service-level tests. Everything goes through the app's own
 * `db` client (one pool), and every name is unique so tests never collide.
 */
const uid = () => randomUUID().slice(0, 8);
export const mutationId = () => randomUUID();
export const member = (userId: string) => ({ kind: "member" as const, userId });

export async function createUser(name: string) {
  return db.user.create({
    data: { name, email: `${name.toLowerCase()}-${uid()}@test.local`, emailVerified: new Date() },
    select: { id: true, name: true, email: true },
  });
}

/**
 * An agency workspace with an owner, a designer (member) and a client, plus
 * one project both of them are assigned to.
 */
export async function createAgency() {
  const [owner, designer, client] = await Promise.all([createUser("Owner"), createUser("Designer"), createUser("Client")]);
  const workspace = await db.workspace.create({
    data: {
      name: "Agency",
      slug: `agency-${uid()}`,
      members: {
        create: [
          { userId: owner.id, role: "OWNER" as WorkspaceRole },
          { userId: designer.id, role: "MEMBER" as WorkspaceRole },
          { userId: client.id, role: "CLIENT" as WorkspaceRole },
        ],
      },
    },
    select: { id: true, slug: true },
  });
  const project = await db.project.create({
    data: {
      workspaceId: workspace.id,
      name: "Travel Website",
      members: { create: [{ userId: designer.id }, { userId: client.id }] },
    },
    select: { id: true },
  });
  return { owner, designer, client, workspace, project };
}

export async function png(width = 400, height = 300, color = "#e2e8f0") {
  return sharp({ create: { width, height, channels: 3, background: color } }).png().toBuffer();
}

/** Uploads a version exactly as the browser would (minus the HTTP PUT). */
export async function uploadVersion(userId: string, projectId: string, opts: { assetId?: string; width?: number; height?: number } = {}) {
  const file = await png(opts.width, opts.height);
  const started = await startUpload(userId, {
    projectId,
    assetId: opts.assetId,
    assetName: opts.assetId ? undefined : "Homepage",
    fileName: "homepage.png",
    contentType: "image/png",
    sizeBytes: file.byteLength,
  });
  const version = await db.assetVersion.findUniqueOrThrow({ where: { id: started.versionId }, select: { storagePath: true } });
  await uploadObject(version.storagePath, file, "image/png");
  return finalizeUpload(userId, started.versionId);
}

/** Expects a service call to fail with an AppError of the given code. */
export async function expectAppError(promise: Promise<unknown>, code: string) {
  try {
    await promise;
  } catch (error) {
    const actual = (error as { code?: string }).code;
    if (actual !== code) throw new Error(`Expected AppError ${code}, got ${actual ?? (error as Error).message}`);
    return;
  }
  throw new Error(`Expected AppError ${code}, but the call succeeded`);
}
