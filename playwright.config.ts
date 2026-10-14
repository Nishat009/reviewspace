import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests against a running app with the demo seed.
 *
 *   pnpm test:e2e          # starts `pnpm dev` unless one is already running
 *   E2E_SERVER="pnpm start" pnpm test:e2e   # CI: against a production build
 *
 * Global setup re-seeds the demo workspace, so tests start from known data.
 */
const port = Number(process.env.E2E_PORT ?? 3000);
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${port}`;

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
  webServer: {
    command: process.env.E2E_SERVER ?? "pnpm dev",
    url: `${baseURL}/sign-in`,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
  },
});
