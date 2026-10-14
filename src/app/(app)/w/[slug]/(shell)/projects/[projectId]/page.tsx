import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArchiveIcon, CalendarIcon, ImageIcon, LayoutGridIcon, ListIcon } from "lucide-react";
import { ActivityList } from "@/components/activity-list";
import { LiveRefresh } from "@/components/live-refresh";
import { AssetGrid, AssetTable } from "@/components/projects/asset-grid";
import { GettingStarted } from "@/components/projects/getting-started";
import { ProjectPeople } from "@/components/projects/project-people";
import { ProjectSettings } from "@/components/projects/project-settings";
import { ShareLinks } from "@/components/projects/share-links";
import { TabLinks } from "@/components/tab-links";
import { AssetDropzone } from "@/components/upload/asset-dropzone";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { requireUser } from "@/lib/auth/session";
import { avatarUrl } from "@/lib/avatar";
import { db } from "@/lib/db";
import { isAppError } from "@/lib/errors";
import { paths } from "@/lib/paths";
import { listProjectAssets } from "@/server/asset-service";
import { getProject, listAssignableMembers, listProjectActivity, listProjectPeople } from "@/server/project-service";
import { listShareLinks } from "@/server/share-service";

export const metadata: Metadata = { title: "Project" };

const dateFormat = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" });

type Tab = "assets" | "people" | "activity" | "settings";

export default async function ProjectPage(props: PageProps<"/w/[slug]/projects/[projectId]">) {
  const { slug, projectId } = await props.params;
  const search = await props.searchParams;
  const user = await requireUser();

  let loaded;
  try {
    loaded = await getProject(user.id, projectId);
  } catch (error) {
    if (isAppError(error) && error.code === "NOT_FOUND") notFound();
    throw error;
  }
  const { project, context } = loaded;
  const viewer = context.viewer;
  const archived = project.status === "ARCHIVED";

  const tabs: { value: Tab; label: string }[] = [
    { value: "assets", label: "Assets" },
    { value: "people", label: "People" },
    { value: "activity", label: "Activity" },
  ];
  if (viewer.isTeam) tabs.push({ value: "settings", label: "Settings" });
  const requested = typeof search.tab === "string" ? search.tab : "assets";
  const tab: Tab = tabs.some((t) => t.value === requested) ? (requested as Tab) : "assets";
  const view = search.view === "list" ? "list" : "grid";

  return (
    <div className="flex flex-col gap-6">
      <LiveRefresh channels={[`project:${projectId}`]} />
      <div className="flex flex-col gap-2">
        <Link href={paths.projects(slug)} className="text-sm text-muted-foreground hover:text-foreground">
          ← Projects
        </Link>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">{project.name}</h1>
          {archived && (
            <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs text-muted-foreground">
              <ArchiveIcon className="size-3" aria-hidden /> Archived
            </span>
          )}
        </div>
        <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <span>{project.clientName ?? "No client set"}</span>
          {project.dueDate && (
            <span className="inline-flex items-center gap-1">
              <CalendarIcon className="size-3.5" aria-hidden /> Due {dateFormat.format(project.dueDate)}
            </span>
          )}
        </p>
        {project.description && <p className="max-w-2xl text-sm whitespace-pre-line">{project.description}</p>}
      </div>

      {archived && (
        <Alert>
          <AlertDescription>This project is archived and read-only.{viewer.isTeam && " Restore it from Settings to make changes."}</AlertDescription>
        </Alert>
      )}

      {search.welcome === "1" && viewer.isTeam && !archived && (
        <GettingStarted
          hasAsset={(await db.asset.count({ where: { projectId } })) > 0}
          hasReviewer={(await db.projectMember.count({ where: { projectId, workspaceMember: { role: "CLIENT" } } })) > 0}
          membersHref={paths.members(slug)}
        />
      )}

      <TabLinks tabs={tabs} fallback="assets" />

      {tab === "assets" && <AssetsTab slug={slug} projectId={projectId} canUpload={viewer.canUpload && !archived} view={view} userId={user.id} />}
      {tab === "people" && (
        <PeopleTab projectId={projectId} workspaceId={context.workspaceId} canManage={viewer.isTeam && !archived} userId={user.id} />
      )}
      {tab === "activity" && <ActivityList events={await listProjectActivity(projectId)} />}
      {tab === "settings" && viewer.isTeam && (
        <div className="flex flex-col gap-10">
          <ProjectSettings project={project} />
          <section aria-labelledby="share-heading" className="flex flex-col gap-3">
            <h2 id="share-heading" className="font-medium">
              Share links
            </h2>
            <ShareLinks projectId={projectId} links={await listShareLinks(user.id, projectId)} disabled={archived} />
          </section>
        </div>
      )}
    </div>
  );
}

async function AssetsTab({
  slug,
  projectId,
  canUpload,
  view,
  userId,
}: {
  slug: string;
  projectId: string;
  canUpload: boolean;
  view: "grid" | "list";
  userId: string;
}) {
  const { assets } = await listProjectAssets({ kind: "member", userId }, projectId);
  const hrefFor = (asset: { id: string }) => paths.asset(slug, projectId, asset.id);
  return (
    <div className="flex flex-col gap-4">
      {canUpload && <AssetDropzone projectId={projectId} />}
      {assets.length > 0 && (
        <div className="flex justify-end gap-1" role="group" aria-label="Layout">
          <Button asChild variant={view === "grid" ? "secondary" : "ghost"} size="icon-sm" aria-label="Grid view">
            <Link href={paths.project(slug, projectId)} scroll={false} aria-current={view === "grid" ? "true" : undefined}>
              <LayoutGridIcon />
            </Link>
          </Button>
          <Button asChild variant={view === "list" ? "secondary" : "ghost"} size="icon-sm" aria-label="List view">
            <Link href={`${paths.project(slug, projectId)}?view=list`} scroll={false} aria-current={view === "list" ? "true" : undefined}>
              <ListIcon />
            </Link>
          </Button>
        </div>
      )}
      {assets.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ImageIcon />
            </EmptyMedia>
            <EmptyTitle>No assets yet</EmptyTitle>
            <EmptyDescription>
              {canUpload ? "Upload a screenshot or design above to start a review." : "The team hasn't shared anything for review yet."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : view === "list" ? (
        <AssetTable assets={assets} hrefFor={hrefFor} canManage={canUpload} />
      ) : (
        <AssetGrid assets={assets} hrefFor={hrefFor} canManage={canUpload} />
      )}
    </div>
  );
}

async function PeopleTab({
  projectId,
  workspaceId,
  canManage,
  userId,
}: {
  projectId: string;
  workspaceId: string;
  canManage: boolean;
  userId: string;
}) {
  const [people, assignable] = await Promise.all([
    listProjectPeople(projectId, workspaceId),
    canManage ? listAssignableMembers(workspaceId, projectId) : Promise.resolve([]),
  ]);
  return (
    <ProjectPeople
      projectId={projectId}
      currentUserId={userId}
      canManage={canManage}
      people={people.map((p) => ({ ...p, avatarUrl: avatarUrl(p) }))}
      assignable={assignable.map((m) => ({ ...m.user, role: m.role }))}
    />
  );
}
