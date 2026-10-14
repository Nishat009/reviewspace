import "server-only";
import type { NotificationType } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { actionEmail, appUrl, sendEmail } from "@/lib/email";
import { channels, publish } from "@/server/realtime";

export type NotificationTarget = {
  projectId?: string;
  assetId?: string;
  versionId?: string;
  threadId?: string;
  invitationId?: string;
  /** Short human context, e.g. "Homepage V3 · #2". */
  label?: string;
  /** Deep link, relative to the app origin. */
  path: string;
};

export type NotificationEvent = {
  type: NotificationType;
  workspaceId: string;
  actorId: string | null;
  recipientIds: string[];
  target: NotificationTarget;
  /** Stable id of the triggering event (e.g. the comment id). */
  eventKey: string;
  email?: { subject: string; heading: string; body: string; actionLabel: string };
};

/**
 * Creates in-app notifications inside the caller's transaction. The actor is
 * never notified of their own action, and the deterministic dedupe key means
 * a retried mutation cannot produce a second copy.
 */
export async function createNotifications(tx: Prisma.TransactionClient, event: NotificationEvent) {
  const recipients = [...new Set(event.recipientIds)].filter((id) => id && id !== event.actorId);
  if (recipients.length === 0) return [];
  await tx.notification.createMany({
    data: recipients.map((userId) => ({
      userId,
      workspaceId: event.workspaceId,
      type: event.type,
      actorId: event.actorId,
      target: event.target,
      dedupeKey: `${event.type}:${event.eventKey}:${userId}`,
    })),
    skipDuplicates: true,
  });
  return recipients;
}

type Prefs = { email?: Partial<Record<NotificationType, boolean>> };

/**
 * After commit: push a realtime nudge to each recipient and send the emails
 * they have not opted out of. Failures here never undo the original write.
 */
export async function deliverNotifications(event: NotificationEvent, recipients: string[]) {
  if (recipients.length === 0) return;
  await Promise.all(recipients.map((id) => publish(channels.user(id), "notification.created", { type: event.type })));
  if (!event.email) return;

  const users = await db.user.findMany({
    where: { id: { in: recipients }, guestShareLinkId: null },
    select: { email: true, notificationPrefs: true },
  });
  const email = event.email;
  await Promise.all(
    users
      .filter((user) => (user.notificationPrefs as Prefs)?.email?.[event.type] !== false)
      .map((user) =>
        sendEmail({
          to: user.email,
          subject: email.subject,
          ...actionEmail({
            heading: email.heading,
            body: email.body,
            actionLabel: email.actionLabel,
            url: appUrl(event.target.path),
            footer: "You can change which emails you get in your account settings.",
          }),
        }),
      ),
  );
}

/**
 * Collects notifications created inside a transaction and delivers them once
 * it has committed:
 *
 *   const outbox = new NotificationOutbox();
 *   await db.$transaction(async (tx) => { ...; await outbox.add(tx, event); });
 *   await outbox.flush();
 */
export class NotificationOutbox {
  private pending: { event: NotificationEvent; recipients: string[] }[] = [];

  async add(tx: Prisma.TransactionClient, event: NotificationEvent) {
    this.pending.push({ event, recipients: await createNotifications(tx, event) });
  }

  /** Never throws: the write it follows has already committed. */
  async flush() {
    const batch = this.pending;
    this.pending = [];
    const results = await Promise.allSettled(batch.map((p) => deliverNotifications(p.event, p.recipients)));
    for (const result of results) {
      if (result.status === "rejected") console.error("[notifications] delivery failed", (result.reason as Error)?.message);
    }
  }
}

export const NOTIFICATION_LABELS: Record<NotificationType, string> = {
  MENTION: "mentioned you",
  THREAD_REPLY: "replied to your thread",
  REVIEW_REQUESTED: "requested your review",
  CHANGES_REQUESTED: "requested changes",
  VERSION_APPROVED: "approved a version",
  WORKSPACE_INVITATION: "invited you to a workspace",
};
