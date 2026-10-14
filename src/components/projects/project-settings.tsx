"use client";

import { useTransition } from "react";
import { ArchiveIcon, ArchiveRestoreIcon } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { setProjectArchivedAction, updateProjectAction } from "@/app/actions/projects";
import { ProjectForm } from "./project-form";

export function ProjectSettings({
  project,
}: {
  project: { id: string; name: string; description: string | null; clientName: string | null; dueDate: Date | null; status: "ACTIVE" | "ARCHIVED" };
}) {
  const [pending, startTransition] = useTransition();
  const archived = project.status === "ARCHIVED";

  const toggleArchive = () =>
    startTransition(async () => {
      const result = await setProjectArchivedAction(project.id, !archived);
      if (result.ok) toast.success(result.message ?? "Saved.");
      else toast.error(result.error);
    });

  return (
    <div className="flex flex-col gap-8">
      {!archived && (
        <section aria-labelledby="details-heading" className="flex max-w-lg flex-col gap-3">
          <h2 id="details-heading" className="font-medium">
            Details
          </h2>
          <ProjectForm
            submitLabel="Save changes"
            defaultValues={{
              name: project.name,
              description: project.description ?? "",
              clientName: project.clientName ?? "",
              dueDate: project.dueDate ? project.dueDate.toISOString().slice(0, 10) : "",
            }}
            onSubmit={async (values) => {
              const result = await updateProjectAction(project.id, values);
              if (result.ok) toast.success(result.message ?? "Saved.");
              return result;
            }}
          />
        </section>
      )}
      <section aria-labelledby="archive-heading" className="flex max-w-lg flex-col gap-3">
        <h2 id="archive-heading" className="font-medium">
          {archived ? "Restore project" : "Archive project"}
        </h2>
        <p className="text-sm text-muted-foreground">
          {archived
            ? "Restoring makes the project editable again and visible in the active list."
            : "Archived projects become read-only and leave the active list. Nothing is deleted, and you can restore it any time."}
        </p>
        {archived ? (
          <Button variant="outline" className="w-fit" onClick={toggleArchive} disabled={pending}>
            <ArchiveRestoreIcon aria-hidden /> Restore project
          </Button>
        ) : (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" className="w-fit" disabled={pending}>
                <ArchiveIcon aria-hidden /> Archive project
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Archive “{project.name}”?</AlertDialogTitle>
                <AlertDialogDescription>
                  Uploads, comments and reviews are paused and share links stop working until it&apos;s restored.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={toggleArchive}>Archive</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </section>
    </div>
  );
}
