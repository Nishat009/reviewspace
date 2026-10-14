"use client";

import { useEffect, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2Icon, LockIcon, MessageSquareIcon, MessageSquarePlusIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { PersonAvatar } from "@/components/person-avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import type { ThreadDTO } from "@/lib/review-types";
import { timeAgo } from "@/lib/time";
import { cn } from "@/lib/utils";
import { createThreadAction } from "@/app/actions/review";
import { CommentComposer } from "./comment-composer";
import { useEditor, useEditorStore, type ThreadFilter } from "./editor-store";
import { useReviewEnv } from "./review-context";
import { ThreadDetail } from "./thread-detail";
import { reviewKeys } from "./use-review-data";

const newMutationId = () => crypto.randomUUID();

const FILTER_LABELS: Record<ThreadFilter, string> = { open: "Open", resolved: "Resolved", all: "All" };

export function ThreadPanel({
  versionId,
  threads,
  isPending,
  isError,
  onRetry,
}: {
  versionId: string;
  threads: ThreadDTO[];
  isPending: boolean;
  isError: boolean;
  onRetry: () => void;
}) {
  const { viewer, projectArchived } = useReviewEnv();
  const store = useEditorStore();
  const filter = useEditor((s) => s.filter);
  const selectedThreadId = useEditor((s) => s.selectedThreadId);
  const draft = useEditor((s) => s.draft);

  const counts = {
    open: threads.filter((t) => !t.resolvedAt).length,
    resolved: threads.filter((t) => t.resolvedAt).length,
    all: threads.length,
  };
  const visible = threads.filter((t) => (filter === "all" ? true : filter === "open" ? !t.resolvedAt : !!t.resolvedAt));

  // A deep-linked thread that's resolved should still be visible.
  useEffect(() => {
    const selected = threads.find((t) => t.id === selectedThreadId);
    if (selected && !visible.includes(selected)) store.getState().setFilter("all");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedThreadId, threads.length]);

  // J / K move between threads; the pin follows.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key !== "j" && event.key !== "k") return;
      const list = visible;
      if (list.length === 0) return;
      const index = list.findIndex((t) => t.id === store.getState().selectedThreadId);
      const next = event.key === "j" ? (index + 1) % list.length : (index - 1 + list.length) % list.length;
      store.getState().selectThread(list[next]!.id);
      document.getElementById(`thread-${list[next]!.id}`)?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [store, visible]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-1 border-b px-3 py-2" role="tablist" aria-label="Filter threads">
        {(["open", "resolved", "all"] as ThreadFilter[]).map((value) => (
          <button
            key={value}
            role="tab"
            type="button"
            aria-selected={filter === value}
            onClick={() => store.getState().setFilter(value)}
            className={cn(
              "rounded-md px-2.5 py-1 text-sm",
              filter === value ? "bg-muted font-medium" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {FILTER_LABELS[value]} <span className="tabular-nums">({counts[value]})</span>
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {draft && <NewThreadComposer versionId={versionId} />}

        {isPending ? (
          <div className="flex flex-col gap-3 p-3" aria-busy="true" aria-label="Loading comments">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : isError ? (
          <div role="alert" className="m-3 flex flex-col items-start gap-2 rounded-lg border border-destructive/40 p-3 text-sm">
            We couldn&apos;t load the comments.
            <Button size="sm" variant="outline" onClick={onRetry}>
              Try again
            </Button>
          </div>
        ) : visible.length === 0 && !draft ? (
          <div className="flex flex-col items-center gap-2 px-6 py-12 text-center text-sm text-muted-foreground">
            <MessageSquareIcon className="size-6" aria-hidden />
            {threads.length === 0 ? (
              viewer.canComment && !projectArchived ? (
                <>
                  <p>No comments yet.</p>
                  <Button size="sm" variant="outline" onClick={() => store.getState().setMode("comment")}>
                    <MessageSquarePlusIcon aria-hidden /> Add the first comment
                  </Button>
                </>
              ) : (
                <p>No comments on this version yet.</p>
              )
            ) : (
              <p>No {filter} threads.</p>
            )}
          </div>
        ) : (
          <ul className="flex flex-col">
            {visible.map((thread) => (
              <ThreadListItem key={thread.id} thread={thread} versionId={versionId} selected={thread.id === selectedThreadId} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function ThreadListItem({ thread, versionId, selected }: { thread: ThreadDTO; versionId: string; selected: boolean }) {
  const store = useEditorStore();
  const ref = useRef<HTMLLIElement>(null);
  useEffect(() => {
    if (selected) ref.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selected]);

  return (
    <li ref={ref} className={cn("border-b", selected && "bg-muted/50")}>
      <button
        id={`thread-${thread.id}`}
        type="button"
        aria-expanded={selected}
        aria-controls={`thread-body-${thread.id}`}
        onClick={() => store.getState().selectThread(selected ? null : thread.id)}
        onMouseEnter={() => store.getState().hoverThread(thread.id)}
        onMouseLeave={() => store.getState().hoverThread(null)}
        onFocus={() => store.getState().hoverThread(thread.id)}
        onBlur={() => store.getState().hoverThread(null)}
        className="flex w-full items-start gap-2.5 px-3 py-2.5 text-left outline-none hover:bg-muted/60 focus-visible:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
      >
        <span
          className={cn(
            "mt-0.5 grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold",
            thread.visibility === "INTERNAL"
              ? "bg-violet-600 text-white"
              : thread.resolvedAt
                ? "border bg-background text-muted-foreground"
                : "bg-primary text-primary-foreground",
          )}
          aria-hidden
        >
          {thread.number}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex items-center gap-1.5 text-sm">
            <PersonAvatar person={thread.createdBy} className="size-5 [&_[data-slot=avatar-fallback]]:text-[0.55rem]" />
            <span className="truncate font-medium">{thread.createdBy.name}</span>
            {thread.createdBy.isGuest && <span className="text-[10px] text-muted-foreground uppercase">guest</span>}
            <span className="ml-auto shrink-0 text-xs text-muted-foreground">{timeAgo(thread.lastActivityAt)}</span>
          </span>
          <span className={cn("text-sm", thread.preview ? "line-clamp-2" : "text-muted-foreground italic")}>
            {thread.preview ?? "Comment deleted"}
          </span>
          <span className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="sr-only">Thread {thread.number}.</span>
            {thread.commentCount > 1 && (
              <span>
                {thread.commentCount - 1} {thread.commentCount === 2 ? "reply" : "replies"}
              </span>
            )}
            {thread.visibility === "INTERNAL" && (
              <span className="inline-flex items-center gap-0.5 text-violet-700 dark:text-violet-300">
                <LockIcon className="size-3" aria-hidden /> Internal
              </span>
            )}
            {thread.resolvedAt && (
              <span className="inline-flex items-center gap-0.5">
                <CheckCircle2Icon className="size-3" aria-hidden /> Resolved
              </span>
            )}
          </span>
        </span>
      </button>
      {selected && (
        <div id={`thread-body-${thread.id}`} className="px-3 pt-1 pb-4">
          <ThreadDetail thread={thread} versionId={versionId} />
        </div>
      )}
    </li>
  );
}

function NewThreadComposer({ versionId }: { versionId: string }) {
  const { viewer, shareToken } = useReviewEnv();
  const queryClient = useQueryClient();
  const store = useEditorStore();
  const draft = useEditor((s) => s.draft);
  const body = useEditor((s) => s.draftBody);
  const visibility = useEditor((s) => s.draftVisibility);
  // Same key for every retry of this draft, so a resend can't duplicate it.
  const mutationId = useRef(newMutationId());

  const create = useMutation({
    mutationFn: async (input: { body: string; attachmentIds: string[]; x: number; y: number; visibility: "PUBLIC" | "INTERNAL" }) => {
      const result = await createThreadAction(
        {
          versionId,
          x: input.x,
          y: input.y,
          body: input.body,
          visibility: input.visibility,
          clientMutationId: mutationId.current,
          attachments: input.attachmentIds.map((uploadId) => ({ uploadId })),
        },
        shareToken,
      );
      if (!result.ok) throw new Error(result.error);
      return result.data!;
    },
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: reviewKeys.threads(versionId) });
      const previous = queryClient.getQueryData<ThreadDTO[]>(reviewKeys.threads(versionId));
      const now = new Date().toISOString();
      const temp: ThreadDTO = {
        id: `optimistic-${mutationId.current}`,
        number: (previous?.reduce((max, t) => Math.max(max, t.number), 0) ?? 0) + 1,
        x: input.x,
        y: input.y,
        visibility: input.visibility,
        createdBy: { id: viewer.userId ?? "me", name: viewer.name ?? "You", avatarUrl: null, isGuest: viewer.isGuest },
        createdAt: now,
        resolvedAt: null,
        resolvedBy: null,
        clientMutationId: mutationId.current,
        preview: input.body.slice(0, 140),
        commentCount: 1,
        lastActivityAt: now,
        canResolve: false,
      };
      // Drop any server copy of the same mutation, so there's never a duplicate.
      queryClient.setQueryData<ThreadDTO[]>(reviewKeys.threads(versionId), [
        ...(previous ?? []).filter((t) => t.clientMutationId !== mutationId.current),
        temp,
      ]);
      store.getState().selectThread(temp.id);
      return { previous };
    },
    onError: (error, _input, context) => {
      if (context?.previous) queryClient.setQueryData(reviewKeys.threads(versionId), context.previous);
      store.getState().selectThread(null);
      // The draft pin and text stay put so nothing is lost.
      toast.error(`Comment not posted: ${error.message}`);
    },
    onSuccess: (data) => {
      mutationId.current = newMutationId();
      store.getState().cancelDraft();
      store.getState().selectThread(data.threadId);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: reviewKeys.threads(versionId) }),
  });

  if (!draft) return null;
  return (
    <section aria-label="New comment" className="border-b bg-amber-50/60 p-3 dark:bg-amber-950/20">
      <div className="mb-2 flex items-center gap-2">
        <span className="grid size-6 place-items-center rounded-full bg-amber-500 text-xs font-semibold text-white" aria-hidden>
          +
        </span>
        <h3 className="text-sm font-medium">New comment</h3>
        <Button
          variant="ghost"
          size="icon-xs"
          className="ml-auto"
          aria-label="Cancel new comment"
          onClick={() => {
            if (!body.trim() || window.confirm("Discard this comment?")) store.getState().cancelDraft();
          }}
        >
          <XIcon />
        </Button>
      </div>
      {viewer.isTeam && (
        <div className="mb-2 flex items-center gap-2">
          <Switch
            id="internal-toggle"
            checked={visibility === "INTERNAL"}
            onCheckedChange={(checked) => store.getState().setDraftVisibility(checked ? "INTERNAL" : "PUBLIC")}
          />
          <Label htmlFor="internal-toggle" className="text-sm font-normal">
            Internal (team only — clients never see it)
          </Label>
        </div>
      )}
      <CommentComposer
        key={visibility}
        versionId={versionId}
        internal={visibility === "INTERNAL"}
        value={body}
        onChange={(value) => store.getState().setDraftBody(value)}
        autoFocus
        label="New comment"
        submitLabel="Comment"
        onCancel={() => {
          if (!body.trim()) store.getState().cancelDraft();
        }}
        onSubmit={async (markup, attachmentIds) => {
          try {
            await create.mutateAsync({ body: markup, attachmentIds, x: draft.x, y: draft.y, visibility });
            return true;
          } catch {
            return false;
          }
        }}
      />
    </section>
  );
}
