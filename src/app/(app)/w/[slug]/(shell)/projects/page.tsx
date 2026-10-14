import type { Metadata } from "next";
import Link from "next/link";
import { FolderIcon } from "lucide-react";
import { NewProjectDialog } from "@/components/projects/new-project-dialog";
import { ProjectCard } from "@/components/projects/project-card";
import { ProjectFilters } from "@/components/projects/project-filters";
import { Badge } from "@/components/ui/badge";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireUser } from "@/lib/auth/session";
import { requireWorkspacePage } from "@/lib/authz/guards";
import { can } from "@/lib/authz/permissions";
import { paths } from "@/lib/paths";
import { projectListQuerySchema } from "@/lib/validation/project";
import { listProjects } from "@/server/project-service";

export const metadata: Metadata = { title: "Projects" };

const dateFormat = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" });

export default async function ProjectsPage(props: PageProps<"/w/[slug]/projects">) {
  const { slug } = await props.params;
  const search = await props.searchParams;
  const filter = projectListQuerySchema.parse({ q: search.q, status: search.status, view: search.view });
  const user = await requireUser();
  const { workspace, role } = await requireWorkspacePage(user.id, slug);
  const projects = await listProjects(user.id, workspace.id, role, filter);
  const canCreate = can(role, "project.create");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
        {canCreate && <NewProjectDialog slug={slug} defaultOpen={search.new === "1"} />}
      </div>
      <ProjectFilters />

      {projects.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FolderIcon />
            </EmptyMedia>
            <EmptyTitle>{filter.q || filter.status ? "No matching projects" : "No projects yet"}</EmptyTitle>
            <EmptyDescription>
              {filter.q || filter.status
                ? "Try a different search or status."
                : canCreate
                  ? "Create a project to start collecting feedback."
                  : "You'll see projects here once someone adds you to one."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : filter.view === "list" ? (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Project</TableHead>
                <TableHead className="max-sm:hidden">Client</TableHead>
                <TableHead>Assets</TableHead>
                <TableHead className="max-sm:hidden">Due</TableHead>
                <TableHead className="max-md:hidden">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {projects.map((project) => (
                <TableRow key={project.id}>
                  <TableCell className="font-medium">
                    <Link href={paths.project(slug, project.id)} className="hover:underline">
                      {project.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground max-sm:hidden">{project.clientName ?? "—"}</TableCell>
                  <TableCell>{project._count.assets}</TableCell>
                  <TableCell className="text-muted-foreground max-sm:hidden">
                    {project.dueDate ? dateFormat.format(project.dueDate) : "—"}
                  </TableCell>
                  <TableCell className="max-md:hidden">
                    <Badge variant={project.status === "ACTIVE" ? "secondary" : "outline"}>
                      {project.status === "ACTIVE" ? "Active" : "Archived"}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <li key={project.id}>
              <ProjectCard slug={slug} project={project} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
