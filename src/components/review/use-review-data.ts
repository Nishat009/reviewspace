"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CommentPage, MentionCandidate, PresenceDTO, ThreadDTO } from "@/lib/review-types";
import type { ReviewInfo } from "@/server/review-service";
import { useRealtime } from "@/components/realtime/realtime-provider";
import { apiFetch, useReviewEnv } from "./review-context";

export const reviewKeys = {
  threads: (versionId: string) => ["threads", versionId] as const,
  comments: (threadId: string) => ["comments", threadId] as const,
  review: (versionId: string) => ["review", versionId] as const,
  mentionable: (versionId: string, internal: boolean) => ["mentionable", versionId, internal] as const,
  image: (versionId: string) => ["image", versionId] as const,
};

export function useThreads(versionId: string) {
  const { shareToken } = useReviewEnv();
  return useQuery({
    queryKey: reviewKeys.threads(versionId),
    queryFn: () => apiFetch(shareToken, `/api/versions/${versionId}/threads`) as Promise<ThreadDTO[]>,
  });
}

export function useComments(threadId: string | null) {
  const { shareToken } = useReviewEnv();
  return useInfiniteQuery({
    queryKey: reviewKeys.comments(threadId ?? "none"),
    enabled: !!threadId && !threadId.startsWith("optimistic-"),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      apiFetch(
        shareToken,
        `/api/threads/${threadId}/comments${pageParam ? `?cursor=${encodeURIComponent(pageParam)}` : ""}`,
      ) as Promise<CommentPage>,
    getNextPageParam: (last) => last.nextCursor,
  });
}

export function useReviewInfo(versionId: string) {
  const { shareToken } = useReviewEnv();
  return useQuery({
    queryKey: reviewKeys.review(versionId),
    queryFn: () => apiFetch(shareToken, `/api/versions/${versionId}/review`) as Promise<ReviewInfo>,
  });
}

export function useMentionCandidates(versionId: string, internal: boolean, enabled: boolean) {
  const { shareToken } = useReviewEnv();
  return useQuery({
    queryKey: reviewKeys.mentionable(versionId, internal),
    queryFn: () => apiFetch(shareToken, `/api/versions/${versionId}/mentionable${internal ? "?internal=1" : ""}`) as Promise<
      MentionCandidate[]
    >,
    enabled,
    staleTime: 5 * 60_000,
  });
}

/**
 * Live updates for the open version: realtime events invalidate exactly the
 * queries they concern, a reconnect refetches everything (catching up on
 * missed events), and presence is tracked for the "who's viewing" list.
 */
export function useVersionLive(versionId: string, assetId: string) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [viewers, setViewers] = useState<PresenceDTO[]>([]);

  useRealtime([`version:${versionId}`, `asset:${assetId}`], (message) => {
    if (message.type === "presence" && "viewers" in message) {
      if (message.channel === `version:${versionId}`) setViewers(message.viewers);
      return;
    }
    const data = ("data" in message ? message.data : undefined) ?? {};
    switch (message.type) {
      case "thread.changed":
        void queryClient.invalidateQueries({ queryKey: reviewKeys.threads(versionId) });
        if (typeof data.threadId === "string") void queryClient.invalidateQueries({ queryKey: reviewKeys.comments(data.threadId) });
        break;
      case "comment.changed":
        void queryClient.invalidateQueries({ queryKey: reviewKeys.threads(versionId) });
        if (typeof data.threadId === "string") void queryClient.invalidateQueries({ queryKey: reviewKeys.comments(data.threadId) });
        break;
      case "review.changed":
        void queryClient.invalidateQueries({ queryKey: reviewKeys.review(versionId) });
        router.refresh();
        break;
      case "version.added":
        router.refresh();
        break;
      case "resync":
        void queryClient.invalidateQueries({ queryKey: ["threads"] });
        void queryClient.invalidateQueries({ queryKey: ["comments"] });
        void queryClient.invalidateQueries({ queryKey: ["review"] });
        router.refresh();
        break;
      case "access.revoked":
        router.refresh();
        break;
    }
  });

  return { viewers };
}
