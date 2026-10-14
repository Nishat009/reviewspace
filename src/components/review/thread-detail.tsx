"use client";

import { useRef, useState } from "react";
import { useMutation, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { CheckIcon, LockIcon, MoreHorizontalIcon, PencilIcon, RotateCcwIcon, SmilePlusIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { PersonAvatar } from "@/components/person-avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import type { CommentDTO, CommentPage, ThreadDTO } from "@/lib/review-types";
import { formatDateTime, timeAgo } from "@/lib/time";
import { REACTION_EMOJI } from "@/lib/validation/review";
import { cn } from "@/lib/utils";
import {
  deleteCommentAction,
  editCommentAction,
  replyAction,
  setThreadResolvedAction,
  toggleReactionAction,
} from "@/app/actions/review";
import { CommentBody } from "./comment-body";
import { markupToEditable } from "@/lib/mentions";
import { CommentComposer } from "./comment-composer";
import { useEditorStore } from "./editor-store";
import { useReviewEnv } from "./review-context";
import { reviewKeys, useComments } from "./use-review-data";

const newMutationId = () => crypto.randomUUID();

export function ThreadDetail({ thread, versionId }: { thread: ThreadDTO; versionId: string }) {
  const { viewer, shareToken, projectArchived } = useReviewEnv();
  const queryClient = useQueryClient();
  const store = useEditorStore();
  const comments = useComments(thread.id);
  const [replyText, setReplyText] = useState("");
  // One idempotency key per reply attempt: a retried send can't duplicate it.
  const mutationId = useRef(newMutationId());
  const optimistic = thread.id.startsWith("optimistic-");
  const canReply = viewer.canComment && !projectArchived && !optimistic && (!viewer.isGuest || !!viewer.userId);

  const invalidate = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: reviewKeys.comments(thread.id) }),
      queryClient.invalidateQueries({ queryKey: reviewKeys.threads(versionId) }),
    ]);

  const reply = useMutation({
    mutationFn: async ({ body, attachmentIds, clientMutationId }: { body: string; attachmentIds: string[]; clientMutationId: string }) => {
      const result = await replyAction(
        { threadId: thread.id, body, clientMutationId, attachments: attachmentIds.map((uploadId) => ({ uploadId })) },
        shareToken,
      );
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    onMutate: async ({ body, clientMutationId }) => {
      await queryClient.cancelQueries({ queryKey: reviewKeys.comments(thread.id) });
      const previous = queryClient.getQueryData<InfiniteData<CommentPage>>(reviewKeys.comments(thread.id));
      const temp: CommentDTO = {
        id: `optimistic-${clientMutationId}`,
        threadId: thread.id,
        body,
        author: { id: viewer.userId ?? "me", name: viewer.name ?? "You", avatarUrl: null, isGuest: viewer.isGuest },
        createdAt: new Date().toISOString(),
        editedAt: null,
        deletedAt: null,
        clientMutationId,
        reactions: [],
        attachments: [],
        canEdit: false,
      };
      if (previous?.pages[0]) {
        queryClient.setQueryData<InfiniteData<CommentPage>>(reviewKeys.comments(thread.id), {
          ...previous,
          pages: [{ ...previous.pages[0], comments: [temp, ...previous.pages[0].comments] }, ...previous.pages.slice(1)],
        });
      }
      return { previous };
    },
    onError: (error, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(reviewKeys.comments(thread.id), context.previous);
      toast.error(`Reply not sent: ${error.message}`);
    },
    onSuccess: () => {
      setReplyText("");
      mutationId.current = newMutationId();
    },
    onSettled: () => invalidate(),
  });

  const resolve = useMutation({
    mutationFn: async (resolved: boolean) => {
      const result = await setThreadResolvedAction({ threadId: thread.id, resolved }, shareToken);
      if (!result.ok) throw new Error(result.error);
    },
    onError: (error) => toast.error(error.message),
    onSuccess: (_data, resolved) => {
      toast.success(resolved ? `Thread #${thread.number} resolved.` : `Thread #${thread.number} reopened.`);
      if (resolved && store.getState().filter === "open") store.getState().selectThread(null);
    },
    onSettled: () => invalidate(),
  });

  // Pages arrive newest-first; show oldest-first.
  const ordered = (comments.data?.pages ?? []).flatMap((p) => p.comments).slice().reverse();

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {thread.visibility === "INTERNAL" && (
          <Badge variant="outline" className="border-violet-300 text-violet-800 dark:text-violet-200">
            <LockIcon aria-hidden /> Internal — team only
          </Badge>
        )}
        {thread.resolvedAt && (
          <span className="text-xs text-muted-foreground">
            Resolved by {thread.resolvedBy?.name ?? "someone"} {timeAgo(thread.resolvedAt)}
          </span>
        )}
        {thread.canResolve && !projectArchived && !optimistic && (
          <Button
            variant="outline"
            size="sm"
            className="ml-auto"
            disabled={resolve.isPending}
            onClick={() => resolve.mutate(!thread.resolvedAt)}
          >
            {thread.resolvedAt ? (
              <>
                <RotateCcwIcon aria-hidden /> Reopen
              </>
            ) : (
              <>
                <CheckIcon aria-hidden /> Resolve
              </>
            )}
          </Button>
        )}
      </div>

      {comments.hasNextPage && (
        <Button variant="ghost" size="sm" onClick={() => comments.fetchNextPage()} disabled={comments.isFetchingNextPage}>
          {comments.isFetchingNextPage ? "Loading…" : "Show earlier comments"}
        </Button>
      )}

      {optimistic || comments.isPending ? (
        <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading comments">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-4/5" />
        </div>
      ) : comments.isError ? (
        <div role="alert" className="flex items-center justify-between gap-2 rounded-md border border-destructive/40 p-2 text-sm">
          Couldn&apos;t load comments.
          <Button size="sm" variant="outline" onClick={() => comments.refetch()}>
            Retry
          </Button>
        </div>
      ) : (
        <ol className="flex flex-col gap-4">
          {ordered.map((comment) => (
            <CommentItem key={comment.id} comment={comment} versionId={versionId} internal={thread.visibility === "INTERNAL"} onChanged={invalidate} />
          ))}
        </ol>
      )}

      {canReply && (
        <CommentComposer
          versionId={versionId}
          internal={thread.visibility === "INTERNAL"}
          value={replyText}
          onChange={setReplyText}
          label={`Reply to thread ${thread.number}`}
          placeholder={thread.visibility === "INTERNAL" ? "Reply internally (team only)…" : "Reply…"}
          submitLabel="Reply"
          onSubmit={async (body, attachmentIds) => {
            try {
              await reply.mutateAsync({ body, attachmentIds, clientMutationId: mutationId.current });
              return true;
            } catch {
              return false; // text stays in the box for another try
            }
          }}
        />
      )}
    </div>
  );
}

function CommentItem({
  comment,
  versionId,
  internal,
  onChanged,
}: {
  comment: CommentDTO;
  versionId: string;
  internal: boolean;
  onChanged: () => Promise<unknown>;
}) {
  const { shareToken, viewer, projectArchived } = useReviewEnv();
  const [editing, setEditing] = useState(false);
  const [editState] = useState(() => (comment.body ? markupToEditable(comment.body) : null));
  const [editText, setEditText] = useState(editState?.text ?? "");
  const pending = comment.id.startsWith("optimistic-");

  const react = useMutation({
    mutationFn: async (emoji: string) => {
      const result = await toggleReactionAction({ commentId: comment.id, emoji }, shareToken);
      if (!result.ok) throw new Error(result.error);
    },
    onError: (error) => toast.error(error.message),
    onSettled: () => onChanged(),
  });

  const remove = useMutation({
    mutationFn: async () => {
      const result = await deleteCommentAction(comment.id, shareToken);
      if (!result.ok) throw new Error(result.error);
    },
    onError: (error) => toast.error(error.message),
    onSuccess: () => toast.success("Comment deleted."),
    onSettled: () => onChanged(),
  });

  const canReact = viewer.canComment && !projectArchived && !pending && !comment.deletedAt && !!viewer.userId;

  return (
    <li className={cn("flex gap-2.5", pending && "opacity-60")} aria-busy={pending || undefined}>
      <PersonAvatar person={comment.author} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="text-sm font-medium">{comment.author.name}</span>
          {comment.author.isGuest && (
            <Badge variant="outline" className="h-4 px-1.5 text-[10px]">
              Guest
            </Badge>
          )}
          <time dateTime={comment.createdAt} title={formatDateTime(comment.createdAt)} className="text-xs text-muted-foreground">
            {pending ? "Sending…" : timeAgo(comment.createdAt)}
          </time>
          {comment.editedAt && !comment.deletedAt && (
            <span className="text-xs text-muted-foreground" title={`Edited ${formatDateTime(comment.editedAt)}`}>
              (edited)
            </span>
          )}
          {comment.canEdit && !editing && !projectArchived && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-xs" className="ml-auto" aria-label="Comment actions">
                  <MoreHorizontalIcon />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => setEditing(true)}>
                  <PencilIcon aria-hidden /> Edit
                </DropdownMenuItem>
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={() => {
                    if (window.confirm("Delete this comment? This can't be undone.")) remove.mutate();
                  }}
                >
                  <Trash2Icon aria-hidden /> Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {comment.deletedAt ? (
          <p className="text-sm text-muted-foreground italic">This comment was deleted.</p>
        ) : editing ? (
          <CommentComposer
            versionId={versionId}
            internal={internal}
            value={editText}
            onChange={setEditText}
            initialMentions={editState?.mentions}
            allowAttachments={false}
            autoFocus
            label="Edit comment"
            submitLabel="Save"
            onCancel={() => setEditing(false)}
            onSubmit={async (body) => {
              const result = await editCommentAction({ commentId: comment.id, body }, shareToken);
              if (!result.ok) {
                toast.error(result.error);
                return false;
              }
              setEditing(false);
              await onChanged();
              return true;
            }}
          />
        ) : (
          comment.body && <CommentBody body={comment.body} />
        )}

        {comment.attachments.length > 0 && (
          <ul className="flex flex-wrap gap-2" aria-label="Attachments">
            {comment.attachments.map((a) => (
              <li key={a.id}>
                {a.url ? (
                  <a href={a.url} target="_blank" rel="noreferrer" className="block size-20 overflow-hidden rounded-md border">
                    {/* eslint-disable-next-line @next/next/no-img-element -- signed, short-lived URL */}
                    <img src={a.url} alt={a.fileName} className="size-full object-cover" />
                  </a>
                ) : (
                  <span className="text-xs text-muted-foreground">{a.fileName}</span>
                )}
              </li>
            ))}
          </ul>
        )}

        {(comment.reactions.length > 0 || canReact) && !comment.deletedAt && (
          <div className="flex flex-wrap items-center gap-1">
            {comment.reactions.map((r) => (
              <button
                key={r.emoji}
                type="button"
                disabled={!canReact || react.isPending}
                onClick={() => react.mutate(r.emoji)}
                aria-pressed={r.mine}
                aria-label={`${r.emoji} ${r.count}: ${r.names.join(", ")}`}
                title={r.names.join(", ")}
                className={cn(
                  "inline-flex h-6 items-center gap-1 rounded-full border px-2 text-xs",
                  r.mine ? "border-primary/50 bg-primary/10" : "hover:bg-muted",
                )}
              >
                <span aria-hidden>{r.emoji}</span>
                <span aria-hidden>{r.count}</span>
              </button>
            ))}
            {canReact && (
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="icon-xs" aria-label="Add reaction">
                    <SmilePlusIcon />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-1" align="start">
                  <div className="flex gap-0.5">
                    {REACTION_EMOJI.map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        className="rounded-md p-1.5 text-lg hover:bg-muted"
                        onClick={() => react.mutate(emoji)}
                        aria-label={`React with ${emoji}`}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
            )}
          </div>
        )}
      </div>
    </li>
  );
}
