import "server-only";
import { getCurrentUser } from "@/lib/auth/session";
import { AppError, isAppError, type ActionResult } from "@/lib/errors";
import type { Actor } from "@/server/access";
import { resolveShareLink } from "@/server/share-service";

/**
 * Resolves who is calling: a share-link guest when a share token is supplied
 * (header for fetches, query param for EventSource), otherwise the signed-in
 * member. Returns null when neither is valid.
 */
export async function resolveActor(shareToken?: string | null): Promise<Actor | null> {
  if (shareToken) {
    const state = await resolveShareLink(shareToken);
    return state.status === "ok" ? state.actor : null;
  }
  const user = await getCurrentUser();
  return user ? { kind: "member", userId: user.id } : null;
}

export async function actorFromRequest(request: Request): Promise<Actor | null> {
  const url = new URL(request.url);
  return resolveActor(request.headers.get("x-share-token") ?? url.searchParams.get("share"));
}

const STATUS: Record<string, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INVALID: 400,
  RATE_LIMITED: 429,
};

/** JSON error for route handlers; unexpected errors are logged, not leaked. */
export function errorResponse(error: unknown) {
  if (isAppError(error)) return Response.json({ error: error.message, code: error.code }, { status: STATUS[error.code] ?? 400 });
  if (error instanceof Error && error.name === "ZodError") return Response.json({ error: "Invalid request." }, { status: 400 });
  console.error("[api] unexpected error", error);
  return Response.json({ error: "Something went wrong." }, { status: 500 });
}

export const unauthenticated = () =>
  Response.json({ error: "Sign in to continue.", code: "UNAUTHENTICATED" }, { status: 401 });

/** Wraps a service call for a server action: expected errors become results. */
export async function toActionResult<T>(
  run: () => Promise<T>,
  onSuccess?: (value: T) => ActionResult | void,
): Promise<ActionResult & { data?: T }> {
  try {
    const value = await run();
    return { ...(onSuccess?.(value) ?? { ok: true as const }), ...(value !== undefined ? { data: value } : {}) } as ActionResult & {
      data?: T;
    };
  } catch (error) {
    if (isAppError(error)) return { ok: false, error: error.message };
    if (error instanceof Error && error.name === "ZodError") return { ok: false, error: "Please check the form and try again." };
    throw error;
  }
}

export async function requireActor(shareToken?: string | null) {
  const actor = await resolveActor(shareToken);
  if (!actor) throw new AppError("UNAUTHENTICATED", shareToken ? "This link is invalid or has expired." : "Your session has expired. Please sign in again.");
  return actor;
}
