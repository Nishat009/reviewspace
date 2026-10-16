import type { PrismaClient } from "@/generated/prisma/client";

const users = new Set<string>();
const workspaces = new Set<string>();

export function trackUser<T extends { id: string }>(user: T): T {
  users.add(user.id);
  return user;
}

export function trackWorkspace<T extends { id: string }>(workspace: T): T {
  workspaces.add(workspace.id);
  return workspace;
}

/** Delete only ids created by this test worker, including after failed tests. */
export async function cleanupFixtures(db: PrismaClient) {
  await db.workspace.deleteMany({ where: { id: { in: [...workspaces] } } });
  await db.user.deleteMany({ where: { id: { in: [...users] } } });
  users.clear();
  workspaces.clear();
}
