import Link from "next/link";
import { CheckCircle2Icon, CircleIcon } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/** Onboarding checklist: account → workspace → project → screenshot → reviewer. */
export function GettingStarted({ hasAsset, hasReviewer, membersHref }: { hasAsset: boolean; hasReviewer: boolean; membersHref: string }) {
  const steps = [
    { done: true, label: "Create your account" },
    { done: true, label: "Create the workspace and first project" },
    { done: hasAsset, label: "Upload a screenshot", hint: "Drop it in the box below." },
    {
      done: hasReviewer,
      label: "Invite a reviewer",
      hint: (
        <>
          <Link href={membersHref} className="underline">
            Invite your client
          </Link>{" "}
          as a client reviewer and pick this project.
        </>
      ),
    },
  ];
  if (steps.every((s) => s.done)) return null;
  return (
    <Card className="border-primary/30 bg-primary/[0.03]">
      <CardHeader>
        <CardTitle>Get your first review going</CardTitle>
        <CardDescription>Two more steps and your client can start pinning feedback.</CardDescription>
      </CardHeader>
      <CardContent>
        <ol className="flex flex-col gap-2 text-sm">
          {steps.map((step) => (
            <li key={step.label} className="flex items-start gap-2">
              {step.done ? (
                <CheckCircle2Icon className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden />
              ) : (
                <CircleIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
              )}
              <span className={cn(step.done && "text-muted-foreground line-through")}>
                {step.label}
                {step.done && <span className="sr-only"> (done)</span>}
                {!step.done && step.hint && <span className="block text-muted-foreground">{step.hint}</span>}
              </span>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
