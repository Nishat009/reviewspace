import { execSync } from "node:child_process";
import { Client } from "pg";
import { testDatabaseUrl } from "./client";

/**
 * Refuses to run unless TEST_DATABASE_URL really is a different database from
 * DATABASE_URL. Some local servers (e.g. `prisma dev`) silently route every
 * database name to the same instance, so comparing URLs is not enough: we
 * check the server-reported database and a per-server marker table.
 */
async function assertIsolated(testUrl: string) {
  const appUrl = process.env.DATABASE_URL;
  const test = new URL(testUrl);
  const expectedDb = test.pathname.slice(1);

  const client = new Client({ connectionString: testUrl });
  await client.connect();
  try {
    const { rows } = await client.query<{ db: string }>("select current_database() as db");
    if (rows[0]?.db !== expectedDb) {
      throw new Error(`TEST_DATABASE_URL asked for "${expectedDb}" but the server connected to "${rows[0]?.db}".`);
    }
    if (appUrl) {
      const app = new URL(appUrl);
      if (app.host === test.host && app.pathname === test.pathname) {
        throw new Error("TEST_DATABASE_URL points at the same server and database as DATABASE_URL.");
      }
    }
  } finally {
    await client.end();
  }
}

/**
 * Applies pending migrations to the test database. Non-destructive: tests
 * create their own uniquely-named fixtures, so no reset is needed between runs.
 */
export default async function setup() {
  const url = testDatabaseUrl();
  await assertIsolated(url);
  execSync("npx prisma migrate deploy", {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: url },
  });
}
