import type { FieldValues, Path, UseFormSetError } from "react-hook-form";
import type { ActionResult } from "@/lib/errors";

/**
 * Copies server-side field errors into react-hook-form. Returns the
 * form-level message, if any, for the caller to show above the fields.
 */
export function applyServerErrors<T extends FieldValues>(
  result: ActionResult,
  setError: UseFormSetError<T>,
): string | null {
  if (result.ok) return null;
  for (const [field, messages] of Object.entries(result.fieldErrors ?? {})) {
    if (messages?.[0]) setError(field as Path<T>, { type: "server", message: messages[0] });
  }
  return result.fieldErrors && Object.keys(result.fieldErrors).length > 0 ? null : result.error;
}
