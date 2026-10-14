import type { ReactNode } from "react";
import { Logo } from "@/components/brand";
import { NotificationBell } from "@/components/notification-bell";
import { avatarUrl } from "@/lib/avatar";
import type { CurrentUser } from "@/lib/auth/session";
import { countUnreadNotifications } from "@/server/user-service";
import { UserMenu } from "./user-menu";
import { VerifyEmailBanner } from "./verify-email-banner";

/** Top bar shared by workspace pages, notifications and account settings. */
export async function AppHeader({
  user,
  logoHref = "/dashboard",
  left,
  nav,
}: {
  user: CurrentUser;
  logoHref?: string;
  left?: ReactNode;
  nav?: ReactNode;
}) {
  const unread = await countUnreadNotifications(user.id);
  return (
    <>
      <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4">
          <Logo href={logoHref} className="max-sm:[&>span+*]:hidden" />
          {left}
          <div className="ml-auto flex items-center gap-1">
            <NotificationBell userId={user.id} initialCount={unread} />
            <UserMenu user={{ name: user.name, email: user.email, avatarUrl: avatarUrl(user) }} />
          </div>
        </div>
        {nav && <div className="mx-auto max-w-6xl px-2 sm:px-4">{nav}</div>}
      </header>
      {!user.emailVerified && <VerifyEmailBanner email={user.email} />}
    </>
  );
}
