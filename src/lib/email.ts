import "server-only";
import { Resend } from "resend";
import { env } from "@/lib/env";

type Email = { to: string; subject: string; text: string; html: string };

const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;

/**
 * Sends a transactional email. Callers treat failure as non-fatal: the
 * primary write (sign-up, invitation, ...) has already committed.
 */
export async function sendEmail(email: Email): Promise<boolean> {
  if (!resend) {
    if (env.NODE_ENV === "test") return true;
    if (env.NODE_ENV === "development") {
      // Dev-only convenience so links can be clicked without an email provider.
      console.info(`\n[email] to=${email.to} subject="${email.subject}"\n${email.text}\n`);
      return true;
    }
    console.error("[email] RESEND_API_KEY is not configured");
    return false;
  }
  try {
    const { error } = await resend.emails.send({ from: env.EMAIL_FROM, ...email });
    if (error) {
      console.error("[email] send failed", { subject: email.subject, name: error.name });
      return false;
    }
    return true;
  } catch {
    console.error("[email] send threw", { subject: email.subject });
    return false;
  }
}

export function appUrl(path: string) {
  return new URL(path, env.APP_URL).toString();
}

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** Minimal single-action email layout. */
export function actionEmail(opts: {
  heading: string;
  body: string;
  actionLabel: string;
  url: string;
  footer: string;
}) {
  const text = `${opts.heading}\n\n${opts.body}\n\n${opts.actionLabel}: ${opts.url}\n\n${opts.footer}`;
  const html = `<div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#111">
<h1 style="font-size:20px;margin:0 0 12px">${escapeHtml(opts.heading)}</h1>
<p style="line-height:1.5;margin:0 0 20px">${escapeHtml(opts.body)}</p>
<a href="${escapeHtml(opts.url)}" style="display:inline-block;background:#111;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">${escapeHtml(opts.actionLabel)}</a>
<p style="color:#666;font-size:13px;line-height:1.5;margin:24px 0 0">${escapeHtml(opts.footer)}</p>
</div>`;
  return { text, html };
}
