/**
 * Opens Prisma Studio against DATABASE_URL.
 * Usage: pnpm db:studio
 *
 * Studio talks to Postgres through postgres.js with a connection pool. The
 * local `prisma dev` server is single-connection and fails with "unnamed
 * prepared statement does not exist" when Studio opens several, so the pool is
 * capped at one connection here. Harmless against a real Postgres.
 */
import "dotenv/config";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const raw = process.env.DATABASE_URL;
if (!raw) {
  console.error("Set DATABASE_URL in .env first.");
  process.exit(1);
}

const url = new URL(raw);
url.searchParams.set("max", "1");

// Run the CLI through node directly: going through a shell on Windows would
// split the URL at "&".
const prismaCli = createRequire(import.meta.url).resolve("prisma/build/index.js");
const { status } = spawnSync(process.execPath, [prismaCli, "studio", "--url", url.toString(), ...process.argv.slice(2)], {
  stdio: "inherit",
});
process.exit(status ?? 1);
