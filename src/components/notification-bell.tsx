"use client";

import Link from "next/link";
import { BellIcon } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useRealtime } from "@/components/realtime/realtime-provider";

export const unreadQueryKey = ["notifications", "unread"] as const;

async function fetchUnread(): Promise<number> {
  const response = await fetch("/api/notifications/unread");
  if (!response.ok) throw Object.assign(new Error("Failed to load notifications"), { status: response.status });
  return ((await response.json()) as { count: number }).count;
}

export function NotificationBell({ userId, initialCount }: { userId: string; initialCount: number }) {
  const queryClient = useQueryClient();
  const { data: count = initialCount } = useQuery({ queryKey: unreadQueryKey, queryFn: fetchUnread, initialData: initialCount });

  useRealtime([`user:${userId}`], (message) => {
    if (message.type === "notification.created" || message.type === "resync") {
      void queryClient.invalidateQueries({ queryKey: unreadQueryKey });
    }
  });

  const label = count > 0 ? `Notifications, ${count} unread` : "Notifications";
  return (
    <Button variant="ghost" size="icon" className="relative" asChild>
      <Link href="/notifications" aria-label={label} title={label}>
        <BellIcon />
        {count > 0 && (
          <span
            aria-hidden
            className="absolute -top-0.5 -right-0.5 grid min-w-4 place-items-center rounded-full bg-primary px-1 text-[0.65rem] leading-4 font-semibold text-primary-foreground"
          >
            {count > 99 ? "99+" : count}
          </span>
        )}
      </Link>
    </Button>
  );
}
