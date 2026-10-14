"use client";

import { useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useRealtime } from "@/components/realtime/realtime-provider";

/**
 * Re-renders the current server page when something changes on the given
 * channels (debounced, so a burst of events causes one refresh).
 */
export function LiveRefresh({ channels, types }: { channels: string[]; types?: string[] }) {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useRealtime(channels, (message) => {
    if (message.type === "access.revoked") {
      toast.error("Your access to this page changed.");
      router.refresh();
      return;
    }
    if (message.type === "presence") return;
    if (types && message.type !== "resync" && !types.includes(message.type)) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => router.refresh(), 300);
  });
  return null;
}
