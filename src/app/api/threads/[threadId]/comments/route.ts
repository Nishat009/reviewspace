import { listComments } from "@/server/comment-service";
import { actorFromRequest, errorResponse, unauthenticated } from "@/server/request-actor";

export async function GET(request: Request, ctx: RouteContext<"/api/threads/[threadId]/comments">) {
  const actor = await actorFromRequest(request);
  if (!actor) return unauthenticated();
  try {
    const { threadId } = await ctx.params;
    const cursor = new URL(request.url).searchParams.get("cursor");
    return Response.json(await listComments(actor, threadId, cursor), { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
