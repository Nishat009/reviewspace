/**
 * Removes abandoned (PENDING > 24 h) and failed uploads plus their files.
 * Usage: pnpm uploads:cleanup   (or call GET /api/cron/cleanup on a schedule)
 */
import "dotenv/config";
import { db } from "@/lib/db";
import { cleanupStaleUploads } from "@/server/asset-service";

const result = await cleanupStaleUploads();
console.log(`Removed ${result.versionsRemoved} stale upload(s) and ${result.emptyAssetsRemoved} empty asset(s).`);
await db.$disconnect();
