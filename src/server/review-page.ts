import "server-only";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { authorizeProject, type Actor } from "@/server/access";
import { getVersionImage, listProjectAssets } from "@/server/asset-service";
import { countOpenThreadsByVersion } from "@/server/comment-service";

/**
 * Everything the review editor needs for its first paint: the asset, its
 * finished versions, the selected version's image, and the project's other
 * assets for the side panel. Threads and comments load client-side.
 */
export async function getAssetReviewData(actor: Actor, assetId: string, versionParam?: string | null) {
  const asset = await db.asset.findUnique({
    where: { id: assetId },
    select: { id: true, name: true, projectId: true, archivedAt: true, project: { select: { name: true, status: true, clientName: true } } },
  });
  if (!asset) throw new AppError("NOT_FOUND", "Asset not found.");
  const context = await authorizeProject(actor, asset.projectId);
  if (asset.archivedAt && !context.viewer.isTeam) throw new AppError("NOT_FOUND", "Asset not found.");

  const versions = await db.assetVersion.findMany({
    where: { assetId, uploadStatus: "READY" },
    orderBy: { versionNumber: "desc" },
    select: {
      id: true,
      versionNumber: true,
      reviewState: true,
      changeSummary: true,
      width: true,
      height: true,
      finalizedAt: true,
      uploadedBy: { select: { name: true } },
    },
  });
  if (versions.length === 0 && !context.viewer.isTeam) throw new AppError("NOT_FOUND", "Asset not found.");

  const selected = versions.find((v) => v.id === versionParam || String(v.versionNumber) === versionParam) ?? versions[0] ?? null;
  const [image, openCounts, { assets }] = await Promise.all([
    selected ? getVersionImage(actor, selected.id) : Promise.resolve(null),
    countOpenThreadsByVersion(actor, asset.projectId, versions.map((v) => v.id)),
    listProjectAssets(actor, asset.projectId),
  ]);

  return {
    context,
    asset: { id: asset.id, name: asset.name, archived: asset.archivedAt !== null },
    project: { id: asset.projectId, name: asset.project.name, clientName: asset.project.clientName, archived: asset.project.status === "ARCHIVED" },
    versions: versions.map((v) => ({
      id: v.id,
      versionNumber: v.versionNumber!,
      reviewState: v.reviewState,
      changeSummary: v.changeSummary,
      width: v.width!,
      height: v.height!,
      finalizedAt: v.finalizedAt?.toISOString() ?? null,
      uploadedBy: v.uploadedBy.name,
      openThreads: openCounts.get(v.id) ?? 0,
    })),
    selectedVersionId: selected?.id ?? null,
    image,
    assets: assets.map((a) => ({
      id: a.id,
      name: a.name,
      thumbnailUrl: a.latest?.thumbnailUrl ?? null,
      versionNumber: a.latest?.versionNumber ?? null,
      reviewState: a.latest?.reviewState ?? null,
    })),
  };
}

export type AssetReviewData = Awaited<ReturnType<typeof getAssetReviewData>>;
export type VersionSummary = AssetReviewData["versions"][number];
