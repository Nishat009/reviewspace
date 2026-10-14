"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { CircleCheckIcon } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { ActionResult } from "@/lib/errors";
import { verifyEmailAction } from "../actions";

export function VerifyEmailButton({ token }: { token: string }) {
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();

  if (result?.ok) {
    return (
      <div className="flex flex-col gap-4">
        <Alert aria-live="polite">
          <CircleCheckIcon />
          <AlertDescription>{result.message}</AlertDescription>
        </Alert>
        <Button asChild size="lg">
          <Link href="/dashboard">Continue to ReviewSpace</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {result && !result.ok && (
        <Alert variant="destructive" aria-live="polite">
          <AlertDescription>{result.error}</AlertDescription>
        </Alert>
      )}
      <Button
        size="lg"
        disabled={pending}
        onClick={() => startTransition(async () => setResult(await verifyEmailAction(token)))}
      >
        {pending && <Spinner />}
        Verify my email
      </Button>
    </div>
  );
}
