"use client";

import type { ComponentProps } from "react";
import type { FieldError as RHFFieldError, UseFormRegisterReturn } from "react-hook-form";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

type Props = {
  id: string;
  label: string;
  registration: UseFormRegisterReturn;
  error?: RHFFieldError;
  description?: string;
} & Omit<ComponentProps<typeof Input>, "id" | keyof UseFormRegisterReturn>;

/** Label + input + description + error, wired for screen readers. */
export function FormField({ id, label, registration, error, description, ...inputProps }: Props) {
  const describedBy = [description && `${id}-description`, error && `${id}-error`].filter(Boolean).join(" ");
  return (
    <Field data-invalid={!!error}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        aria-invalid={!!error}
        aria-describedby={describedBy || undefined}
        {...inputProps}
        {...registration}
      />
      {description && <FieldDescription id={`${id}-description`}>{description}</FieldDescription>}
      <FieldError id={`${id}-error`} errors={error ? [error] : undefined} />
    </Field>
  );
}
