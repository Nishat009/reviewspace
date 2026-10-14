"use client";

import { useRef, useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { PersonAvatar } from "@/components/person-avatar";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { FormField } from "@/components/forms/form-field";
import { applyServerErrors } from "@/components/forms/apply-server-errors";
import type { NotificationType } from "@/generated/prisma/enums";
import { changePasswordSchema, profileSchema, type ChangePasswordValues } from "@/lib/validation/members";
import {
  changePasswordAction,
  setEmailPreferenceAction,
  signOutEverywhereAction,
  updateAvatarAction,
  updateProfileAction,
} from "@/app/actions/account";

export function ProfileForm({ name, email, avatarUrl }: { name: string; email: string; avatarUrl: string | null }) {
  const form = useForm<{ name: string }>({ resolver: zodResolver(profileSchema), defaultValues: { name } });
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();

  const uploadAvatar = (data: FormData) =>
    startTransition(async () => {
      const result = await updateAvatarAction(data);
      if (result.ok) toast.success(result.message ?? "Saved.");
      else toast.error(result.error);
    });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-4">
        <PersonAvatar person={{ name, avatarUrl }} className="size-16 text-lg" />
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => inputRef.current?.click()}>
            {pending && <Spinner />} Change photo
          </Button>
          {avatarUrl && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={() => {
                const data = new FormData();
                data.set("remove", "1");
                uploadAvatar(data);
              }}
            >
              Remove
            </Button>
          )}
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="sr-only"
            aria-label="Choose a profile photo"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              if (file.size > 5 * 1024 * 1024) {
                toast.error("Use an image up to 5 MB.");
                return;
              }
              const data = new FormData();
              data.set("avatar", file);
              uploadAvatar(data);
            }}
          />
        </div>
      </div>
      <form
        noValidate
        className="max-w-md"
        onSubmit={form.handleSubmit(async (values) => {
          const result = await updateProfileAction(values);
          if (result.ok) toast.success(result.message ?? "Saved.");
          else applyServerErrors(result, form.setError);
        })}
      >
        <FieldGroup>
          <FormField id="profile-name" label="Name" autoComplete="name" registration={form.register("name")} error={form.formState.errors.name} />
          <p className="-mt-2 text-sm text-muted-foreground">Email: {email}</p>
          <Button type="submit" className="w-fit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting && <Spinner />} Save profile
          </Button>
        </FieldGroup>
      </form>
    </div>
  );
}

export function PasswordForm() {
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<ChangePasswordValues>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
  });
  const { errors, isSubmitting } = form.formState;
  return (
    <form
      noValidate
      className="max-w-md"
      onSubmit={form.handleSubmit(async (values) => {
        setFormError(null);
        const result = await changePasswordAction(values);
        if (!result.ok) setFormError(applyServerErrors(result, form.setError));
      })}
    >
      <FieldGroup>
        <FormField
          id="current-password"
          type="password"
          label="Current password"
          autoComplete="current-password"
          registration={form.register("currentPassword")}
          error={errors.currentPassword}
        />
        <FormField
          id="new-password"
          type="password"
          label="New password"
          autoComplete="new-password"
          description="At least 10 characters."
          registration={form.register("newPassword")}
          error={errors.newPassword}
        />
        <FormField
          id="confirm-password"
          type="password"
          label="Confirm new password"
          autoComplete="new-password"
          registration={form.register("confirmPassword")}
          error={errors.confirmPassword}
        />
        {formError && (
          <p role="alert" className="text-sm text-destructive">
            {formError}
          </p>
        )}
        <Button type="submit" className="w-fit" disabled={isSubmitting}>
          {isSubmitting && <Spinner />} Change password
        </Button>
        <p className="text-xs text-muted-foreground">Changing your password signs you out on every device, including this one.</p>
      </FieldGroup>
    </form>
  );
}

const PREFERENCE_LABELS: Partial<Record<NotificationType, string>> = {
  MENTION: "Someone mentions me",
  THREAD_REPLY: "Someone replies in a thread I'm part of",
  REVIEW_REQUESTED: "I'm asked to review a version",
  CHANGES_REQUESTED: "A reviewer requests changes on my version",
  VERSION_APPROVED: "A version I requested or uploaded is approved",
};

export function EmailPreferences({ preferences }: { preferences: Record<string, boolean> }) {
  const [values, setValues] = useState(preferences);
  const [pending, startTransition] = useTransition();
  return (
    <ul className="flex max-w-xl flex-col divide-y rounded-lg border">
      {Object.entries(PREFERENCE_LABELS).map(([type, label]) => (
        <li key={type} className="flex items-center justify-between gap-4 px-3 py-3">
          <Label htmlFor={`pref-${type}`} className="font-normal">
            {label}
          </Label>
          <Switch
            id={`pref-${type}`}
            checked={values[type] !== false}
            disabled={pending}
            onCheckedChange={(checked) => {
              setValues((v) => ({ ...v, [type]: checked }));
              startTransition(async () => {
                const result = await setEmailPreferenceAction(type as NotificationType, checked);
                if (!result.ok) {
                  toast.error(result.error);
                  setValues((v) => ({ ...v, [type]: !checked }));
                }
              });
            }}
          />
        </li>
      ))}
    </ul>
  );
}

export function SignOutEverywhere() {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="outline"
      className="w-fit"
      disabled={pending}
      onClick={() => {
        if (window.confirm("Sign out on every device, including this one?")) startTransition(() => void signOutEverywhereAction());
      }}
    >
      {pending && <Spinner />} Sign out everywhere
    </Button>
  );
}
