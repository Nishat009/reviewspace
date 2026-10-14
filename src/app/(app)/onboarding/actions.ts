"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import type { ActionResult } from "@/lib/errors";
import { rateLimit } from "@/lib/rate-limit";
import { onboardingSchema } from "@/lib/validation/workspace";
import { paths } from "@/lib/paths";
import { createWorkspaceWithProject } from "@/server/workspace-service";

export async function createWorkspaceAction(values: unknown): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Your session has expired. Please sign in again." };

  const parsed = onboardingSchema.safeParse(values);
  if (!parsed.success) {
    return { ok: false, error: "Please fix the highlighted fields.", fieldErrors: z.flattenError(parsed.error).fieldErrors };
  }
  if (!rateLimit(`create-workspace:${user.id}`, 10, 60 * 60_000)) {
    return { ok: false, error: "You've created a lot of workspaces recently. Try again later." };
  }

  const { workspace, project } = await createWorkspaceWithProject(user.id, parsed.data);
  // Next onboarding steps (upload, invite) are shown on the project page.
  redirect(`${paths.project(workspace.slug, project.id)}?welcome=1`);
}
