import { z } from "zod";

/** Client-safe copies of storage limits (lib/storage is server-only). */
export const ALLOWED_IMAGE_TYPES_LIST = ["image/png", "image/jpeg", "image/webp"] as const;
export const MAX_UPLOAD_MB = 20;
export const MAX_ATTACHMENT_MB = 5;

/** Database ids (cuid). Anything else is rejected before it reaches a query. */
export const idSchema = z.string().regex(/^[a-z0-9]{10,40}$/, "Invalid id.");

/** Client-generated idempotency key for create mutations. */
export const clientMutationIdSchema = z.string().regex(/^[A-Za-z0-9_-]{8,64}$/, "Invalid request id.");
