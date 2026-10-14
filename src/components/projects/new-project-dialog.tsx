"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { createProjectAction } from "@/app/actions/projects";
import { ProjectForm } from "./project-form";

export function NewProjectDialog({ slug, defaultOpen = false }: { slug: string; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const router = useRouter();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <PlusIcon aria-hidden /> New project
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New project</DialogTitle>
          <DialogDescription>A project holds the designs you send to one client for review.</DialogDescription>
        </DialogHeader>
        <ProjectForm
          submitLabel="Create project"
          onSubmit={async (values) => {
            const result = await createProjectAction(slug, values);
            if (result.ok && result.href) router.push(result.href);
            return result;
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
