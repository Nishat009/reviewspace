"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { FormField } from "@/components/forms/form-field";
import { applyServerErrors } from "@/components/forms/apply-server-errors";
import { signUpSchema, type SignUpInput } from "@/lib/validation/auth";
import { signUpAction } from "../actions";

export function SignUpForm({ callbackUrl }: { callbackUrl: string }) {
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<SignUpInput>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { name: "", email: "", password: "" },
  });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);
    const result = await signUpAction(values, callbackUrl);
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
        <FormField id="name" label="Name" autoComplete="name" registration={form.register("name")} error={errors.name} />
        <FormField
          id="email"
          label="Work email"
          type="email"
          autoComplete="email"
          registration={form.register("email")}
          error={errors.email}
        />
        <FormField
          id="password"
          label="Password"
          type="password"
          autoComplete="new-password"
          description="At least 10 characters."
          registration={form.register("password")}
          error={errors.password}
        />
        <Button type="submit" size="lg" disabled={isSubmitting}>
          {isSubmitting && <Spinner />}
          Create account
        </Button>
      </FieldGroup>
    </form>
  );
}
