import "server-only";
import sharp, { type Metadata } from "sharp";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import {
  EXTENSION_FOR_TYPE,
  MAX_IMAGE_DIMENSION,
  MAX_UPLOAD_BYTES,
  createSignedReadUrl,
  createUploadTarget,
  downloadObject,
  removeObjects,
  thumbnailPathFor,
  uploadObject,
  versionObjectPath,
  type AllowedImageType,
} from "@/lib/storage";
import type { StartUploadInput } from "@/lib/validation/project";
import { startUploadSchema } from "@/lib/validation/project";
import { authorizeProject, authorizeVersion, assertNotArchived, type Actor } from "@/server/access";
import { recordAudit } from "@/server/audit";
import { channels, publish } from "@/server/realtime";

const THUMBNAIL_WIDTH = 640;
const STALE_UPLOAD_MS = 24 * 60 * 60 * 1000;

/** Format detected from the file's bytes; the browser's claim is not trusted. */
const TYPE_FOR_FORMAT: Record<string, AllowedImageType> = { png: "image/png", jpeg: "image/jpeg", webp: "image/webp" };

async function authorizeUpload(userId: string, projectId: string) {
  const context = await authorizeProject({ kind: "member", userId }, projectId);
  if (!context.viewer.canUpload) throw new AppError("FORBIDDEN", "You don't have permission to upload to this project.");
  assertNotArchived(context);
  return context;
}

function defaultAssetName(fileName: string) {
  const base = fileName.replace(/\.[a-z0-9]+$/i, "").replace(/[_-]+/g, " ").trim();
  return (base || "Untitled").slice(0, 80);
}

/**
 * Step 1 of an upload: authorize, reserve a version row (PENDING, no number
 * yet) and hand back a one-time URL the browser uploads to directly.
 */
export async function startUpload(userId: string, raw: StartUploadInput) {
  const input = startUploadSchema.parse(raw);
  if (input.sizeBytes > MAX_UPLOAD_BYTES) throw new AppError("INVALID", "Images must be 20 MB or smaller.");
  const context = await authorizeUpload(userId, input.projectId);

  const { assetId, versionId, storagePath } = await db.$transaction(async (tx) => {
    let assetId = input.assetId;
    if (assetId) {
      const asset = await tx.asset.findFirst({ where: { id: assetId, projectId: input.projectId }, select: { archivedAt: true } });
      if (!asset) throw new AppError("NOT_FOUND", "Asset not found.");
      if (asset.archivedAt) throw new AppError("INVALID", "This asset is archived.");
    } else {
      const asset = await tx.asset.create({
        data: {
          projectId: input.projectId,
          workspaceId: context.workspaceId,
          name: input.assetName || defaultAssetName(input.fileName),
          createdById: userId,
        },
        select: { id: true },
      });
      assetId = asset.id;
    }

    const version = await tx.assetVersion.create({
      data: {
        assetId,
        storagePath: "pending", // replaced below once the id is known
        mimeType: input.contentType,
        sizeBytes: input.sizeBytes,
        changeSummary: input.changeSummary ?? null,
        uploadedById: userId,
      },
      select: { id: true },
    });
    const storagePath = versionObjectPath({
      workspaceId: context.workspaceId,
      projectId: input.projectId,
      assetId,
      versionId: version.id,
      ext: EXTENSION_FOR_TYPE[input.contentType],
    });
    await tx.assetVersion.update({ where: { id: version.id }, data: { storagePath } });
    return { assetId, versionId: version.id, storagePath };
  });

  const upload = await createUploadTarget(storagePath, input.contentType, MAX_UPLOAD_BYTES);
  return { assetId, versionId, upload };
}

/**
 * Step 2: the server verifies what actually landed in storage (exists, real
 * PNG/JPEG/WebP, within size and dimension limits), makes a thumbnail, then
 * assigns the next version number atomically. Anything invalid is deleted
 * and the version marked FAILED.
 */
export async function finalizeUpload(userId: string, versionId: string) {
  const version = await db.assetVersion.findUnique({
    where: { id: versionId },
    select: {
      id: true,
      uploadStatus: true,
      storagePath: true,
      uploadedById: true,
      versionNumber: true,
      asset: { select: { id: true, projectId: true, workspaceId: true, name: true } },
    },
  });
  if (!version) throw new AppError("NOT_FOUND", "Upload not found.");
  await authorizeUpload(userId, version.asset.projectId);
  if (version.uploadedById !== userId) throw new AppError("FORBIDDEN", "Only the uploader can finish this upload.");
  if (version.uploadStatus === "READY") return { versionId, versionNumber: version.versionNumber!, assetId: version.asset.id };
  if (version.uploadStatus === "FAILED") throw new AppError("INVALID", "This upload failed. Start a new one.");

  const file = await downloadObject(version.storagePath);
  if (!file) throw new AppError("INVALID", "We couldn't find the uploaded file. Try uploading again.");

  const fail = async (message: string): Promise<never> => {
    await db.assetVersion.update({ where: { id: versionId }, data: { uploadStatus: "FAILED" } });
    await removeObjects([version.storagePath]);
    throw new AppError("INVALID", message);
  };

  if (file.byteLength > MAX_UPLOAD_BYTES) await fail("Images must be 20 MB or smaller.");

  let metadata: Metadata;
  try {
    metadata = await sharp(file, { limitInputPixels: MAX_IMAGE_DIMENSION * MAX_IMAGE_DIMENSION }).metadata();
  } catch {
    return fail("That file isn't a readable image.");
  }
  const mimeType = metadata.format ? TYPE_FOR_FORMAT[metadata.format] : undefined;
  if (!mimeType) return fail("Use a PNG, JPEG or WebP image.");
  // EXIF rotation: store display dimensions so pins match what people see.
  const rotated = (metadata.orientation ?? 1) >= 5;
  const width = rotated ? metadata.height : metadata.width;
  const height = rotated ? metadata.width : metadata.height;
  if (!width || !height) return fail("That file isn't a readable image.");
  if (width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION) {
    return fail(`Images can be at most ${MAX_IMAGE_DIMENSION.toLocaleString("en")} px on each side.`);
  }

  const thumbnailPath = thumbnailPathFor(version.storagePath);
  try {
    const thumbnail = await sharp(file)
      .rotate()
      .resize({ width: THUMBNAIL_WIDTH, withoutEnlargement: true })
      .webp({ quality: 78 })
      .toBuffer();
    await uploadObject(thumbnailPath, thumbnail, "image/webp");
  } catch (error) {
    // A missing thumbnail is not fatal: lists fall back to the original.
    if (!(error as { code?: string }).code?.includes("EEXIST")) {
      console.error("[upload] thumbnail failed", { versionId, error: (error as Error).message });
    }
  }

  const result = await db.$transaction(async (tx) => {
    // Row lock on the asset serializes concurrent finalizes: no duplicate numbers.
    const asset = await tx.asset.update({
      where: { id: version.asset.id },
      data: { versionCounter: { increment: 1 } },
      select: { versionCounter: true },
    });
    const { count } = await tx.assetVersion.updateMany({
      where: { id: versionId, uploadStatus: "PENDING" },
      data: {
        uploadStatus: "READY",
        versionNumber: asset.versionCounter,
        mimeType,
        sizeBytes: file.byteLength,
        width,
        height,
        thumbnailPath,
        finalizedAt: new Date(),
      },
    });
    if (count !== 1) throw new AppError("CONFLICT", "This upload was already processed.");
    const isFirst = asset.versionCounter === 1;
    await recordAudit(tx, {
      workspaceId: version.asset.workspaceId,
      projectId: version.asset.projectId,
      actorId: userId,
      type: isFirst ? "asset.uploaded" : "version.added",
      targetType: "asset_version",
      targetId: versionId,
      metadata: { assetId: version.asset.id, assetName: version.asset.name, versionNumber: asset.versionCounter },
    });
    await tx.project.update({ where: { id: version.asset.projectId }, data: { updatedAt: new Date() } });
    return { versionNumber: asset.versionCounter };
  });

  await Promise.all([
    publish(channels.asset(version.asset.id), "version.added", { versionId }),
    publish(channels.project(version.asset.projectId), "asset.updated", { assetId: version.asset.id }),
  ]);
  return { versionId, versionNumber: result.versionNumber, assetId: version.asset.id };
}

/** Called when the browser's upload failed; the row is cleaned up later. */
export async function abandonUpload(userId: string, versionId: string) {
  await db.assetVersion.updateMany({
    where: { id: versionId, uploadedById: userId, uploadStatus: "PENDING" },
    data: { uploadStatus: "FAILED" },
  });
}

/**
 * Removes uploads that never finished (PENDING for a day) or failed, their
 * stored objects, and assets left with no versions at all.
 */
export async function cleanupStaleUploads(now = new Date()) {
  const stale = await db.assetVersion.findMany({
    where: {
      OR: [{ uploadStatus: "FAILED" }, { uploadStatus: "PENDING", createdAt: { lt: new Date(now.getTime() - STALE_UPLOAD_MS) } }],
    },
    select: { id: true, storagePath: true, assetId: true },
    take: 500,
  });
  if (stale.length > 0) {
    await removeObjects(stale.flatMap((v) => [v.storagePath, thumbnailPathFor(v.storagePath)]));
    await db.assetVersion.deleteMany({ where: { id: { in: stale.map((v) => v.id) }, uploadStatus: { not: "READY" } } });
  }
  const { count: emptyAssets } = await db.asset.deleteMany({
    where: { versions: { none: {} }, createdAt: { lt: new Date(now.getTime() - STALE_UPLOAD_MS) } },
  });
  return { versionsRemoved: stale.length, emptyAssetsRemoved: emptyAssets };
}

async function signedOrNull(path: string | null) {
  if (!path) return null;
  try {
    return await createSignedReadUrl(path);
  } catch {
    return null;
  }
}

/** Assets of a project with their latest finished version, for grids/lists. */
export async function listProjectAssets(actor: Actor, projectId: string) {
  const context = await authorizeProject(actor, projectId);
  const assets = await db.asset.findMany({
    where: { projectId, archivedAt: null },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      name: true,
      createdAt: true,
      updatedAt: true,
      versions: {
        where: context.viewer.isTeam ? undefined : { uploadStatus: "READY" },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { id: true },
      },
    },
  });

  const latestReady = await db.assetVersion.findMany({
    where: { assetId: { in: assets.map((a) => a.id) }, uploadStatus: "READY" },
    orderBy: { versionNumber: "desc" },
    distinct: ["assetId"],
    select: {
      id: true,
      assetId: true,
      versionNumber: true,
      reviewState: true,
      width: true,
      height: true,
      thumbnailPath: true,
      storagePath: true,
      finalizedAt: true,
      uploadedBy: { select: { name: true } },
      _count: {
        select: {
          threads: { where: { resolvedAt: null, ...(context.viewer.seesInternal ? {} : { visibility: "PUBLIC" }) } },
        },
      },
    },
  });
  const byAsset = new Map(latestReady.map((v) => [v.assetId, v]));

  const rows = await Promise.all(
    assets.map(async (asset) => {
      const latest = byAsset.get(asset.id);
      return {
        id: asset.id,
        name: asset.name,
        updatedAt: asset.updatedAt,
        hasPending: !latest && asset.versions.length > 0,
        latest: latest
          ? {
              id: latest.id,
              versionNumber: latest.versionNumber!,
              reviewState: latest.reviewState,
              width: latest.width!,
              height: latest.height!,
              finalizedAt: latest.finalizedAt,
              uploadedBy: latest.uploadedBy.name,
              openThreads: latest._count.threads,
              thumbnailUrl: await signedOrNull(latest.thumbnailPath ?? latest.storagePath),
            }
          : null,
      };
    }),
  );
  // Clients and guests only see assets that have something to review.
  return { context, assets: context.viewer.isTeam ? rows : rows.filter((r) => r.latest) };
}

export type AssetListItem = Awaited<ReturnType<typeof listProjectAssets>>["assets"][number];

async function authorizeAssetEdit(userId: string, assetId: string) {
  const asset = await db.asset.findUnique({ where: { id: assetId }, select: { projectId: true, name: true } });
  if (!asset) throw new AppError("NOT_FOUND", "Asset not found.");
  const context = await authorizeUpload(userId, asset.projectId);
  return { asset, context };
}

export async function renameAsset(userId: string, assetId: string, name: string) {
  const { asset, context } = await authorizeAssetEdit(userId, assetId);
  await db.$transaction(async (tx) => {
    await tx.asset.update({ where: { id: assetId }, data: { name } });
    await recordAudit(tx, {
      workspaceId: context.workspaceId,
      projectId: asset.projectId,
      actorId: userId,
      type: "asset.renamed",
      targetType: "asset",
      targetId: assetId,
      metadata: { from: asset.name, to: name },
    });
  });
  await publish(channels.project(asset.projectId), "asset.updated", { assetId });
}

export async function archiveAsset(userId: string, assetId: string) {
  const { asset, context } = await authorizeAssetEdit(userId, assetId);
  await db.$transaction(async (tx) => {
    await tx.asset.update({ where: { id: assetId }, data: { archivedAt: new Date() } });
    await recordAudit(tx, {
      workspaceId: context.workspaceId,
      projectId: asset.projectId,
      actorId: userId,
      type: "asset.archived",
      targetType: "asset",
      targetId: assetId,
      metadata: { assetName: asset.name },
    });
  });
  await publish(channels.project(asset.projectId), "asset.updated", { assetId });
  return asset.projectId;
}

/** Signed URLs for one version's image, after an access check. */
export async function getVersionImage(actor: Actor, versionId: string) {
  await authorizeVersion(actor, versionId);
  const version = await db.assetVersion.findUniqueOrThrow({
    where: { id: versionId },
    select: { storagePath: true, thumbnailPath: true, width: true, height: true, uploadStatus: true },
  });
  if (version.uploadStatus !== "READY") throw new AppError("NOT_FOUND", "Version not found.");
  return {
    url: await createSignedReadUrl(version.storagePath),
    thumbnailUrl: await signedOrNull(version.thumbnailPath),
    width: version.width!,
    height: version.height!,
  };
}
