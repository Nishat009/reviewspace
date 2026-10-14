import type { Metadata } from "next";
import { InvitationCard } from "@/components/members/invitation-card";
import { getCurrentUser } from "@/lib/auth/session";
import { paths } from "@/lib/paths";
import { getInvitationByToken } from "@/server/member-service";

export const metadata: Metadata = { title: "Invitation" };

export default async function InvitationPage(props: PageProps<"/invite/[token]">) {
  const { token } = await props.params;
  const [invitation, user] = await Promise.all([getInvitationByToken(token), getCurrentUser()]);
  return <InvitationCard invitation={invitation} user={user} token={token} returnTo={paths.invite(token)} />;
}
