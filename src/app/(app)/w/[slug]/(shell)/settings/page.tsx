import type { Metadata } from "next";
import {
  DeleteWorkspace,
  GeneralSettings,
  LeaveWorkspace,
  LogoSettings,
  TransferOwnership,
} from "@/components/members/workspace-settings";
import { Separator } from "@/components/ui/separator";
import { requireUser } from "@/lib/auth/session";
import { requireWorkspacePage } from "@/lib/authz/guards";
import { can, canEditWorkspaceField } from "@/lib/authz/permissions";
import { ROLE_LABELS } from "@/lib/constants";
import { db } from "@/lib/db";
import { listMembers } from "@/server/member-service";

export const metadata: Metadata = { title: "Workspace settings" };

export default async function WorkspaceSettingsPage(props: PageProps<"/w/[slug]/settings">) {
  const { slug } = await props.params;
  const user = await requireUser();
  const { workspace, role } = await requireWorkspacePage(user.id, slug);
  const isOwner = role === "OWNER";
  const canEdit = canEditWorkspaceField(role, "name");
  const membership = await db.workspaceMember.findUniqueOrThrow({
    where: { workspaceId_userId: { workspaceId: workspace.id, userId: user.id } },
    select: { id: true },
  });
  const members = isOwner ? await listMembers(workspace.id) : [];
  const logoUrl = workspace.logoPath ? `/api/workspaces/${workspace.id}/logo?v=${encodeURIComponent(workspace.logoPath.split("/").pop() ?? "")}` : null;

  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Workspace settings</h1>
        <p className="text-sm text-muted-foreground">You&apos;re {ROLE_LABELS[role].toLowerCase()} of {workspace.name}.</p>
      </div>

      <section aria-labelledby="general-heading" className="flex flex-col gap-4">
        <h2 id="general-heading" className="font-medium">
          General
        </h2>
        <GeneralSettings slug={slug} name={workspace.name} canEdit={canEdit} />
        {canEditWorkspaceField(role, "logo") && <LogoSettings slug={slug} logoUrl={logoUrl} />}
        {!canEdit && <p className="text-sm text-muted-foreground">Only owners and admins can change workspace settings.</p>}
      </section>

      {can(role, "workspace.ownership.transfer") && (
        <>
          <Separator />
          <section aria-labelledby="ownership-heading" className="flex flex-col gap-3">
            <h2 id="ownership-heading" className="font-medium">
              Ownership
            </h2>
            <TransferOwnership
              slug={slug}
              candidates={members
                .filter((m) => m.user.id !== user.id && (m.role === "ADMIN" || m.role === "MEMBER"))
                .map((m) => ({ memberId: m.id, name: m.user.name, role: m.role }))}
            />
          </section>
        </>
      )}

      <Separator />
      <section aria-labelledby="danger-heading" className="flex flex-col gap-3">
        <h2 id="danger-heading" className="font-medium text-destructive">
          Danger zone
        </h2>
        {isOwner ? (
          <DeleteWorkspace slug={slug} name={workspace.name} />
        ) : (
          <LeaveWorkspace slug={slug} memberId={membership.id} name={workspace.name} />
        )}
      </section>
    </div>
  );
}
