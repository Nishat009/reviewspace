import Link from "next/link";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { CurrentUser } from "@/lib/auth/session";
import { ROLE_LABELS } from "@/lib/constants";
import type { InvitationView } from "@/server/member-service";
import { AcceptInvitationButton } from "./accept-invitation-button";

/**
 * What an invitee sees: who invited them where, and the one action that
 * makes sense for their state (sign in, switch account, or accept).
 */
export function InvitationCard({
  invitation,
  user,
  token,
  returnTo,
}: {
  invitation: InvitationView | null;
  user: CurrentUser | null;
  token?: string;
  returnTo: string;
}) {
  if (!invitation) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Invitation not found</CardTitle>
          <CardDescription>This link is invalid. Ask the person who invited you to send a new one.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const where = invitation.project ? `review “${invitation.project.name}” in ${invitation.workspace.name}` : `join ${invitation.workspace.name}`;
  const callback = encodeURIComponent(returnTo);
  const unusable =
    invitation.status === "REVOKED"
      ? "This invitation was revoked. Ask for a new one."
      : invitation.status === "PENDING" && invitation.expired
        ? "This invitation has expired. Ask for a new one."
        : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>You&apos;re invited to {where}</CardTitle>
        <CardDescription>
          {invitation.invitedBy.name} invited <span className="font-medium text-foreground">{invitation.email}</span> as{" "}
          {ROLE_LABELS[invitation.role].toLowerCase()}.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {unusable ? (
          <Alert variant="destructive">
            <AlertDescription>{unusable}</AlertDescription>
          </Alert>
        ) : invitation.status === "ACCEPTED" ? (
          <>
            <p className="text-sm text-muted-foreground">This invitation has already been accepted.</p>
            <Button asChild>
              <Link href={`/w/${invitation.workspace.slug}`}>Open {invitation.workspace.name}</Link>
            </Button>
          </>
        ) : !user ? (
          <>
            <p className="text-sm text-muted-foreground">Sign in or create an account with {invitation.email} to accept.</p>
            <Button asChild size="lg">
              <Link href={`/sign-up?callbackUrl=${callback}`}>Create an account</Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link href={`/sign-in?callbackUrl=${callback}`}>I already have an account</Link>
            </Button>
          </>
        ) : user.email !== invitation.email ? (
          <Alert>
            <AlertDescription>
              You&apos;re signed in as {user.email}, but this invitation is for {invitation.email}. Sign out and sign in with that
              address to accept it.
            </AlertDescription>
          </Alert>
        ) : (
          <AcceptInvitationButton token={token} invitationId={token ? undefined : invitation.id} />
        )}
      </CardContent>
    </Card>
  );
}
