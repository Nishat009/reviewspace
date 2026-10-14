import "server-only";
import type { Prisma } from "@/generated/prisma/client";

/**
 * Append-only activity history, separate from comments. Written inside the
 * same transaction as the change it describes, so history never disagrees
 * with the data.
 */
export type AuditType =
  | "workspace.created"
  | "workspace.updated"
  | "workspace.ownership_transferred"
  | "project.created"
  | "project.updated"
  | "project.archived"
  | "project.restored"
  | "asset.uploaded"
  | "asset.renamed"
  | "asset.archived"
  | "version.added"
  | "reviewer.assigned"
  | "review.requested"
  | "review.cancelled"
  | "review.decided"
  | "member.invited"
  | "member.joined"
  | "member.role_changed"
  | "member.removed"
  | "invitation.revoked"
  | "project_access.granted"
  | "project_access.revoked"
  | "share_link.created"
  | "share_link.revoked";

export type AuditInput = {
  workspaceId: string;
  projectId?: string | null;
  actorId: string | null;
  type: AuditType;
  targetType: string;
  targetId: string;
  metadata?: Prisma.InputJsonObject;
};

export function recordAudit(tx: Prisma.TransactionClient, input: AuditInput) {
  return tx.auditEvent.create({ data: { ...input, metadata: input.metadata ?? {} } });
}
