"use client";

import { useState, useTransition } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { acceptInvitationAction, acceptInvitationByIdAction } from "@/app/actions/members";

/** Accepting is a click (POST), so email link scanners can't accept for you. */
export function AcceptInvitationButton({ token, invitationId }: { token?: string; invitationId?: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex flex-col gap-3">
      {error && (
        <Alert variant="destructive" aria-live="polite">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <Button
        size="lg"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = token ? await acceptInvitationAction(token) : await acceptInvitationByIdAction(invitationId!);
            if (!result.ok) setError(result.error);
          })
        }
      >
        {pending && <Spinner />} Accept invitation
      </Button>
    </div>
  );
}
