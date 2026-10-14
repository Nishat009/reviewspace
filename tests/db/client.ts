import "dotenv/config";
import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

export function testDatabaseUrl() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("Set TEST_DATABASE_URL to a throwaway Postgres database.");
  // Inside test workers DATABASE_URL is the test URL; the real one is APP_DATABASE_URL.
  const appUrl = process.env.APP_DATABASE_URL ?? process.env.DATABASE_URL;
  if (url === appUrl) throw new Error("TEST_DATABASE_URL must differ from DATABASE_URL.");
  return url;
}

export function createTestClient() {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: testDatabaseUrl() }) });
}

const uid = () => randomUUID().slice(0, 8);

/** Fresh, isolated fixtures for each test: two tenants with one user each. */
export async function seedTwoWorkspaces(db: PrismaClient) {
  const [alice, bob] = await Promise.all(
    ["alice", "bob"].map((name) =>
      db.user.create({ data: { name, email: `${name}-${uid()}@test.local` } }),
    ),
  );
  const workspaceA = await db.workspace.create({
    data: { name: "A", slug: `a-${uid()}`, members: { create: { userId: alice.id, role: "OWNER" } } },
  });
  const workspaceB = await db.workspace.create({
    data: { name: "B", slug: `b-${uid()}`, members: { create: { userId: bob.id, role: "OWNER" } } },
  });
  const projectA = await db.project.create({ data: { workspaceId: workspaceA.id, name: "Project A" } });
  const projectB = await db.project.create({ data: { workspaceId: workspaceB.id, name: "Project B" } });
  return { alice, bob, workspaceA, workspaceB, projectA, projectB };
}
