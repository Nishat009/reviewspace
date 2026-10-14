import { requireUser } from "@/lib/auth/session";
import { requireWorkspacePage } from "@/lib/authz/guards";

/**
 * Gate for everything under /w/[slug]: signed in, and a member of this
 * workspace (404 otherwise). Visual chrome lives in the (shell) and (editor)
 * groups below.
 */
export default async function WorkspaceLayout(props: LayoutProps<"/w/[slug]">) {
  const { slug } = await props.params;
  const user = await requireUser();
  await requireWorkspacePage(user.id, slug);
  return props.children;
}
