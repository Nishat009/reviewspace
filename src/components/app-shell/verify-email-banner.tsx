"use client";

import { useTransition } from "react";
import { MailWarningIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { resendVerificationAction } from "@/app/(auth)/actions";

export function VerifyEmailBanner({ email }: { email: string }) {
  const [pending, startTransition] = useTransition();

  const resend = () =>
    startTransition(async () => {
      const result = await resendVerificationAction();
      if (result.ok) toast.success(result.message ?? "Verification email sent.");
      else toast.error(result.error);
    });

  return (
    <div role="status" className="border-b bg-amber-50 text-amber-950 dark:bg-amber-950/40 dark:text-amber-100">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-sm">
        <MailWarningIcon className="size-4 shrink-0" aria-hidden />
        <span>
          Verify <strong className="font-medium">{email}</strong> to accept invitations and receive notifications.
        </span>
        <Button variant="link" size="sm" className="h-auto p-0 text-inherit underline" disabled={pending} onClick={resend}>
          {pending ? "Sending…" : "Resend link"}
        </Button>
      </div>
    </div>
  );
}
