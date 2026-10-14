import type { Metadata } from "next";
import { InviteForm } from "@/components/members/invite-form";
import { InvitationList, MemberList } from "@/components/members/member-list";
import { requireUser } from "@/lib/auth/session";
import { requireWorkspacePage } from "@/lib/authz/guards";
import { can } from "@/lib/authz/permissions";
import { avatarUrl } from "@/lib/avatar";
import { listInvitations, listMembers } from "@/server/member-service";
import { listProjects } from "@/server/project-service";

export const metadata: Metadata = { title: "Members" };

export default async function MembersPage(props: PageProps<"/w/[slug]/members">) {
  const { slug } = await props.params;
  const user = await requireUser();
  // Clients can't see the member list (403).
  const { workspace, role } = await requireWorkspacePage(user.id, slug, "members.view");
  const canManage = can(role, "members.manage");

  const [members, invitations, projects] = await Promise.all([
    listMembers(workspace.id),
    canManage ? listInvitations(workspace.id) : Promise.resolve([]),
    canManage ? listProjects(user.id, workspace.id, role) : Promise.resolve([]),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Members &amp; access</h1>
        <p className="text-sm text-muted-foreground">
          Owners and admins see every project. Members and client reviewers only see projects they&apos;re added to.
        </p>
      </div>

      {canManage && (
        <section aria-labelledby="invite-heading" className="flex flex-col gap-3">
          <h2 id="invite-heading" className="font-medium">
            Invite someone
          </h2>
          <InviteForm slug={slug} projects={projects.map((p) => ({ id: p.id, name: p.name }))} />
        </section>
      )}

      <section aria-labelledby="members-heading" className="flex flex-col gap-3">
        <h2 id="members-heading" className="font-medium">
          Members <span className="text-muted-foreground">({members.length})</span>
        </h2>
        <MemberList
          slug={slug}
          actorRole={role}
          actorId={user.id}
          members={members.map((m) => ({
            id: m.id,
            role: m.role,
            projects: m.projects,
            user: { id: m.user.id, name: m.user.name, email: m.user.email, avatarUrl: avatarUrl(m.user) },
          }))}
        />
      </section>

      {canManage && (
        <section aria-labelledby="invitations-heading" className="flex flex-col gap-3">
          <h2 id="invitations-heading" className="font-medium">
            Pending invitations
          </h2>
          <InvitationList slug={slug} invitations={invitations} />
        </section>
      )}
    </div>
  );
}
