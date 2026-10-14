import { z } from "zod";
import { ALLOWED_IMAGE_TYPES_LIST, idSchema } from "./shared";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => value || undefined);

/** `YYYY-MM-DD` from a date input, or empty. */
const optionalDate = z
  .string()
  .trim()
  .optional()
  .refine((value) => !value || /^\d{4}-\d{2}-\d{2}$/.test(value), "Use a valid date.")
  .transform((value) => (value ? new Date(`${value}T00:00:00.000Z`) : undefined));

export const projectSchema = z.object({
  name: z.string().trim().min(2, "Use at least 2 characters.").max(80),
  description: optionalText(1000),
  clientName: optionalText(80),
  dueDate: optionalDate,
});
export type ProjectFormValues = z.input<typeof projectSchema>;
export type ProjectInput = z.output<typeof projectSchema>;

export const projectListQuerySchema = z.object({
  q: z.string().trim().max(80).optional().catch(undefined),
  status: z.enum(["active", "archived", "all"]).optional().catch(undefined),
  view: z.enum(["grid", "list"]).optional().catch(undefined),
});

export const assetNameSchema = z.string().trim().min(1, "Enter a name.").max(80);

export const startUploadSchema = z.object({
  projectId: idSchema,
  /** Existing asset for a new version, or omitted to create a new asset. */
  assetId: idSchema.optional(),
  assetName: assetNameSchema.optional(),
  fileName: z.string().trim().min(1).max(200),
  contentType: z.enum(ALLOWED_IMAGE_TYPES_LIST, { error: "Use a PNG, JPEG or WebP image." }),
  sizeBytes: z.number().int().positive(),
  changeSummary: optionalText(500),
});
export type StartUploadInput = z.input<typeof startUploadSchema>;
