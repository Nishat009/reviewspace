import type { Metadata } from "next";
import { cookies } from "next/headers";
import { AppHeader } from "@/components/app-shell/app-header";
import { NotificationList } from "@/components/notifications/notification-list";
import { requireUser } from "@/lib/auth/session";
import { LAST_WORKSPACE_COOKIE } from "@/lib/constants";
import { paths } from "@/lib/paths";
import { NOTIFICATION_LABELS } from "@/server/notifications";
import { listNotifications } from "@/server/user-service";

export const metadata: Metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  const user = await requireUser();
  const notifications = await listNotifications(user.id, { take: 100 });
  const last = (await cookies()).get(LAST_WORKSPACE_COOKIE)?.value;

  return (
    <div className="flex min-h-svh flex-col">
      <AppHeader user={user} logoHref={last ? paths.dashboard(last) : "/dashboard"} />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        <h1 className="mb-4 text-2xl font-semibold tracking-tight">Notifications</h1>
        <NotificationList
          userId={user.id}
          items={notifications.map((n) => {
            const label = (n.target as { label?: string }).label;
            return {
              id: n.id,
              type: n.type,
              text: `${n.actor?.name ?? "Someone"} ${NOTIFICATION_LABELS[n.type]}${label ? ` · ${label}` : ""}`,
              workspaceName: n.workspace.name,
              createdAt: n.createdAt.toISOString(),
              read: n.readAt !== null,
            };
          })}
        />
      </main>
    </div>
  );
}
