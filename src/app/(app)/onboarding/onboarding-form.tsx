"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FieldGroup, FieldSeparator } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { FormField } from "@/components/forms/form-field";
import { applyServerErrors } from "@/components/forms/apply-server-errors";
import { onboardingSchema, type OnboardingInput } from "@/lib/validation/workspace";
import { createWorkspaceAction } from "./actions";

export function OnboardingForm() {
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<OnboardingInput>({
    resolver: zodResolver(onboardingSchema),
    defaultValues: { workspaceName: "", projectName: "", clientName: "" },
  });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);
    const result = await createWorkspaceAction(values);
    setFormError(applyServerErrors(result, form.setError));
  });

  return (
    <form onSubmit={onSubmit} noValidate>
      <FieldGroup>
        {formError && (
          <Alert variant="destructive">
            <AlertDescription>{formError}</AlertDescription>
          </Alert>
        )}
        <FormField
          id="workspaceName"
          label="Workspace name"
          placeholder="Northwind Studio"
          autoComplete="organization"
          registration={form.register("workspaceName")}
          error={errors.workspaceName}
        />
        <FieldSeparator>First project</FieldSeparator>
        <FormField
          id="projectName"
          label="Project name"
          placeholder="Travel Website Redesign"
          registration={form.register("projectName")}
          error={errors.projectName}
        />
        <FormField
          id="clientName"
          label="Client (optional)"
          placeholder="Skyline Travel"
          registration={form.register("clientName")}
          error={errors.clientName}
        />
        <Button type="submit" size="lg" disabled={isSubmitting}>
          {isSubmitting && <Spinner />}
          Create workspace
        </Button>
      </FieldGroup>
    </form>
  );
}
