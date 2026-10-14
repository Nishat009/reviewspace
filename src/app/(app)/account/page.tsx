import type { Metadata } from "next";
import { cookies } from "next/headers";
import { EmailPreferences, PasswordForm, ProfileForm, SignOutEverywhere } from "@/components/account/account-forms";
import { AppHeader } from "@/components/app-shell/app-header";
import { Separator } from "@/components/ui/separator";
import { requireUser } from "@/lib/auth/session";
import { avatarUrl } from "@/lib/avatar";
import { LAST_WORKSPACE_COOKIE } from "@/lib/constants";
import { db } from "@/lib/db";
import { paths } from "@/lib/paths";
import { getEmailPreferences } from "@/server/user-service";

export const metadata: Metadata = { title: "Account settings" };

export default async function AccountPage() {
  const user = await requireUser();
  const [preferences, account] = await Promise.all([
    getEmailPreferences(user.id),
    db.user.findUniqueOrThrow({ where: { id: user.id }, select: { passwordHash: true } }),
  ]);
  const last = (await cookies()).get(LAST_WORKSPACE_COOKIE)?.value;

  return (
    <div className="flex min-h-svh flex-col">
      <AppHeader user={user} logoHref={last ? paths.dashboard(last) : "/dashboard"} />
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-4 py-8">
        <h1 className="text-2xl font-semibold tracking-tight">Account settings</h1>

        <section aria-labelledby="profile-heading" className="flex flex-col gap-4">
          <h2 id="profile-heading" className="font-medium">
            Profile
          </h2>
          <ProfileForm name={user.name} email={user.email} avatarUrl={avatarUrl(user)} />
        </section>

        <Separator />
        <section aria-labelledby="email-heading" className="flex flex-col gap-3">
          <div>
            <h2 id="email-heading" className="font-medium">
              Email notifications
            </h2>
            <p className="text-sm text-muted-foreground">In-app notifications are always on. Choose which ones also come by email.</p>
          </div>
          <EmailPreferences preferences={preferences} />
        </section>

        <Separator />
        <section aria-labelledby="security-heading" className="flex flex-col gap-4">
          <h2 id="security-heading" className="font-medium">
            Security
          </h2>
          {account.passwordHash ? (
            <PasswordForm />
          ) : (
            <p className="text-sm text-muted-foreground">You sign in with Google, so there&apos;s no password to change.</p>
          )}
          <SignOutEverywhere />
        </section>
      </main>
    </div>
  );
}
