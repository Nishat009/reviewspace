"use client";

import { createContext, useContext, type ReactNode } from "react";

/**
 * Who is looking at the editor and what they may do. Purely for showing the
 * right controls: every action is re-authorized on the server.
 */
export type ReviewViewer = {
  userId: string | null;
  name: string | null;
  isGuest: boolean;
  isTeam: boolean;
  canComment: boolean;
  canUpload: boolean;
  canRequestReview: boolean;
  seesInternal: boolean;
};

export type ReviewEnv = {
  viewer: ReviewViewer;
  /** Set on share-link pages; sent with every API call and action. */
  shareToken: string | null;
  projectArchived: boolean;
  /** Builds the link to a version/thread of this asset. */
  linkTo: (opts: { version?: string; thread?: string }) => string;
};

const ReviewEnvContext = createContext<ReviewEnv | null>(null);

export function ReviewEnvProvider({ value, children }: { value: ReviewEnv; children: ReactNode }) {
  return <ReviewEnvContext.Provider value={value}>{children}</ReviewEnvContext.Provider>;
}

export function useReviewEnv() {
  const env = useContext(ReviewEnvContext);
  if (!env) throw new Error("useReviewEnv must be used inside ReviewEnvProvider");
  return env;
}

/** fetch() that carries the share token when the page was opened via a link. */
export function apiFetch(shareToken: string | null, input: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  if (shareToken) headers.set("x-share-token", shareToken);
  return fetch(input, { ...init, headers }).then(async (response) => {
    if (!response.ok) {
      let message = "Something went wrong.";
      try {
        message = ((await response.json()) as { error?: string }).error ?? message;
      } catch {
        // non-JSON error body
      }
      throw Object.assign(new Error(message), { status: response.status });
    }
    return response.json();
  });
}
