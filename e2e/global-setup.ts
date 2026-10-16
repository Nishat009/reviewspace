import { execFileSync, spawn } from "node:child_process";
import { rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { createServer } from "node:net";
import { Client } from "pg";

/** Fresh demo data for every run (replaces only the demo workspace and users). */
export default async function globalSetup() {
  const testEnv = JSON.parse(process.env.E2E_APP_ENV ?? "{}") as Record<string, string>;
  if (!testEnv.DATABASE_URL || !testEnv.LOCAL_STORAGE_DIR) throw new Error("Missing isolated E2E environment");
  const storage = path.resolve(testEnv.LOCAL_STORAGE_DIR);
  if (path.dirname(storage) !== path.resolve(tmpdir()) || !path.basename(storage).startsWith("reviewspace-e2e-")) {
    throw new Error("E2E storage must be a dedicated reviewspace-e2e directory under the system temp directory");
  }
  const url = new URL(process.env.E2E_SERVER_URL!);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) throw new Error("E2E server must be local");
  // Refuse an occupied port rather than accidentally testing a different app.
  await new Promise<void>((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(Number(url.port || 80), () => probe.close((error) => error ? reject(error) : resolve()));
  });
  const database = new Client({ connectionString: testEnv.DATABASE_URL });
  await database.connect();
  try {
    const { rows } = await database.query("SELECT current_database() AS name");
    if (rows[0]?.name !== new URL(testEnv.DATABASE_URL).pathname.slice(1)) {
      throw new Error("E2E database server did not select the requested isolated database");
    }
  } finally { await database.end(); }
  const options = { stdio: "inherit" as const, env: { ...process.env, ...testEnv } };
  execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], options);
  execFileSync(process.execPath, ["--import", "tsx", "--require", "./scripts/server-only-shim.cjs", "prisma/seed.ts"], options);
  const fixtureDb = new Client({ connectionString: testEnv.DATABASE_URL });
  await fixtureDb.connect();
  const emails = ["owner@demo.reviewspace.test", "designer@demo.reviewspace.test", "client@demo.reviewspace.test", process.env.E2E_OUTSIDER_EMAIL!];
  const { rows: workspaceRows } = await fixtureDb.query<{ id: string }>(
    'SELECT DISTINCT "workspaceId" AS id FROM workspace_members JOIN users ON users.id = "userId" WHERE email = $1 AND role = \'OWNER\'', [emails[0]],
  );
  await fixtureDb.end();
  // Own the Node process directly. Windows taskkill used by Playwright's
  // shell-based webServer can hang in restricted environments.
  const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", url.port || "80"], {
    ...options, stdio: ["ignore", "pipe", "pipe"], windowsHide: true,
  });
  let output = "";
  server.stdout.on("data", (data) => { output += data; });
  server.stderr.on("data", (data) => { output += data; process.stderr.write(data); });
  const stopped = new Promise<void>((resolve) => server.once("close", () => resolve()));
  let spawnError: Error | undefined;
  server.on("error", (error) => { spawnError = error; });
  const cleanup = async () => {
    if (server.exitCode === null && server.signalCode === null) server.kill("SIGKILL");
    await Promise.race([
      stopped,
      new Promise<never>((_, reject) => {
        const timeout = setTimeout(() => reject(new Error("E2E server failed to stop")), 10_000);
        timeout.unref();
      }),
    ]);
    const cleanupDb = new Client({ connectionString: testEnv.DATABASE_URL });
    await cleanupDb.connect();
    try {
      await cleanupDb.query('DELETE FROM workspaces WHERE id = ANY($1::text[])', [workspaceRows.map((row) => row.id)]);
      await cleanupDb.query('DELETE FROM users WHERE email = ANY($1::text[])', [emails]);
    } finally { await cleanupDb.end(); }
    await rm(testEnv.LOCAL_STORAGE_DIR, { recursive: true, force: true });
  };
  try {
    const deadline = Date.now() + 60_000;
    while (true) {
      if (spawnError) throw spawnError;
      if (server.exitCode !== null) throw new Error(`E2E server exited: ${output}`);
      const ready = await fetch(new URL("/sign-in", url), { signal: AbortSignal.timeout(2_000) }).then((r) => r.ok).catch(() => false);
      if (ready) break;
      if (Date.now() > deadline) throw new Error(`E2E server did not become ready: ${output}`);
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  } catch (error) {
    await cleanup();
    throw error;
  }
  return async () => {
    await cleanup();
    if (/08P01|P2039|\[api\] unexpected error/.test(output)) throw new Error(`E2E server reported an unexpected error:\n${output}`);
  };
}
