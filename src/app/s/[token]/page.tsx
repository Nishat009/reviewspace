import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LinkIcon } from "lucide-react";
import { Logo } from "@/components/brand";
import { AssetGrid } from "@/components/projects/asset-grid";
import { ReviewEditor } from "@/components/review/review-editor";
import { VersionCompare } from "@/components/review/version-compare";
import { GuestIdentity, UnlockShareForm } from "@/components/share/share-forms";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { isAppError } from "@/lib/errors";
import { paths } from "@/lib/paths";
import { listProjectAssets } from "@/server/asset-service";
import { getCompareData } from "@/server/compare-page";
import { getAssetReviewData } from "@/server/review-page";
import { resolveShareLink } from "@/server/share-service";

export const metadata: Metadata = { title: "Shared review", robots: { index: false, follow: false } };

/** Missing or not-shared things render as this link's 404. */
async function orNotFound<T>(load: () => Promise<T>): Promise<T> {
  try {
    return await load();
  } catch (error) {
    if (isAppError(error) && (error.code === "NOT_FOUND" || error.code === "INVALID")) notFound();
    throw error;
  }
}

function CenteredCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted/40 px-4 py-10">
      <Logo />
      <main className="w-full max-w-sm">{children}</main>
    </div>
  );
}

/**
 * External review through a share link. The token is the only credential: it
 * is checked on every request (revoked/expired links stop working at once),
 * guests only ever see public threads, and nothing here can approve.
 */
export default async function SharePage(props: PageProps<"/s/[token]">) {
  const { token } = await props.params;
  const search = await props.searchParams;
  const state = await resolveShareLink(token);

  if (state.status === "invalid") {
    return (
      <CenteredCard>
        <Card>
          <CardHeader>
            <CardTitle>This link isn&apos;t available</CardTitle>
            <CardDescription>It may have expired or been revoked. Ask the person who shared it for a new link.</CardDescription>
          </CardHeader>
        </Card>
      </CenteredCard>
    );
  }
  if (state.status === "locked") {
    return (
      <CenteredCard>
        <Card>
          <CardHeader>
            <CardTitle>Enter password</CardTitle>
          </CardHeader>
          <CardContent>
            <UnlockShareForm token={token} projectName={state.projectName} />
          </CardContent>
        </Card>
      </CenteredCard>
    );
  }

  const { actor, link } = state;
  const identity = <GuestIdentity token={token} permission={link.permission} guestName={state.guestName} />;
  const assetId = typeof search.asset === "string" ? search.asset : null;

  if (assetId && search.compare === "1") {
    const data = await orNotFound(() =>
      getCompareData(actor, assetId, typeof search.a === "string" ? search.a : null, typeof search.b === "string" ? search.b : null),
    );
    return (
      <VersionCompare
        scope={{ kind: "share", token }}
        asset={{ id: data.asset.id, name: data.asset.name, projectName: data.asset.projectName }}
        versions={data.versions}
        left={data.left}
        right={data.right}
      />
    );
  }

  if (assetId) {
    const data = await orNotFound(() =>
      getAssetReviewData(actor, assetId, typeof search.version === "string" ? search.version : null),
    );
    return (
      <ReviewEditor
        scope={{ kind: "share", token }}
        asset={data.asset}
        project={data.project}
        versions={data.versions}
        selectedVersionId={data.selectedVersionId}
        image={data.image}
        assets={data.assets}
        shareToken={token}
        initialThreadId={typeof search.thread === "string" ? search.thread : null}
        viewer={{
          userId: actor.userId,
          name: state.guestName,
          isGuest: true,
          isTeam: false,
          // Guests pick a name (header button) before they can comment.
          canComment: link.permission === "COMMENT" && actor.userId !== null,
          canUpload: false,
          canRequestReview: false,
          seesInternal: false,
        }}
        headerEnd={identity}
      />
    );
  }

  const { assets } = await listProjectAssets(actor, link.projectId);
  return (
    <div className="flex min-h-svh flex-col">
      <header className="border-b">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4">
          <Logo href={paths.share(token)} />
          <span className="ml-auto flex items-center gap-2">{identity}</span>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-8">
        <div className="flex flex-col gap-1">
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <LinkIcon className="size-3.5" aria-hidden /> Shared by {state.workspaceName}
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">{state.projectName}</h1>
          {state.clientName && <p className="text-sm text-muted-foreground">{state.clientName}</p>}
        </div>
        {assets.length === 0 ? (
          <p className="rounded-lg border px-3 py-10 text-center text-sm text-muted-foreground">Nothing has been shared for review yet.</p>
        ) : (
          <AssetGrid assets={assets} hrefFor={(asset) => paths.share(token, { asset: asset.id })} canManage={false} />
        )}
      </main>
    </div>
  );
}
