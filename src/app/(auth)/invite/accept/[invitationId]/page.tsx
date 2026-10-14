import type { Metadata } from "next";
import { InvitationCard } from "@/components/members/invitation-card";
import { requireUser } from "@/lib/auth/session";
import { getInvitationForUser } from "@/server/member-service";

export const metadata: Metadata = { title: "Invitation" };

/** In-app acceptance from a notification (needs a verified email). */
export default async function AcceptInvitationPage(props: PageProps<"/invite/accept/[invitationId]">) {
  const { invitationId } = await props.params;
  const user = await requireUser();
  const invitation = /^[a-z0-9]{10,40}$/.test(invitationId) ? await getInvitationForUser(user.id, invitationId) : null;
  return <InvitationCard invitation={invitation} user={user} returnTo={`/invite/accept/${invitationId}`} />;
}
