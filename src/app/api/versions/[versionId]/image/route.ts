import { getVersionImage } from "@/server/asset-service";
import { actorFromRequest, errorResponse, unauthenticated } from "@/server/request-actor";

/** Fresh short-lived signed URLs for one version's image. */
export async function GET(request: Request, ctx: RouteContext<"/api/versions/[versionId]/image">) {
  const actor = await actorFromRequest(request);
  if (!actor) return unauthenticated();
  try {
    const { versionId } = await ctx.params;
    return Response.json(await getVersionImage(actor, versionId), { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
