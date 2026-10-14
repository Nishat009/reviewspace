"use client";

import { useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { applyServerErrors } from "@/components/forms/apply-server-errors";
import { inviteSchema, type InviteFormValues } from "@/lib/validation/members";
import { inviteMemberAction } from "@/app/actions/members";

const ROLE_HELP = {
  ADMIN: "Manages members and every project.",
  MEMBER: "Team member: uploads, comments and requests reviews on assigned projects.",
  CLIENT: "Client reviewer: views, comments and approves assigned projects only.",
} as const;

export function InviteForm({ slug, projects }: { slug: string; projects: { id: string; name: string }[] }) {
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<InviteFormValues>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { email: "", role: "CLIENT", projectId: "" },
  });
  const { errors, isSubmitting } = form.formState;
  const role = useWatch({ control: form.control, name: "role" });

  const submit = form.handleSubmit(async () => {
    setFormError(null);
    const result = await inviteMemberAction(slug, form.getValues());
    if (result.ok) {
      toast.success(result.message ?? "Invitation sent.");
      form.reset({ email: "", role: form.getValues("role"), projectId: form.getValues("projectId") });
    } else setFormError(applyServerErrors(result, form.setError));
  });

  return (
    <form onSubmit={submit} noValidate className="grid gap-4 rounded-lg border p-4 md:grid-cols-[1fr_12rem_14rem_auto] md:items-start">
      <Field data-invalid={!!errors.email}>
        <FieldLabel htmlFor="invite-email">Email</FieldLabel>
        <Input id="invite-email" type="email" autoComplete="off" aria-invalid={!!errors.email} {...form.register("email")} />
        <FieldError errors={errors.email ? [errors.email] : undefined} />
      </Field>
      <Field data-invalid={!!errors.role}>
        <FieldLabel htmlFor="invite-role">Role</FieldLabel>
        <Controller
          control={form.control}
          name="role"
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger id="invite-role" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="CLIENT">Client reviewer</SelectItem>
                <SelectItem value="MEMBER">Member</SelectItem>
                <SelectItem value="ADMIN">Admin</SelectItem>
              </SelectContent>
            </Select>
          )}
        />
      </Field>
      <Field data-invalid={!!errors.projectId}>
        <FieldLabel htmlFor="invite-project">Project access</FieldLabel>
        <Controller
          control={form.control}
          name="projectId"
          render={({ field }) => (
            <Select value={field.value || "none"} onValueChange={(v) => field.onChange(v === "none" ? "" : v)}>
              <SelectTrigger id="invite-project" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{role === "ADMIN" ? "All projects" : "No project yet"}</SelectItem>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      </Field>
      <div className="flex flex-col gap-2 md:pt-6">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting && <Spinner />} Send invite
        </Button>
      </div>
      <FieldDescription className="md:col-span-4">{ROLE_HELP[role]} Invitations expire after 7 days.</FieldDescription>
      {formError && (
        <p role="alert" className="text-sm text-destructive md:col-span-4">
          {formError}
        </p>
      )}
    </form>
  );
}
