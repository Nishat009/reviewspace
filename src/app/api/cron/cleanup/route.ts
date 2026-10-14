import { timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";
import { cleanupStaleUploads } from "@/server/asset-service";

/**
 * Removes abandoned and failed uploads. Call on a schedule (e.g. Vercel Cron)
 * with `Authorization: Bearer $CRON_SECRET`.
 */
export async function GET(request: Request) {
  const expected = Buffer.from(`Bearer ${env.CRON_SECRET}`);
  const actual = Buffer.from(request.headers.get("authorization") ?? "");
  if (!env.CRON_SECRET || expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return new Response("Unauthorized", { status: 401 });
  }
  return Response.json(await cleanupStaleUploads());
}
