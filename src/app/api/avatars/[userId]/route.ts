import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { createSignedReadUrl } from "@/lib/storage";

/**
 * Redirects to a short-lived signed URL for a user's avatar. Only people who
 * share a workspace with that user (or the user themselves) can load it.
 */
export async function GET(_request: Request, ctx: RouteContext<"/api/avatars/[userId]">) {
  const viewer = await getCurrentUser();
  if (!viewer) return new Response(null, { status: 401 });
  const { userId } = await ctx.params;

  const user = await db.user.findFirst({
    where: {
      id: userId,
      image: { not: null },
      ...(userId === viewer.id ? {} : { memberships: { some: { workspace: { members: { some: { userId: viewer.id } } } } } }),
    },
    select: { image: true },
  });
  if (!user?.image) return new Response(null, { status: 404 });

  const url = await createSignedReadUrl(user.image, 60 * 60);
  return new Response(null, {
    status: 302,
    headers: { location: url, "cache-control": "private, max-age=600" },
  });
}
