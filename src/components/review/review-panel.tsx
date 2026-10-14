"use client";

import { useState, useTransition } from "react";
import { CheckCircle2Icon, RotateCcwIcon, SendIcon, XCircleIcon } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PersonAvatar } from "@/components/person-avatar";
import { ReviewStateBadge } from "@/components/review-state-badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { ROLE_LABELS } from "@/lib/constants";
import { formatDateTime, timeAgo } from "@/lib/time";
import { cancelReviewAction, decideReviewAction, requestReviewAction } from "@/app/actions/review";
import { useReviewEnv } from "./review-context";
import { reviewKeys, useReviewInfo } from "./use-review-data";

/**
 * Version review status and the approval workflow: the team picks one
 * designated approver and requests review; only that person can approve or
 * request changes. Resolving comments is a separate action.
 */
export function ReviewPanel({ versionId, versionNumber, isLatest }: { versionId: string; versionNumber: number; isLatest: boolean }) {
  const { viewer, projectArchived } = useReviewEnv();
  const queryClient = useQueryClient();
  const { data: info, isPending, isError, refetch } = useReviewInfo(versionId);
  const [approverId, setApproverId] = useState("");
  const [decision, setDecision] = useState<"APPROVED" | "CHANGES_REQUESTED" | null>(null);
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();

  const run = (action: () => Promise<{ ok: boolean; message?: string; error?: string }>, after?: () => void) =>
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        toast.success(result.message ?? "Saved.");
        after?.();
      } else toast.error(result.error);
      await queryClient.invalidateQueries({ queryKey: reviewKeys.review(versionId) });
    });

  if (isPending) {
    return (
      <div className="flex flex-col gap-2 p-3" aria-busy="true">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }
  if (isError || !info) {
    return (
      <div role="alert" className="m-3 flex items-center gap-2 text-sm">
        Couldn&apos;t load review status.
        <Button size="sm" variant="outline" onClick={() => refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  const canRequest = info.canRequest && (info.reviewState === "DRAFT" || info.reviewState === "CHANGES_REQUESTED");

  return (
    <div className="flex flex-col gap-4 p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">V{versionNumber}</span>
        <ReviewStateBadge state={info.reviewState} />
        {!isLatest && <span className="text-xs text-muted-foreground">Not the latest version</span>}
      </div>

      {info.openRequest && (
        <div className="flex flex-col gap-2 rounded-lg border p-3">
          <p className="flex items-center gap-2">
            <PersonAvatar person={info.openRequest.approver} className="size-6" />
            <span>
              Waiting on <span className="font-medium">{info.openRequest.approver.name}</span>
            </span>
          </p>
          <p className="text-xs text-muted-foreground">
            Requested by {info.openRequest.requestedBy.name} {timeAgo(info.openRequest.createdAt)}
          </p>
          {info.canDecide && !projectArchived && (
            <div className="flex flex-wrap gap-2 pt-1">
              <Button size="sm" onClick={() => setDecision("APPROVED")} disabled={pending}>
                <CheckCircle2Icon aria-hidden /> Approve V{versionNumber}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setDecision("CHANGES_REQUESTED")} disabled={pending}>
                <RotateCcwIcon aria-hidden /> Request changes
              </Button>
            </div>
          )}
          {viewer.canRequestReview && !projectArchived && (
            <Button
              size="sm"
              variant="ghost"
              className="w-fit"
              disabled={pending}
              onClick={() => run(() => cancelReviewAction({ reviewRequestId: info.openRequest!.id }))}
            >
              <XCircleIcon aria-hidden /> Cancel review
            </Button>
          )}
        </div>
      )}

      {canRequest && !projectArchived && (
        <div className="flex flex-col gap-2 rounded-lg border p-3">
          <Label htmlFor="approver">Designated approver</Label>
          <Select value={approverId} onValueChange={setApproverId}>
            <SelectTrigger id="approver" className="w-full">
              <SelectValue placeholder="Choose who approves" />
            </SelectTrigger>
            <SelectContent>
              {info.approvers.map((person) => (
                <SelectItem key={person.id} value={person.id}>
                  {person.name} · {ROLE_LABELS[person.role]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            className="w-fit"
            disabled={!approverId || pending}
            onClick={() => run(() => requestReviewAction({ versionId, approverId }), () => setApproverId(""))}
          >
            {pending ? <Spinner /> : <SendIcon aria-hidden />} Request review
          </Button>
          <p className="text-xs text-muted-foreground">
            Only the approver can approve or request changes. Approving V{versionNumber} never approves later versions.
          </p>
        </div>
      )}

      {info.reviewState === "APPROVED" && (
        <p className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-100">
          This version is approved. Its file is locked; upload a new version for further changes.
        </p>
      )}

      <section aria-labelledby="history-heading" className="flex flex-col gap-2">
        <h3 id="history-heading" className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Decision history
        </h3>
        {info.decisions.length === 0 ? (
          <p className="text-muted-foreground">No decisions on this version yet.</p>
        ) : (
          <ol className="flex flex-col gap-3">
            {info.decisions.map((d) => (
              <li key={d.id} className="flex gap-2">
                <PersonAvatar person={d.decidedBy} className="size-6" />
                <div className="flex flex-col">
                  <span>
                    <span className="font-medium">{d.decidedBy.name}</span>{" "}
                    {d.decision === "APPROVED" ? "approved" : "requested changes on"} V{versionNumber}
                  </span>
                  <time dateTime={d.createdAt} className="text-xs text-muted-foreground">
                    {formatDateTime(d.createdAt)}
                  </time>
                  {d.note && <p className="mt-1 whitespace-pre-wrap">{d.note}</p>}
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      <Dialog open={decision !== null} onOpenChange={(open) => !open && setDecision(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{decision === "APPROVED" ? `Approve V${versionNumber}?` : "Request changes"}</DialogTitle>
            <DialogDescription>
              {decision === "APPROVED"
                ? "Your name, the time and this exact version are recorded. This can't be undone."
                : "Explain what needs to change. Pin comments on the image for specific spots."}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Label htmlFor="decision-note">{decision === "APPROVED" ? "Note (optional)" : "What should change? (optional)"}</Label>
            <Textarea id="decision-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} rows={3} />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDecision(null)}>
              Cancel
            </Button>
            <Button
              disabled={pending}
              variant={decision === "APPROVED" ? "default" : "outline"}
              onClick={() =>
                info.openRequest &&
                decision &&
                run(
                  () => decideReviewAction({ reviewRequestId: info.openRequest!.id, decision, note }),
                  () => {
                    setDecision(null);
                    setNote("");
                  },
                )
              }
            >
              {pending && <Spinner />}
              {decision === "APPROVED" ? "Approve" : "Request changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
