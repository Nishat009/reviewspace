"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { AtSignIcon, CheckCheckIcon, CheckCircle2Icon, ClipboardCheckIcon, MailIcon, MessageSquareReplyIcon, RotateCcwIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { unreadQueryKey } from "@/components/notification-bell";
import { useRealtime } from "@/components/realtime/realtime-provider";
import type { NotificationType } from "@/generated/prisma/enums";
import { formatDateTime, timeAgo } from "@/lib/time";
import { cn } from "@/lib/utils";
import { markAllNotificationsReadAction, markNotificationReadAction, openNotificationAction } from "@/app/actions/account";

const ICONS: Record<NotificationType, typeof MailIcon> = {
  MENTION: AtSignIcon,
  THREAD_REPLY: MessageSquareReplyIcon,
  REVIEW_REQUESTED: ClipboardCheckIcon,
  CHANGES_REQUESTED: RotateCcwIcon,
  VERSION_APPROVED: CheckCircle2Icon,
  WORKSPACE_INVITATION: MailIcon,
};

export type NotificationItem = {
  id: string;
  type: NotificationType;
  text: string;
  workspaceName: string;
  createdAt: string;
  read: boolean;
};

export function NotificationList({ items, userId }: { items: NotificationItem[]; userId: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [pending, startTransition] = useTransition();
  const unread = items.filter((n) => !n.read).length;

  useRealtime([`user:${userId}`], (message) => {
    if (message.type === "notification.created" || message.type === "resync") router.refresh();
  });

  const afterChange = () => queryClient.invalidateQueries({ queryKey: unreadQueryKey });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {unread === 0 ? "You're all caught up." : `${unread} unread`}
        </p>
        <Button
          variant="outline"
          size="sm"
          disabled={unread === 0 || pending}
          onClick={() =>
            startTransition(async () => {
              const result = await markAllNotificationsReadAction();
              if (!result.ok) toast.error(result.error);
              await afterChange();
            })
          }
        >
          <CheckCheckIcon aria-hidden /> Mark all as read
        </Button>
      </div>
      {items.length === 0 ? (
        <p className="rounded-lg border px-3 py-10 text-center text-sm text-muted-foreground">
          Mentions, replies, review requests and decisions will show up here.
        </p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {items.map((n) => {
            const Icon = ICONS[n.type];
            return (
              <li key={n.id} className={cn("flex items-start gap-3 px-3 py-3", !n.read && "bg-primary/[0.03]")}>
                <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                <button
                  type="button"
                  className="flex min-w-0 flex-1 flex-col text-left"
                  onClick={() =>
                    startTransition(async () => {
                      const result = await openNotificationAction(n.id);
                      await afterChange();
                      if (result.ok && result.href) router.push(result.href);
                      else if (!result.ok) toast.error(result.error);
                    })
                  }
                >
                  <span className={cn("text-sm", !n.read && "font-medium")}>
                    {!n.read && <span className="sr-only">Unread: </span>}
                    {n.text}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {n.workspaceName} ·{" "}
                    <time dateTime={n.createdAt} title={formatDateTime(n.createdAt)}>
                      {timeAgo(n.createdAt)}
                    </time>
                  </span>
                </button>
                {!n.read && (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={pending}
                    onClick={() =>
                      startTransition(async () => {
                        await markNotificationReadAction(n.id);
                        await afterChange();
                      })
                    }
                  >
                    Mark read
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
