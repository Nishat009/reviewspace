import { z } from "zod";
import { emailSchema, passwordSchema } from "./auth";
import { idSchema } from "./shared";

const invitableRole = z.enum(["ADMIN", "MEMBER", "CLIENT"], { error: "Choose a role." });

export const inviteSchema = z.object({
  email: emailSchema,
  role: invitableRole,
  /** Optional project to grant on accept (typical for client reviewers). */
  projectId: z
    .string()
    .optional()
    .transform((value) => value || undefined)
    .pipe(idSchema.optional()),
});
export type InviteFormValues = z.input<typeof inviteSchema>;

export const changeRoleSchema = z.object({ memberId: idSchema, role: invitableRole });
export const memberIdSchema = z.object({ memberId: idSchema });
export const invitationIdSchema = z.object({ invitationId: idSchema });
export const transferOwnershipSchema = z.object({ memberId: idSchema });

export const projectMemberSchema = z.object({ projectId: idSchema, userId: idSchema });

export const workspaceSettingsSchema = z.object({
  name: z.string().trim().min(2, "Use at least 2 characters.").max(60),
});

export const deleteWorkspaceSchema = z.object({ confirmName: z.string().trim().min(1) });

export const profileSchema = z.object({
  name: z.string().trim().min(1, "Enter your name.").max(80),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password.").max(128),
    newPassword: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match.",
  });
export type ChangePasswordValues = z.input<typeof changePasswordSchema>;

export const shareLinkSchema = z.object({
  projectId: idSchema,
  label: z
    .string()
    .trim()
    .max(60)
    .optional()
    .transform((value) => value || undefined),
  permission: z.enum(["VIEW", "COMMENT"]),
  expiresInDays: z.coerce.number().int().min(0).max(365),
  password: z
    .string()
    .max(128)
    .optional()
    .transform((value) => value || undefined)
    .pipe(z.string().min(6, "Use at least 6 characters.").optional()),
});
export type ShareLinkFormValues = z.input<typeof shareLinkSchema>;
