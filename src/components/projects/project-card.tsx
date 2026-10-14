import Link from "next/link";
import { ArchiveIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { paths } from "@/lib/paths";

type ProjectSummary = {
  id: string;
  name: string;
  clientName: string | null;
  dueDate: Date | null;
  status: "ACTIVE" | "ARCHIVED";
  _count: { assets: number; members: number };
};

const dateFormat = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" });

export function ProjectCard({ slug, project }: { slug: string; project: ProjectSummary }) {
  return (
    <Card className="relative h-full transition-colors hover:bg-muted/40">
      <CardHeader>
        <CardTitle className="truncate">
          <Link href={paths.project(slug, project.id)} className="after:absolute after:inset-0 focus-visible:outline-none">
            {project.name}
          </Link>
        </CardTitle>
        <CardDescription className="truncate">{project.clientName ?? "No client set"}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2 text-xs text-muted-foreground">
        {project.status === "ARCHIVED" && (
          <Badge variant="outline">
            <ArchiveIcon aria-hidden /> Archived
          </Badge>
        )}
        <Badge variant="secondary">
          {project._count.assets} {project._count.assets === 1 ? "asset" : "assets"}
        </Badge>
        <Badge variant="secondary">
          {project._count.members} {project._count.members === 1 ? "person" : "people"}
        </Badge>
        {project.dueDate && <Badge variant="outline">Due {dateFormat.format(project.dueDate)}</Badge>}
      </CardContent>
    </Card>
  );
}
