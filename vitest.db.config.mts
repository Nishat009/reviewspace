import "dotenv/config";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Integration tests against a real Postgres. Point TEST_DATABASE_URL at a
 * throwaway database: global setup applies all migrations to it.
 *
 * Service tests import the app's own modules, so inside the test workers
 * DATABASE_URL is swapped for TEST_DATABASE_URL, storage writes to a temp
 * folder, and `server-only` resolves to an empty module.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "server-only": fileURLToPath(new URL("./tests/db/empty-module.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/db/**/*.test.ts"],
    globalSetup: ["tests/db/global-setup.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
    env: {
      NODE_ENV: "test",
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? "",
      // The real app database, kept only so tests can refuse to touch it.
      APP_DATABASE_URL: process.env.DATABASE_URL ?? "",
      // `prisma dev` serves one connection at a time; CI Postgres doesn't mind.
      DATABASE_POOL_MAX: process.env.TEST_DATABASE_POOL_MAX ?? "1",
      STORAGE_DRIVER: "local",
      LOCAL_STORAGE_DIR: path.join(tmpdir(), "reviewspace-test-storage"),
      REALTIME_DRIVER: "memory",
      APP_URL: process.env.APP_URL ?? "http://localhost:3000",
      AUTH_SECRET: process.env.AUTH_SECRET ?? "test-secret-test-secret-test-secret-123",
    },
  },
});
