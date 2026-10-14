"use client";

import { useTransition } from "react";
import { MailIcon, RotateCwIcon, UserMinusIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { PersonAvatar } from "@/components/person-avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { canManageMember } from "@/lib/authz/permissions";
import { ROLE_LABELS } from "@/lib/constants";
import type { WorkspaceRole } from "@/generated/prisma/enums";
import { changeRoleAction, removeMemberAction, resendInvitationAction, revokeInvitationAction } from "@/app/actions/members";

type MemberRow = {
  id: string;
  role: WorkspaceRole;
  user: { id: string; name: string; email: string; avatarUrl: string | null };
  projects: { id: string; name: string; status: string }[];
};

type InvitationRow = {
  id: string;
  email: string;
  role: WorkspaceRole;
  expired: boolean;
  expiresAt: Date;
  project: { name: string } | null;
  invitedBy: { name: string };
};

const dateFormat = new Intl.DateTimeFormat("en", { dateStyle: "medium" });

function useRun() {
  const [pending, startTransition] = useTransition();
  const run = (action: () => Promise<{ ok: boolean; message?: string; error?: string }>) =>
    startTransition(async () => {
      const result = await action();
      if (result.ok) toast.success(result.message ?? "Saved.");
      else toast.error(result.error);
    });
  return { pending, run };
}

export function MemberList({
  slug,
  members,
  actorRole,
  actorId,
}: {
  slug: string;
  members: MemberRow[];
  actorRole: WorkspaceRole;
  actorId: string;
}) {
  const { pending, run } = useRun();
  return (
    <ul className="divide-y rounded-lg border">
      {members.map((m) => {
        const self = m.user.id === actorId;
        const manageable = !self && canManageMember(actorRole, m.role);
        return (
          <li key={m.id} className="flex flex-wrap items-center gap-3 px-3 py-3">
            <PersonAvatar person={m.user} className="size-9" />
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-sm font-medium">
                {m.user.name}
                {self && <span className="text-muted-foreground"> (you)</span>}
              </span>
              <span className="truncate text-xs text-muted-foreground">{m.user.email}</span>
              {(m.role === "MEMBER" || m.role === "CLIENT") && (
                <span className="truncate text-xs text-muted-foreground">
                  {m.projects.length === 0 ? "No project access yet" : `Projects: ${m.projects.map((p) => p.name).join(", ")}`}
                </span>
              )}
            </div>
            {manageable ? (
              <Select
                value={m.role}
                onValueChange={(role) => run(() => changeRoleAction(slug, { memberId: m.id, role }))}
                disabled={pending}
              >
                <SelectTrigger size="sm" className="w-40" aria-label={`Role for ${m.user.name}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(["ADMIN", "MEMBER", "CLIENT"] as const).map((role) => (
                    <SelectItem key={role} value={role}>
                      {ROLE_LABELS[role]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Badge variant={m.role === "OWNER" ? "default" : "secondary"}>{ROLE_LABELS[m.role]}</Badge>
            )}
            {manageable && (
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Remove ${m.user.name} from the workspace`}
                disabled={pending}
                onClick={() => {
                  if (window.confirm(`Remove ${m.user.name}? They lose access to every project in this workspace.`)) {
                    run(() => removeMemberAction(slug, { memberId: m.id }));
                  }
                }}
              >
                <UserMinusIcon />
              </Button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function InvitationList({ slug, invitations }: { slug: string; invitations: InvitationRow[] }) {
  const { pending, run } = useRun();
  if (invitations.length === 0) {
    return <p className="rounded-lg border px-3 py-6 text-center text-sm text-muted-foreground">No pending invitations.</p>;
  }
  return (
    <ul className="divide-y rounded-lg border">
      {invitations.map((i) => (
        <li key={i.id} className="flex flex-wrap items-center gap-3 px-3 py-3">
          <MailIcon className="size-4 text-muted-foreground" aria-hidden />
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-sm font-medium">{i.email}</span>
            <span className="text-xs text-muted-foreground">
              {ROLE_LABELS[i.role]}
              {i.project && ` · ${i.project.name}`} · invited by {i.invitedBy.name} ·{" "}
              {i.expired ? "expired" : `expires ${dateFormat.format(i.expiresAt)}`}
            </span>
          </div>
          {i.expired && <Badge variant="outline">Expired</Badge>}
          <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => resendInvitationAction(slug, { invitationId: i.id }))}>
            <RotateCwIcon aria-hidden /> Resend
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={pending}
            aria-label={`Revoke invitation for ${i.email}`}
            onClick={() => run(() => revokeInvitationAction(slug, { invitationId: i.id }))}
          >
            <XIcon aria-hidden /> Revoke
          </Button>
        </li>
      ))}
    </ul>
  );
}
