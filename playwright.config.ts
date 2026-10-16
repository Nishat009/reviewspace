import { defineConfig, devices } from "@playwright/test";
import "dotenv/config";
import path from "node:path";
import { tmpdir } from "node:os";
import { mkdtempSync } from "node:fs";
import { randomUUID } from "node:crypto";

/**
 * End-to-end tests against a running app with the demo seed.
 *
 *   pnpm build && pnpm test:e2e  # isolated production server and database
 *
 * Global setup re-seeds the demo workspace, so tests start from known data.
 */
const port = Number(process.env.E2E_PORT ?? 3000);
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${port}`;
const databaseURL = process.env.E2E_DATABASE_URL || process.env.TEST_DATABASE_URL;
if (!databaseURL) throw new Error("Set E2E_DATABASE_URL or TEST_DATABASE_URL to an isolated test database.");
const appDatabaseURL = process.env.DATABASE_URL;
if (appDatabaseURL) {
  const app = new URL(appDatabaseURL);
  const test = new URL(databaseURL);
  if (app.host === test.host && app.pathname === test.pathname) {
    throw new Error("E2E database must differ from the app database.");
  }
}
// Config is evaluated in workers too; retain the same storage directory.
process.env.E2E_STORAGE_DIR ??= mkdtempSync(path.join(tmpdir(), "reviewspace-e2e-"));
const testEnv = {
  DATABASE_URL: databaseURL,
  DATABASE_POOL_MAX: process.env.TEST_DATABASE_POOL_MAX ?? "1",
  APP_URL: new URL(baseURL).origin,
  STORAGE_DRIVER: "local",
  LOCAL_STORAGE_DIR: process.env.E2E_STORAGE_DIR,
  REALTIME_DRIVER: process.env.REALTIME_DRIVER ?? "memory",
  RESEND_API_KEY: "",
  EMAIL_DRIVER: "console",
};
process.env.E2E_APP_ENV = JSON.stringify(testEnv);
process.env.E2E_SERVER_URL = baseURL;
process.env.E2E_OUTSIDER_EMAIL ??= `outsider-${randomUUID()}@test.local`;

export default defineConfig({
  testDir: "e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 20_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    viewport: { width: 1440, height: 900 },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } }],
});
