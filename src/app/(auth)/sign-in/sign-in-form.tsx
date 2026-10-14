"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { FormField } from "@/components/forms/form-field";
import { applyServerErrors } from "@/components/forms/apply-server-errors";
import { signInSchema, type SignInInput } from "@/lib/validation/auth";
import { signInAction } from "../actions";

export function SignInForm({ callbackUrl }: { callbackUrl: string }) {
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<SignInInput>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: "", password: "" },
  });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);
    const result = await signInAction(values, callbackUrl);
    // On success the action redirects, so we only get here on failure.
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
          id="email"
          label="Email"
          type="email"
          autoComplete="email"
          registration={form.register("email")}
          error={errors.email}
        />
        <div className="flex flex-col gap-2">
          <FormField
            id="password"
            label="Password"
            type="password"
            autoComplete="current-password"
            registration={form.register("password")}
            error={errors.password}
          />
          <Link
            href="/forgot-password"
            className="self-end text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            Forgot password?
          </Link>
        </div>
        <Button type="submit" size="lg" disabled={isSubmitting}>
          {isSubmitting && <Spinner />}
          Sign in
        </Button>
      </FieldGroup>
    </form>
  );
}
