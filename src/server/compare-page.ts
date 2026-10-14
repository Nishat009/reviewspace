import "server-only";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { authorizeProject, type Actor } from "@/server/access";
import { getVersionImage } from "@/server/asset-service";
import { countOpenThreadsByVersion } from "@/server/comment-service";

/**
 * Two finished versions of one asset for comparison. Defaults to the latest
 * version against the one before it.
 */
export async function getCompareData(actor: Actor, assetId: string, a?: string | null, b?: string | null) {
  const asset = await db.asset.findUnique({
    where: { id: assetId },
    select: { id: true, name: true, projectId: true, archivedAt: true, project: { select: { name: true } } },
  });
  if (!asset) throw new AppError("NOT_FOUND", "Asset not found.");
  const context = await authorizeProject(actor, asset.projectId);
  if (asset.archivedAt && !context.viewer.isTeam) throw new AppError("NOT_FOUND", "Asset not found.");

  const versions = await db.assetVersion.findMany({
    where: { assetId, uploadStatus: "READY" },
    orderBy: { versionNumber: "desc" },
    select: { id: true, versionNumber: true, reviewState: true, changeSummary: true, width: true, height: true },
  });
  if (versions.length < 2) throw new AppError("INVALID", "This asset needs at least two versions to compare.");

  const find = (param: string | null | undefined) =>
    param ? versions.find((v) => v.id === param || String(v.versionNumber) === param) : undefined;
  const right = find(b) ?? versions[0]!;
  const left = find(a) ?? versions.find((v) => v.id !== right.id)!;

  const [leftImage, rightImage, openCounts] = await Promise.all([
    getVersionImage(actor, left.id),
    getVersionImage(actor, right.id),
    countOpenThreadsByVersion(actor, asset.projectId, [left.id, right.id]),
  ]);

  const shape = (v: (typeof versions)[number], image: { url: string }) => ({
    id: v.id,
    versionNumber: v.versionNumber!,
    reviewState: v.reviewState,
    changeSummary: v.changeSummary,
    width: v.width!,
    height: v.height!,
    url: image.url,
    openThreads: openCounts.get(v.id) ?? 0,
  });

  return {
    asset: { id: asset.id, name: asset.name, projectId: asset.projectId, projectName: asset.project.name },
    versions: versions.map((v) => ({ id: v.id, versionNumber: v.versionNumber! })),
    left: shape(left, leftImage),
    right: shape(right, rightImage),
  };
}

export type CompareData = Awaited<ReturnType<typeof getCompareData>>;
