"use client";

import { useState, useTransition } from "react";
import { UserMinusIcon, UserPlusIcon } from "lucide-react";
import { toast } from "sonner";
import { PersonAvatar } from "@/components/person-avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ROLE_LABELS } from "@/lib/constants";
import { addProjectMemberAction, removeProjectMemberAction } from "@/app/actions/projects";

type Person = {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  role: keyof typeof ROLE_LABELS;
  explicit: boolean;
};

export function ProjectPeople({
  projectId,
  people,
  assignable,
  canManage,
  currentUserId,
}: {
  projectId: string;
  people: Person[];
  assignable: { id: string; name: string; email: string; role: keyof typeof ROLE_LABELS }[];
  canManage: boolean;
  currentUserId: string;
}) {
  const [selected, setSelected] = useState("");
  const [pending, startTransition] = useTransition();

  const run = (action: () => Promise<{ ok: boolean; message?: string; error?: string }>) =>
    startTransition(async () => {
      const result = await action();
      if (result.ok) toast.success(result.message ?? "Saved.");
      else toast.error(result.error);
    });

  return (
    <div className="flex flex-col gap-4">
      {canManage && (
        <div className="flex flex-wrap items-end gap-2 rounded-lg border p-3">
          <div className="flex min-w-56 flex-1 flex-col gap-1.5">
            <label htmlFor="add-person" className="text-sm font-medium">
              Give a workspace member access
            </label>
            <Select value={selected} onValueChange={setSelected} disabled={assignable.length === 0}>
              <SelectTrigger id="add-person" className="w-full">
                <SelectValue placeholder={assignable.length ? "Choose a member or client" : "Everyone already has access"} />
              </SelectTrigger>
              <SelectContent>
                {assignable.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name} · {ROLE_LABELS[m.role]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            disabled={!selected || pending}
            onClick={() =>
              run(async () => {
                const result = await addProjectMemberAction({ projectId, userId: selected });
                if (result.ok) setSelected("");
                return result;
              })
            }
          >
            <UserPlusIcon aria-hidden /> Add
          </Button>
          <p className="w-full text-xs text-muted-foreground">
            To bring in someone new, invite them from the Members page and pick this project.
          </p>
        </div>
      )}
      <ul className="divide-y rounded-lg border">
        {people.map((person) => (
          <li key={person.id} className="flex items-center gap-3 px-3 py-2.5">
            <PersonAvatar person={person} className="size-8" />
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-sm font-medium">
                {person.name}
                {person.id === currentUserId && <span className="text-muted-foreground"> (you)</span>}
              </span>
              <span className="truncate text-xs text-muted-foreground">{person.email}</span>
            </div>
            <Badge variant="secondary">{ROLE_LABELS[person.role]}</Badge>
            {!person.explicit && <Badge variant="outline">All projects</Badge>}
            {canManage && person.explicit && person.id !== currentUserId && (
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Remove ${person.name} from this project`}
                disabled={pending}
                onClick={() => run(() => removeProjectMemberAction({ projectId, userId: person.id }))}
              >
                <UserMinusIcon />
              </Button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
