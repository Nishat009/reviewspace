import { getCurrentUser } from "@/lib/auth/session";
import { unauthenticated } from "@/server/request-actor";
import { countUnreadNotifications } from "@/server/user-service";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return unauthenticated();
  return Response.json({ count: await countUnreadNotifications(user.id) }, { headers: { "cache-control": "no-store" } });
}
