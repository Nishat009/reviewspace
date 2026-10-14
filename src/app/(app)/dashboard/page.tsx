import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { LAST_WORKSPACE_COOKIE } from "@/lib/constants";
import { listWorkspacesForUser } from "@/server/workspace-service";

/** Sends the user to their last workspace, their first one, or onboarding. */
export default async function DashboardRedirect() {
  const user = await requireUser();
  const workspaces = await listWorkspacesForUser(user.id);
  if (workspaces.length === 0) redirect("/onboarding");

  const last = (await cookies()).get(LAST_WORKSPACE_COOKIE)?.value;
  const target = workspaces.find((w) => w.slug === last) ?? workspaces[0];
  redirect(`/w/${target.slug}`);
}
