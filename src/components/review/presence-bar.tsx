"use client";

import { WifiIcon, WifiOffIcon } from "lucide-react";
import { PersonAvatar } from "@/components/person-avatar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useConnectionStatus } from "@/components/realtime/realtime-provider";
import type { PresenceDTO } from "@/lib/review-types";
import { cn } from "@/lib/utils";

export function ConnectionIndicator() {
  const status = useConnectionStatus();
  const label =
    status === "live"
      ? "Live — updates appear automatically"
      : status === "reconnecting"
        ? "Reconnecting… changes will sync when back online"
        : status === "revoked"
          ? "Access changed — reload the page"
          : "Connecting…";
  const offline = status === "reconnecting" || status === "revoked";
  return (
    <span
      role="status"
      aria-live="polite"
      title={label}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs",
        offline ? "border-amber-300 bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-100" : "text-muted-foreground",
      )}
    >
      {offline ? <WifiOffIcon className="size-3" aria-hidden /> : <WifiIcon className="size-3" aria-hidden />}
      <span className={cn(!offline && "sr-only sm:not-sr-only")}>
        {status === "live" ? "Live" : status === "reconnecting" ? "Reconnecting…" : status === "revoked" ? "Disconnected" : "Connecting…"}
      </span>
      <span className="sr-only">{label}</span>
    </span>
  );
}

/** "Who's here": other people viewing this version right now. */
export function PresenceBar({ viewers, selfId }: { viewers: PresenceDTO[]; selfId: string | null }) {
  const others = viewers.filter((v) => v.userId !== selfId);
  if (others.length === 0) return null;
  const names = others.map((v) => v.name).join(", ");
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex items-center -space-x-1.5" aria-label={`Also viewing: ${names}`} role="img">
          {others.slice(0, 4).map((viewer) => (
            <PersonAvatar key={viewer.userId} person={{ name: viewer.name }} className="size-6 ring-2 ring-background" />
          ))}
          {others.length > 4 && <span className="pl-2 text-xs text-muted-foreground">+{others.length - 4}</span>}
        </div>
      </TooltipTrigger>
      <TooltipContent>{others.length === 1 ? `${names} is viewing` : `${names} are viewing`}</TooltipContent>
    </Tooltip>
  );
}
