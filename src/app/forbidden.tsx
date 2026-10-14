import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function Forbidden() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="text-sm font-medium text-muted-foreground">403</p>
      <h1 className="text-2xl font-semibold tracking-tight">You don&apos;t have access to this</h1>
      <p className="max-w-sm text-muted-foreground">
        Your role in this workspace doesn&apos;t allow this action. A workspace owner or admin can change your access.
      </p>
      <Button asChild>
        <Link href="/dashboard">Go to dashboard</Link>
      </Button>
    </main>
  );
}
