"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { z } from "zod";
import { signIn, signOut } from "@/auth";
import { getCurrentUser } from "@/lib/auth/session";
import { isAppError, type ActionResult } from "@/lib/errors";
import { rateLimit } from "@/lib/rate-limit";
import { safeCallbackUrl } from "@/lib/safe-redirect";
import {
  forgotPasswordSchema,
  resetPasswordSchema,
  signInSchema,
  signUpSchema,
} from "@/lib/validation/auth";
import * as authService from "@/server/auth-service";

const TOO_MANY: ActionResult = { ok: false, error: "Too many attempts. Please wait a minute and try again." };
const MINUTE = 60_000;

async function clientIp() {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}

function invalid(error: z.ZodError): ActionResult {
  return { ok: false, error: "Please fix the highlighted fields.", fieldErrors: z.flattenError(error).fieldErrors };
}

/** Signs in and redirects. Throws Next's redirect on success, so call last. */
async function signInAndRedirect(email: string, password: string, redirectTo: string): Promise<ActionResult> {
  try {
    await signIn("credentials", { email, password, redirectTo });
    return { ok: true };
  } catch (error) {
    if (error instanceof AuthError) {
      return { ok: false, error: "Incorrect email or password." };
    }
    throw error; // includes the redirect "error"
  }
}

export async function signUpAction(values: unknown, callbackUrl?: string): Promise<ActionResult> {
  const parsed = signUpSchema.safeParse(values);
  if (!parsed.success) return invalid(parsed.error);
  if (!rateLimit(`sign-up:${await clientIp()}`, 5, 10 * MINUTE)) return TOO_MANY;

  try {
    await authService.signUp(parsed.data);
  } catch (error) {
    if (isAppError(error)) return { ok: false, error: error.message, fieldErrors: { email: [error.message] } };
    throw error;
  }
  return signInAndRedirect(parsed.data.email, parsed.data.password, safeCallbackUrl(callbackUrl, "/onboarding"));
}

export async function signInAction(values: unknown, callbackUrl?: string): Promise<ActionResult> {
  const parsed = signInSchema.safeParse(values);
  if (!parsed.success) return invalid(parsed.error);

  const ip = await clientIp();
  const allowed =
    rateLimit(`sign-in:ip:${ip}`, 20, 5 * MINUTE) &&
    rateLimit(`sign-in:email:${parsed.data.email}`, 8, 5 * MINUTE);
  if (!allowed) return TOO_MANY;

  return signInAndRedirect(parsed.data.email, parsed.data.password, safeCallbackUrl(callbackUrl));
}

export async function signOutAction() {
  await signOut({ redirectTo: "/sign-in" });
}

export async function forgotPasswordAction(values: unknown): Promise<ActionResult> {
  const parsed = forgotPasswordSchema.safeParse(values);
  if (!parsed.success) return invalid(parsed.error);
  if (!rateLimit(`forgot:${await clientIp()}`, 5, 15 * MINUTE)) return TOO_MANY;

  await authService.requestPasswordReset(parsed.data.email);
  // Same answer whether or not the account exists.
  return { ok: true, message: "If an account exists for that email, a reset link is on its way." };
}

export async function resetPasswordAction(values: unknown): Promise<ActionResult> {
  const parsed = resetPasswordSchema.safeParse(values);
  if (!parsed.success) return invalid(parsed.error);
  if (!rateLimit(`reset:${await clientIp()}`, 10, 15 * MINUTE)) return TOO_MANY;

  try {
    await authService.resetPassword(parsed.data.token, parsed.data.password);
  } catch (error) {
    if (isAppError(error)) return { ok: false, error: error.message };
    throw error;
  }
  redirect("/sign-in?reset=1");
}

export async function verifyEmailAction(token: string): Promise<ActionResult> {
  if (typeof token !== "string" || token.length === 0 || token.length > 200) {
    return { ok: false, error: "This verification link is invalid or has expired." };
  }
  try {
    await authService.verifyEmail(token);
    return { ok: true, message: "Your email is verified." };
  } catch (error) {
    if (isAppError(error)) return { ok: false, error: error.message };
    throw error;
  }
}

export async function resendVerificationAction(): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Please sign in again." };
  if (user.emailVerified) return { ok: true, message: "Your email is already verified." };
  if (!rateLimit(`resend-verify:${user.id}`, 3, 15 * MINUTE)) return TOO_MANY;

  await authService.sendVerificationEmail(user);
  return { ok: true, message: `We sent a new link to ${user.email}.` };
}

export async function googleSignInAction(callbackUrl?: string) {
  await signIn("google", { redirectTo: safeCallbackUrl(callbackUrl) });
}
