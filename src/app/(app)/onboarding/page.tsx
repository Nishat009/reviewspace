import type { Metadata } from "next";
import { Logo } from "@/components/brand";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";
import { OnboardingForm } from "./onboarding-form";

export const metadata: Metadata = { title: "Set up your workspace" };

const STEPS = ["Create account", "Workspace & first project", "Upload a screenshot", "Invite a reviewer"];

export default async function OnboardingPage() {
  const user = await requireUser();

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted/40 px-4 py-10">
      <Logo href="/dashboard" />
      <ol className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-label="Setup progress">
        {STEPS.map((step, i) => (
          <li key={step} aria-current={i === 1 ? "step" : undefined} className={i === 1 ? "font-medium text-foreground" : ""}>
            {i + 1}. {step}
            {i === 0 && <span className="sr-only"> (done)</span>}
          </li>
        ))}
      </ol>
      <main className="w-full max-w-md">
        <Card>
          <CardHeader>
            <CardTitle>Welcome, {user.name.split(" ")[0]}</CardTitle>
            <CardDescription>
              A workspace is your agency or team&apos;s home. Projects inside it hold the designs you send for review.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <OnboardingForm />
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
