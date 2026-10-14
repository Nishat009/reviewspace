import { z } from "zod";
import { ALLOWED_IMAGE_TYPES_LIST, clientMutationIdSchema, idSchema } from "./shared";

export const COMMENT_MAX_LENGTH = 5000;
export const REACTION_EMOJI = ["👍", "❤️", "🎉", "👀", "✅", "🤔"] as const;

const commentBody = z
  .string()
  .trim()
  .min(1, "Write a comment.")
  .max(COMMENT_MAX_LENGTH, `Keep comments under ${COMMENT_MAX_LENGTH} characters.`);

const position = z.number().finite().min(0).max(1);

export const attachmentRefSchema = z.object({
  uploadId: z.string().min(1).max(600),
});

export const createThreadSchema = z.object({
  versionId: idSchema,
  x: position,
  y: position,
  body: commentBody,
  visibility: z.enum(["PUBLIC", "INTERNAL"]).default("PUBLIC"),
  clientMutationId: clientMutationIdSchema,
  attachments: z.array(attachmentRefSchema).max(4).default([]),
});
export type CreateThreadInput = z.input<typeof createThreadSchema>;

export const replySchema = z.object({
  threadId: idSchema,
  body: commentBody,
  clientMutationId: clientMutationIdSchema,
  attachments: z.array(attachmentRefSchema).max(4).default([]),
});
export type ReplyInput = z.input<typeof replySchema>;

export const editCommentSchema = z.object({ commentId: idSchema, body: commentBody });
export const commentIdSchema = z.object({ commentId: idSchema });
export const threadIdSchema = z.object({ threadId: idSchema });
export const resolveThreadSchema = z.object({ threadId: idSchema, resolved: z.boolean() });

export const reactionSchema = z.object({
  commentId: idSchema,
  emoji: z.enum(REACTION_EMOJI),
});

export const attachmentUploadSchema = z.object({
  versionId: idSchema,
  fileName: z.string().trim().min(1).max(200),
  contentType: z.enum(ALLOWED_IMAGE_TYPES_LIST, { error: "Attach a PNG, JPEG or WebP image." }),
  sizeBytes: z.number().int().positive(),
});

export const requestReviewSchema = z.object({
  versionId: idSchema,
  approverId: idSchema,
});

export const decideReviewSchema = z.object({
  reviewRequestId: idSchema,
  decision: z.enum(["APPROVED", "CHANGES_REQUESTED"]),
  note: z
    .string()
    .trim()
    .max(1000)
    .optional()
    .transform((value) => value || undefined),
});

export const cancelReviewSchema = z.object({ reviewRequestId: idSchema });

export const guestNameSchema = z.string().trim().min(2, "Enter your name.").max(60);
