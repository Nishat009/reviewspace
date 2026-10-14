"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeftIcon, ColumnsIcon, ImageIcon, PanelLeftCloseIcon, PanelLeftOpenIcon } from "lucide-react";
import { ReviewStateBadge } from "@/components/review-state-badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ReviewState } from "@/generated/prisma/enums";
import { cn } from "@/lib/utils";
import { EditorStoreProvider, useEditor, useEditorStore } from "./editor-store";
import { ImageViewer } from "./image-viewer";
import { NewVersionDialog } from "./new-version-dialog";
import { ConnectionIndicator, PresenceBar } from "./presence-bar";
import { apiFetch, ReviewEnvProvider, type ReviewViewer } from "./review-context";
import { ReviewPanel } from "./review-panel";
import { ThreadPanel } from "./thread-panel";
import { assetHref, backHref, compareHref, type LinkScope } from "./link-builder";
import { reviewKeys, useThreads, useVersionLive } from "./use-review-data";

const PANEL_LABELS = { image: "Image", comments: "Comments", review: "Review" } as const;

export type EditorVersion = {
  id: string;
  versionNumber: number;
  reviewState: ReviewState;
  changeSummary: string | null;
  width: number;
  height: number;
  finalizedAt: string | null;
  uploadedBy: string;
  openThreads: number;
};

export type EditorAsset = { id: string; name: string; thumbnailUrl: string | null; versionNumber: number | null; reviewState: ReviewState | null };

export type ReviewEditorProps = {
  scope: LinkScope;
  asset: { id: string; name: string; archived: boolean };
  project: { id: string; name: string; clientName: string | null; archived: boolean };
  versions: EditorVersion[];
  selectedVersionId: string | null;
  image: { url: string; thumbnailUrl: string | null; width: number; height: number } | null;
  assets: EditorAsset[];
  viewer: ReviewViewer;
  shareToken: string | null;
  initialThreadId: string | null;
  headerEnd?: ReactNode;
};

export function ReviewEditor(props: ReviewEditorProps) {
  const env = useMemo(
    () => ({
      viewer: props.viewer,
      shareToken: props.shareToken,
      projectArchived: props.project.archived || props.asset.archived,
      linkTo: (opts: { version?: string; thread?: string }) => assetHref(props.scope, props.asset.id, opts),
    }),
    [props.viewer, props.shareToken, props.project.archived, props.asset.archived, props.scope, props.asset.id],
  );
  return (
    <ReviewEnvProvider value={env}>
      {/* A fresh store per version: drafts and selection never leak across versions. */}
      <EditorStoreProvider key={props.selectedVersionId ?? "none"} initialThreadId={props.initialThreadId}>
        <EditorLayout {...props} />
      </EditorStoreProvider>
    </ReviewEnvProvider>
  );
}

function EditorLayout(props: ReviewEditorProps) {
  const { scope, asset, project, versions, selectedVersionId, viewer, headerEnd } = props;
  const router = useRouter();
  const store = useEditorStore();
  const mobilePanel = useEditor((s) => s.mobilePanel);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const selected = versions.find((v) => v.id === selectedVersionId) ?? null;
  const latest = versions[0] ?? null;

  // Warn before leaving with an unsent comment.
  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (store.getState().draftBody.trim()) event.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [store]);

  const navigate = (href: string) => {
    if (store.getState().draftBody.trim() && !window.confirm("You have an unsent comment. Leave anyway?")) return;
    router.push(href);
  };

  const canUploadVersion = viewer.canUpload && !project.archived && !asset.archived && scope.kind === "workspace";
  const olderWithOpen = selected && latest && selected.id === latest.id ? versions.slice(1).filter((v) => v.openThreads > 0) : [];

  return (
    <div className="flex h-svh flex-col overflow-hidden">
      <header className="flex min-h-14 flex-wrap items-center gap-x-3 gap-y-1 border-b px-3 py-2">
        <Button variant="ghost" size="icon-sm" asChild>
          <Link href={backHref(scope)} aria-label={`Back to ${project.name}`} onClick={(e) => {
            if (store.getState().draftBody.trim() && !window.confirm("You have an unsent comment. Leave anyway?")) e.preventDefault();
          }}>
            <ArrowLeftIcon />
          </Link>
        </Button>
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-xs text-muted-foreground">{project.name}</span>
          <h1 className="truncate text-sm font-semibold">{asset.name}</h1>
        </div>
        {versions.length > 0 && selected && (
          <Select value={selected.id} onValueChange={(id) => navigate(assetHref(scope, asset.id, { version: id }))}>
            <SelectTrigger size="sm" className="w-auto min-w-24" aria-label="Version">
              <SelectValue>V{selected.versionNumber}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {versions.map((v) => (
                <SelectItem key={v.id} value={v.id}>
                  <span className="flex items-center gap-2">
                    V{v.versionNumber}
                    <ReviewStateBadge state={v.reviewState} />
                    {v.openThreads > 0 && <span className="text-xs text-muted-foreground">{v.openThreads} open</span>}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {selected && <ReviewStateBadge state={selected.reviewState} className="max-sm:hidden" />}
        <div className="ml-auto flex items-center gap-2">
          <LivePresence versionId={selected?.id ?? null} assetId={asset.id} selfId={viewer.userId} />
          <ConnectionIndicator />
          {versions.length > 1 && selected && (
            <Button size="sm" variant="outline" asChild>
              <Link href={compareHref(scope, asset.id, versions[1]!.id, versions[0]!.id)}>
                <ColumnsIcon aria-hidden /> <span className="max-sm:sr-only">Compare</span>
              </Link>
            </Button>
          )}
          {canUploadVersion && scope.kind === "workspace" && (
            <NewVersionDialog
              projectId={project.id}
              assetId={asset.id}
              nextNumber={(latest?.versionNumber ?? 0) + 1}
              hrefForVersion={(versionId) => assetHref(scope, asset.id, { version: versionId })}
            />
          )}
          {headerEnd}
        </div>
      </header>

      {selected && (selected.changeSummary || olderWithOpen.length > 0 || (latest && selected.id !== latest.id)) && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b bg-muted/40 px-4 py-1.5 text-xs">
          {selected.changeSummary && (
            <span>
              <span className="font-medium">What changed in V{selected.versionNumber}:</span> {selected.changeSummary}
            </span>
          )}
          {latest && selected.id !== latest.id && (
            <span>
              You&apos;re viewing an older version.{" "}
              <button type="button" className="font-medium underline" onClick={() => navigate(assetHref(scope, asset.id, { version: latest.id }))}>
                Go to V{latest.versionNumber}
              </button>
            </span>
          )}
          {olderWithOpen.map((v) => (
            <span key={v.id}>
              V{v.versionNumber} has {v.openThreads} unresolved {v.openThreads === 1 ? "comment" : "comments"}.{" "}
              <button type="button" className="font-medium underline" onClick={() => navigate(assetHref(scope, asset.id, { version: v.id }))}>
                View
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Mobile: one panel at a time. */}
      <div className="flex border-b lg:hidden" role="tablist" aria-label="Editor panels">
        {(["image", "comments", "review"] as const).map((panel) => (
          <button
            key={panel}
            role="tab"
            type="button"
            aria-selected={mobilePanel === panel}
            onClick={() => store.getState().setMobilePanel(panel)}
            className={cn(
              "flex-1 border-b-2 py-2.5 text-sm",
              mobilePanel === panel ? "border-primary font-medium" : "border-transparent text-muted-foreground",
            )}
          >
            {PANEL_LABELS[panel]}
          </button>
        ))}
      </div>

      <div className="flex min-h-0 flex-1">
        {props.assets.length > 1 && (
          <aside
            aria-label="Assets in this project"
            className={cn("hidden shrink-0 flex-col border-r xl:flex", sidebarOpen ? "w-56" : "w-12")}
          >
            <div className="flex items-center justify-between px-2 py-2">
              {sidebarOpen && <span className="px-1 text-xs font-medium text-muted-foreground uppercase">Assets</span>}
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setSidebarOpen((o) => !o)}
                aria-label={sidebarOpen ? "Collapse assets" : "Expand assets"}
                aria-expanded={sidebarOpen}
              >
                {sidebarOpen ? <PanelLeftCloseIcon /> : <PanelLeftOpenIcon />}
              </Button>
            </div>
            {sidebarOpen && (
              <ul className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-2 pb-3">
                {props.assets.map((a) => (
                  <li key={a.id}>
                    <button
                      type="button"
                      onClick={() => navigate(assetHref(scope, a.id))}
                      aria-current={a.id === asset.id ? "page" : undefined}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-lg p-1.5 text-left text-sm hover:bg-muted",
                        a.id === asset.id && "bg-muted font-medium",
                      )}
                    >
                      {a.thumbnailUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element -- signed, short-lived URL
                        <img src={a.thumbnailUrl} alt="" className="h-9 w-12 shrink-0 rounded border object-cover object-top" />
                      ) : (
                        <span className="grid h-9 w-12 shrink-0 place-items-center rounded border bg-muted">
                          <ImageIcon className="size-4 text-muted-foreground" aria-hidden />
                        </span>
                      )}
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate">{a.name}</span>
                        {a.versionNumber && <span className="text-xs text-muted-foreground">V{a.versionNumber}</span>}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </aside>
        )}

        {selected && props.image ? (
          <EditorBody {...props} version={selected} image={props.image} />
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center text-sm text-muted-foreground">
            <ImageIcon className="size-8" aria-hidden />
            <p>This asset has no finished version yet.</p>
            {canUploadVersion && (
              <NewVersionDialog
                projectId={project.id}
                assetId={asset.id}
                nextNumber={1}
                hrefForVersion={(versionId) => assetHref(scope, asset.id, { version: versionId })}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function LivePresence({ versionId, assetId, selfId }: { versionId: string | null; assetId: string; selfId: string | null }) {
  if (!versionId) return null;
  return <LivePresenceInner versionId={versionId} assetId={assetId} selfId={selfId} />;
}

function LivePresenceInner({ versionId, assetId, selfId }: { versionId: string; assetId: string; selfId: string | null }) {
  const { viewers } = useVersionLive(versionId, assetId);
  return <PresenceBar viewers={viewers} selfId={selfId} />;
}

function EditorBody({
  version,
  image,
  viewer,
  shareToken,
  asset,
  versions,
  project,
}: ReviewEditorProps & { version: EditorVersion; image: NonNullable<ReviewEditorProps["image"]> }) {
  const mobilePanel = useEditor((s) => s.mobilePanel);
  const [panel, setPanel] = useState<"comments" | "review">("comments");
  const threads = useThreads(version.id);
  const latestId = versions[0]?.id;

  // Signed URLs expire; if the image fails to load, fetch a fresh one.
  const imageQuery = useQuery({
    queryKey: reviewKeys.image(version.id),
    queryFn: () => apiFetch(shareToken, `/api/versions/${version.id}/image`) as Promise<typeof image>,
    initialData: image,
    staleTime: 8 * 60_000,
  });

  const imageRetried = useRef(false);
  const canComment = viewer.canComment && !project.archived && !asset.archived && (!viewer.isGuest || !!viewer.userId);

  return (
    <>
      <main
        className={cn("min-w-0 flex-1 flex-col", mobilePanel === "image" ? "flex" : "hidden lg:flex")}
        aria-label={`${asset.name} V${version.versionNumber}`}
      >
        <ImageViewer
          imageUrl={imageQuery.data.url}
          width={version.width}
          height={version.height}
          alt={`${asset.name}, version ${version.versionNumber}`}
          threads={threads.data ?? []}
          canComment={canComment}
          onImageError={() => {
            // One retry with a fresh signed URL; a broken file shouldn't loop.
            if (imageRetried.current) return;
            imageRetried.current = true;
            void imageQuery.refetch();
          }}
        />
      </main>
      <aside
        aria-label="Comments and review"
        className={cn(
          "min-h-0 w-full shrink-0 flex-col border-l lg:flex lg:w-96",
          mobilePanel === "image" ? "hidden" : "flex",
        )}
      >
        <div className="hidden border-b lg:flex" role="tablist" aria-label="Side panel">
          {(["comments", "review"] as const).map((value) => (
            <button
              key={value}
              role="tab"
              type="button"
              aria-selected={panel === value}
              onClick={() => setPanel(value)}
              className={cn(
                "flex-1 border-b-2 py-2.5 text-sm",
                panel === value ? "border-primary font-medium" : "border-transparent text-muted-foreground",
              )}
            >
              {PANEL_LABELS[value]}
            </button>
          ))}
        </div>
        <div className={cn("min-h-0 flex-1", mobilePanel === "comments" ? "block" : "hidden", panel === "comments" ? "lg:block" : "lg:hidden")}>
          <ThreadPanel
            versionId={version.id}
            threads={threads.data ?? []}
            isPending={threads.isPending}
            isError={threads.isError}
            onRetry={() => threads.refetch()}
          />
        </div>
        <div className={cn("min-h-0 flex-1 overflow-y-auto", mobilePanel === "review" ? "block" : "hidden", panel === "review" ? "lg:block" : "lg:hidden")}>
          <ReviewPanel versionId={version.id} versionNumber={version.versionNumber} isLatest={version.id === latestId} />
        </div>
      </aside>
    </>
  );
}
