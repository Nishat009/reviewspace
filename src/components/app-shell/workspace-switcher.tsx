"use client";

import Link from "next/link";
import { CheckIcon, ChevronsUpDownIcon, PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ROLE_LABELS } from "@/lib/constants";
import type { WorkspaceRole } from "@/generated/prisma/enums";

type WorkspaceSummary = { slug: string; name: string; role: WorkspaceRole };

function WorkspaceMark({ name, logoUrl }: { name: string; logoUrl?: string | null }) {
  return logoUrl ? (
    // eslint-disable-next-line @next/next/no-img-element -- authenticated redirect to a signed URL
    <img src={logoUrl} alt="" className="size-5 rounded object-cover" />
  ) : (
    <span aria-hidden className="grid size-5 place-items-center rounded bg-muted text-[0.65rem] font-semibold">
      {name.charAt(0).toUpperCase()}
    </span>
  );
}

export function WorkspaceSwitcher({
  current,
  workspaces,
}: {
  current: WorkspaceSummary & { logoUrl?: string | null };
  workspaces: WorkspaceSummary[];
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="max-w-56 gap-2 px-2" aria-label={`Workspace: ${current.name}. Switch workspace`}>
          <WorkspaceMark name={current.name} logoUrl={current.logoUrl} />
          <span className="truncate font-medium">{current.name}</span>
          <ChevronsUpDownIcon className="text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
        <DropdownMenuGroup>
          {workspaces.map((w) => (
            <DropdownMenuItem key={w.slug} asChild>
              <Link href={`/w/${w.slug}`} aria-current={w.slug === current.slug ? "page" : undefined}>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate">{w.name}</span>
                  <span className="text-xs text-muted-foreground">{ROLE_LABELS[w.role]}</span>
                </span>
                {w.slug === current.slug && <CheckIcon aria-hidden />}
              </Link>
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/onboarding">
            <PlusIcon aria-hidden />
            New workspace
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
