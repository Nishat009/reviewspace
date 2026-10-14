import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth/session";
import { GoogleButton } from "../google-button";
import { safeCallbackUrl } from "@/lib/safe-redirect";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage(props: PageProps<"/sign-in">) {
  const params = await props.searchParams;
  const callbackUrl = safeCallbackUrl(params.callbackUrl);

  if (await getCurrentUser()) redirect(callbackUrl);

  const signUpHref = `/sign-up?callbackUrl=${encodeURIComponent(callbackUrl)}`;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Sign in</CardTitle>
        <CardDescription>Welcome back. Pick up your reviews where you left off.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {params.reset === "1" && (
          <Alert>
            <AlertDescription>Password updated. Sign in with your new password.</AlertDescription>
          </Alert>
        )}
        <GoogleButton callbackUrl={callbackUrl} />
        <SignInForm callbackUrl={callbackUrl} />
      </CardContent>
      <CardFooter className="justify-center text-sm text-muted-foreground">
        New to ReviewSpace?&nbsp;
        <Link href={signUpHref} className="font-medium text-foreground underline-offset-4 hover:underline">
          Create an account
        </Link>
      </CardFooter>
    </Card>
  );
}
