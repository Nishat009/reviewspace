import { listMentionCandidates } from "@/server/comment-service";
import { actorFromRequest, errorResponse, unauthenticated } from "@/server/request-actor";

export async function GET(request: Request, ctx: RouteContext<"/api/versions/[versionId]/mentionable">) {
  const actor = await actorFromRequest(request);
  if (!actor) return unauthenticated();
  try {
    const { versionId } = await ctx.params;
    const internal = new URL(request.url).searchParams.get("internal") === "1";
    return Response.json(await listMentionCandidates(actor, versionId, internal), { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
