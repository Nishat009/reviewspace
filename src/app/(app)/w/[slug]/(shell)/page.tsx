import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRightIcon, ClipboardCheckIcon, FolderIcon, HistoryIcon } from "lucide-react";
import { ActivityList } from "@/components/activity-list";
import { ProjectCard } from "@/components/projects/project-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";
import { requireWorkspacePage } from "@/lib/authz/guards";
import { can, hasImplicitProjectAccess } from "@/lib/authz/permissions";
import { ROLE_LABELS } from "@/lib/constants";
import { paths } from "@/lib/paths";
import { listProjects } from "@/server/project-service";
import { listPendingReviews } from "@/server/review-service";
import { listRecentActivity } from "@/server/workspace-service";

export const metadata: Metadata = { title: "Dashboard" };

const dateFormat = new Intl.DateTimeFormat("en", { dateStyle: "medium" });

export default async function WorkspaceDashboard(props: PageProps<"/w/[slug]">) {
  const { slug } = await props.params;
  const user = await requireUser();
  const { workspace, role } = await requireWorkspacePage(user.id, slug);

  const seesAll = hasImplicitProjectAccess(role);
  const [projects, pending] = await Promise.all([
    listProjects(user.id, workspace.id, role),
    listPendingReviews(user.id, workspace.id),
  ]);
  const activity = await listRecentActivity(workspace.id, seesAll ? null : projects.map((p) => p.id));

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{workspace.name}</h1>
          <p className="text-sm text-muted-foreground">You&apos;re signed in as {ROLE_LABELS[role].toLowerCase()}.</p>
        </div>
        {can(role, "project.create") && (
          <Button asChild variant="outline">
            <Link href={`${paths.projects(slug)}?new=1`}>New project</Link>
          </Button>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <section aria-labelledby="projects-heading" className="flex flex-col gap-3 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 id="projects-heading" className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <FolderIcon className="size-4" aria-hidden /> {seesAll ? "Active projects" : "Your projects"}
            </h2>
            <Link href={paths.projects(slug)} className="text-sm text-muted-foreground hover:text-foreground">
              All projects
            </Link>
          </div>
          {projects.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                {seesAll ? "No active projects yet." : "You haven't been added to any projects yet."}
              </CardContent>
            </Card>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {projects.slice(0, 6).map((project) => (
                <li key={project.id}>
                  <ProjectCard slug={slug} project={project} />
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="flex flex-col gap-6">
          <section aria-labelledby="reviews-heading" className="flex flex-col gap-3">
            <h2 id="reviews-heading" className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <ClipboardCheckIcon className="size-4" aria-hidden /> Waiting on you
            </h2>
            <Card>
              <CardContent className="px-0">
                {pending.length === 0 ? (
                  <p className="px-4 py-2 text-center text-sm text-muted-foreground">Nothing waiting on you.</p>
                ) : (
                  <ul className="divide-y">
                    {pending.map((review) => (
                      <li key={review.id}>
                        <Link
                          href={paths.asset(slug, review.version.asset.projectId, review.version.asset.id, { version: review.version.id })}
                          className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/60"
                        >
                          <span className="flex min-w-0 flex-1 flex-col">
                            <span className="truncate text-sm font-medium">
                              {review.version.asset.name} · V{review.version.versionNumber}
                            </span>
                            <span className="truncate text-xs text-muted-foreground">
                              {review.version.asset.project.name} · from {review.requestedBy.name} ·{" "}
                              {dateFormat.format(review.createdAt)}
                            </span>
                          </span>
                          <ArrowRightIcon className="size-4 text-muted-foreground" aria-hidden />
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </section>

          <section aria-labelledby="activity-heading" className="flex flex-col gap-3">
            <h2 id="activity-heading" className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <HistoryIcon className="size-4" aria-hidden /> Recent activity
            </h2>
            <Card>
              <CardContent>
                <ActivityList events={activity} />
              </CardContent>
            </Card>
          </section>
        </div>
      </div>
    </div>
  );
}
