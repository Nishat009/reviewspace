import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/lib/db";

export type CurrentUser = {
  id: string;
  name: string;
  email: string;
  image: string | null;
  emailVerified: boolean;
};

/**
 * Data access layer entry point. Resolves the signed-in user from the JWT,
 * then confirms against the database that the account still exists and the
 * session has not been revoked (password reset bumps `sessionVersion`).
 * Memoized per request.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, image: true, emailVerified: true, sessionVersion: true },
  });
  if (!user || user.sessionVersion !== session.sessionVersion) return null;

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    image: user.image,
    emailVerified: user.emailVerified !== null,
  };
});

/** Path of the current request, set by `proxy.ts`. */
export async function currentPath() {
  return (await headers()).get("x-rs-pathname") ?? "/dashboard";
}

/** For pages: redirect to sign-in and come back here afterwards. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) {
    redirect(`/sign-in?callbackUrl=${encodeURIComponent(await currentPath())}`);
  }
  return user;
}
