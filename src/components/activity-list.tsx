import { ROLE_LABELS } from "@/lib/constants";

type ActivityEvent = {
  id: string;
  type: string;
  createdAt: Date;
  metadata?: unknown;
  actor: { name: string } | null;
  project?: { name: string } | null;
};

const timeFormat = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" });

const roleLabel = (role: unknown) =>
  typeof role === "string" && role in ROLE_LABELS ? ROLE_LABELS[role as keyof typeof ROLE_LABELS].toLowerCase() : "member";

/** Human sentence for an audit event; unknown types fall back to the raw type. */
export function describeActivity(event: ActivityEvent): string {
  const m = (event.metadata ?? {}) as Record<string, unknown>;
  const project = event.project?.name ? ` in ${event.project.name}` : "";
  switch (event.type) {
    case "workspace.created":
      return "created the workspace";
    case "workspace.updated":
      return "updated workspace settings";
    case "workspace.ownership_transferred":
      return `transferred ownership to ${m.name ?? "a teammate"}`;
    case "project.created":
      return `created project${event.project?.name ? ` ${event.project.name}` : ""}`;
    case "project.updated":
      return `updated project details${project}`;
    case "project.archived":
      return `archived the project${event.project?.name ? ` ${event.project.name}` : ""}`;
    case "project.restored":
      return `restored the project${event.project?.name ? ` ${event.project.name}` : ""}`;
    case "asset.uploaded":
      return `uploaded ${m.assetName ?? "an asset"}${project}`;
    case "version.added":
      return `added V${m.versionNumber ?? "?"} of ${m.assetName ?? "an asset"}${project}`;
    case "asset.renamed":
      return `renamed ${m.from ?? "an asset"} to ${m.to ?? "something new"}`;
    case "asset.archived":
      return `archived ${m.assetName ?? "an asset"}`;
    case "reviewer.assigned":
      return `assigned an approver for ${m.label ?? "a version"}`;
    case "review.requested":
      return `requested a review of ${m.label ?? "a version"}`;
    case "review.cancelled":
      return `cancelled the review of ${m.label ?? "a version"}`;
    case "review.decided":
      return m.decision === "APPROVED" ? `approved ${m.label ?? "a version"}` : `requested changes on ${m.label ?? "a version"}`;
    case "member.invited":
      return `invited ${m.email ?? "someone"} as ${roleLabel(m.role)}`;
    case "member.joined":
      return `joined as ${roleLabel(m.role)}`;
    case "member.role_changed":
      return `changed ${m.name ?? "a member"}'s role to ${roleLabel(m.to)}`;
    case "member.removed":
      return m.self ? "left the workspace" : `removed ${m.name ?? "a member"}`;
    case "invitation.revoked":
      return "revoked an invitation";
    case "project_access.granted":
      return `gave ${m.name ?? "someone"} access${project}`;
    case "project_access.revoked":
      return `removed someone's access${project}`;
    case "share_link.created":
      return `created a ${m.permission === "COMMENT" ? "comment" : "view-only"} share link${project}`;
    case "share_link.revoked":
      return `revoked a share link${project}`;
    default:
      return event.type;
  }
}

export function ActivityList({ events, empty = "No activity yet." }: { events: ActivityEvent[]; empty?: string }) {
  if (events.length === 0) return <p className="py-2 text-center text-sm text-muted-foreground">{empty}</p>;
  return (
    <ol className="flex flex-col gap-3 text-sm">
      {events.map((event) => (
        <li key={event.id} className="flex flex-col">
          <span>
            <span className="font-medium">{event.actor?.name ?? "Someone"}</span> {describeActivity(event)}
          </span>
          <time dateTime={event.createdAt.toISOString()} className="text-xs text-muted-foreground">
            {timeFormat.format(event.createdAt)}
          </time>
        </li>
      ))}
    </ol>
  );
}
