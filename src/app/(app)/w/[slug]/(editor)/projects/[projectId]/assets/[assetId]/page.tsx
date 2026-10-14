import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { NotificationBell } from "@/components/notification-bell";
import { ReviewEditor } from "@/components/review/review-editor";
import { requireUser } from "@/lib/auth/session";
import { isAppError } from "@/lib/errors";
import { getAssetReviewData } from "@/server/review-page";
import { countUnreadNotifications } from "@/server/user-service";

export const metadata: Metadata = { title: "Review" };

export default async function AssetReviewPage(props: PageProps<"/w/[slug]/projects/[projectId]/assets/[assetId]">) {
  const { slug, projectId, assetId } = await props.params;
  const search = await props.searchParams;
  const user = await requireUser();

  let data;
  try {
    data = await getAssetReviewData({ kind: "member", userId: user.id }, assetId, typeof search.version === "string" ? search.version : null);
  } catch (error) {
    if (isAppError(error) && error.code === "NOT_FOUND") notFound();
    throw error;
  }
  if (data.project.id !== projectId) notFound();

  const { viewer } = data.context;
  return (
    <ReviewEditor
      scope={{ kind: "workspace", slug, projectId }}
      asset={data.asset}
      project={data.project}
      versions={data.versions}
      selectedVersionId={data.selectedVersionId}
      image={data.image}
      assets={data.assets}
      shareToken={null}
      initialThreadId={typeof search.thread === "string" ? search.thread : null}
      viewer={{
        userId: user.id,
        name: user.name,
        isGuest: false,
        isTeam: viewer.isTeam,
        canComment: viewer.canComment,
        canUpload: viewer.canUpload,
        canRequestReview: viewer.canRequestReview,
        seesInternal: viewer.seesInternal,
      }}
      headerEnd={<NotificationBell userId={user.id} initialCount={await countUnreadNotifications(user.id)} />}
    />
  );
}
