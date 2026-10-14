import { getReviewInfo } from "@/server/review-service";
import { actorFromRequest, errorResponse, unauthenticated } from "@/server/request-actor";

export async function GET(request: Request, ctx: RouteContext<"/api/versions/[versionId]/review">) {
  const actor = await actorFromRequest(request);
  if (!actor) return unauthenticated();
  try {
    const { versionId } = await ctx.params;
    return Response.json(await getReviewInfo(actor, versionId), { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
