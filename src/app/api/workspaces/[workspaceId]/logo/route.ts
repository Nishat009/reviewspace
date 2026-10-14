import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { createSignedReadUrl } from "@/lib/storage";

/** Workspace logo for its members, via a short-lived signed URL. */
export async function GET(_request: Request, ctx: RouteContext<"/api/workspaces/[workspaceId]/logo">) {
  const viewer = await getCurrentUser();
  if (!viewer) return new Response(null, { status: 401 });
  const { workspaceId } = await ctx.params;
  const workspace = await db.workspace.findFirst({
    where: { id: workspaceId, members: { some: { userId: viewer.id } } },
    select: { logoPath: true },
  });
  if (!workspace?.logoPath) return new Response(null, { status: 404 });
  return new Response(null, {
    status: 302,
    headers: { location: await createSignedReadUrl(workspace.logoPath, 60 * 60), "cache-control": "private, max-age=600" },
  });
}
