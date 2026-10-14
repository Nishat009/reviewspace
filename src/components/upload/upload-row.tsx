"use client";

import { CheckCircle2Icon, RotateCwIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import type { UploadItem } from "./use-uploads";

/** One upload's progress, processing, success or failure (with retry). */
export function UploadRow({ item, onRetry, onDismiss }: { item: UploadItem; onRetry: () => void; onDismiss: () => void }) {
  const status =
    item.status === "uploading"
      ? `Uploading ${item.progress}%`
      : item.status === "processing"
        ? "Processing…"
        : item.status === "done"
          ? `Uploaded as V${item.result?.versionNumber}`
          : (item.error ?? "Failed");
  return (
    <li className="flex items-center gap-3 rounded-lg border px-3 py-2">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center justify-between gap-2 text-sm">
          <span className="truncate font-medium">{item.file.name}</span>
          <span
            className={cn("shrink-0 text-xs", item.status === "failed" ? "text-destructive" : "text-muted-foreground")}
            role={item.status === "failed" ? "alert" : "status"}
          >
            {status}
          </span>
        </div>
        {(item.status === "uploading" || item.status === "processing") && (
          <Progress value={item.progress} aria-label={`Upload progress for ${item.file.name}`} />
        )}
      </div>
      {item.status === "processing" && <Spinner />}
      {item.status === "done" && <CheckCircle2Icon className="size-4 text-emerald-600" aria-hidden />}
      {item.status === "failed" && (
        <Button type="button" variant="outline" size="sm" onClick={onRetry}>
          <RotateCwIcon aria-hidden /> Retry
        </Button>
      )}
      {(item.status === "done" || item.status === "failed") && (
        <Button type="button" variant="ghost" size="icon-sm" onClick={onDismiss} aria-label={`Dismiss ${item.file.name}`}>
          <XIcon />
        </Button>
      )}
    </li>
  );
}
