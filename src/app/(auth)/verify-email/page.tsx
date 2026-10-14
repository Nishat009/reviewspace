import type { Metadata } from "next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { VerifyEmailButton } from "./verify-email-button";

export const metadata: Metadata = { title: "Verify email" };

/**
 * Verification happens on an explicit click (POST), not on page load, so link
 * scanners and prefetchers in email clients can't burn the single-use token.
 */
export default async function VerifyEmailPage(props: PageProps<"/verify-email">) {
  const { token } = await props.searchParams;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Verify your email</CardTitle>
        <CardDescription>Confirm this address to accept invitations and get review notifications.</CardDescription>
      </CardHeader>
      <CardContent>
        {typeof token === "string" && token ? (
          <VerifyEmailButton token={token} />
        ) : (
          <p className="text-sm text-muted-foreground">This link is missing its token. Open the newest email we sent you.</p>
        )}
      </CardContent>
    </Card>
  );
}
