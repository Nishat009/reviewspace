/**
 * Shapes the review API returns to the browser. Shared by route handlers,
 * server actions and client components, so it must stay free of server-only
 * imports.
 */
export type PersonDTO = { id: string; name: string; avatarUrl: string | null; isGuest: boolean };

export type ThreadDTO = {
  id: string;
  number: number;
  x: number;
  y: number;
  visibility: "PUBLIC" | "INTERNAL";
  createdBy: PersonDTO;
  createdAt: string;
  resolvedAt: string | null;
  resolvedBy: PersonDTO | null;
  clientMutationId: string;
  preview: string | null;
  commentCount: number;
  lastActivityAt: string;
  canResolve: boolean;
};

export type AttachmentDTO = { id: string; fileName: string; width: number; height: number; url: string | null };

export type ReactionDTO = { emoji: string; count: number; mine: boolean; names: string[] };

export type CommentDTO = {
  id: string;
  threadId: string;
  body: string | null;
  author: PersonDTO;
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;
  clientMutationId: string;
  reactions: ReactionDTO[];
  attachments: AttachmentDTO[];
  canEdit: boolean;
};

export type CommentPage = { comments: CommentDTO[]; nextCursor: string | null };

export type MentionCandidate = { id: string; name: string; email: string | null };

export type PresenceDTO = { userId: string; name: string; guest: boolean };
