import { AppHeader } from "@/components/app-shell/app-header";
import { WorkspaceNav, type NavItem } from "@/components/app-shell/workspace-nav";
import { WorkspaceSwitcher } from "@/components/app-shell/workspace-switcher";
import { requireUser } from "@/lib/auth/session";
import { requireWorkspacePage } from "@/lib/authz/guards";
import { can } from "@/lib/authz/permissions";
import { paths } from "@/lib/paths";
import { listWorkspacesForUser } from "@/server/workspace-service";

export default async function WorkspaceShellLayout(props: LayoutProps<"/w/[slug]">) {
  const { slug } = await props.params;
  const user = await requireUser();
  const access = await requireWorkspacePage(user.id, slug);
  const workspaces = await listWorkspacesForUser(user.id);

  const items: NavItem[] = [
    { href: paths.dashboard(slug), label: "Dashboard", exact: true },
    { href: paths.projects(slug), label: "Projects" },
  ];
  if (can(access.role, "members.view")) items.push({ href: paths.members(slug), label: "Members" });
  items.push({ href: paths.settings(slug), label: "Settings" });

  return (
    <div className="flex min-h-svh flex-col">
      <AppHeader
        user={user}
        logoHref={paths.dashboard(slug)}
        left={
          <>
            <span aria-hidden className="text-muted-foreground">
              /
            </span>
            <WorkspaceSwitcher
              current={{
                slug,
                name: access.workspace.name,
                role: access.role,
                logoUrl: access.workspace.logoPath
                  ? `/api/workspaces/${access.workspace.id}/logo?v=${encodeURIComponent(access.workspace.logoPath.split("/").pop() ?? "")}`
                  : null,
              }}
              workspaces={workspaces}
            />
          </>
        }
        nav={<WorkspaceNav items={items} />}
      />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{props.children}</main>
    </div>
  );
}
