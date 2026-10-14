"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/forms/form-field";
import { applyServerErrors } from "@/components/forms/apply-server-errors";
import type { ActionResult } from "@/lib/errors";
import { projectSchema, type ProjectFormValues, type ProjectInput } from "@/lib/validation/project";

export function ProjectForm({
  defaultValues,
  submitLabel,
  onSubmit,
}: {
  defaultValues?: Partial<ProjectFormValues>;
  submitLabel: string;
  onSubmit: (values: ProjectFormValues) => Promise<ActionResult>;
}) {
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<ProjectFormValues, unknown, ProjectInput>({
    resolver: zodResolver(projectSchema),
    defaultValues: { name: "", description: "", clientName: "", dueDate: "", ...defaultValues },
  });
  const { errors, isSubmitting } = form.formState;

  const submit = form.handleSubmit(async () => {
    setFormError(null);
    // Send the raw strings; the server parses them with the same schema.
    const result = await onSubmit(form.getValues());
    setFormError(applyServerErrors(result, form.setError));
  });

  return (
    <form onSubmit={submit} noValidate>
      <FieldGroup>
        {formError && (
          <Alert variant="destructive">
            <AlertDescription>{formError}</AlertDescription>
          </Alert>
        )}
        <FormField id="project-name" label="Project name" registration={form.register("name")} error={errors.name} />
        <FormField
          id="project-client"
          label="Client or company (optional)"
          registration={form.register("clientName")}
          error={errors.clientName}
        />
        <Field data-invalid={!!errors.description}>
          <FieldLabel htmlFor="project-description">Description (optional)</FieldLabel>
          <Textarea
            id="project-description"
            rows={3}
            aria-invalid={!!errors.description}
            aria-describedby={errors.description ? "project-description-error" : undefined}
            {...form.register("description")}
          />
          <FieldError id="project-description-error" errors={errors.description ? [errors.description] : undefined} />
        </Field>
        <FormField
          id="project-due"
          type="date"
          label="Due date (optional)"
          registration={form.register("dueDate")}
          error={errors.dueDate}
        />
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting && <Spinner />}
          {submitLabel}
        </Button>
      </FieldGroup>
    </form>
  );
}
