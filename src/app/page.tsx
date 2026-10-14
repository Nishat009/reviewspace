import Link from "next/link";
import { CheckCircle2Icon, GitCompareArrowsIcon, MessageSquareIcon, UploadIcon } from "lucide-react";
import { Logo } from "@/components/brand";
import { Button } from "@/components/ui/button";

const WORKFLOW = [
  { icon: UploadIcon, title: "Upload a screenshot", body: "Drop in a design or website capture. Each change becomes a new version, never an overwrite." },
  { icon: MessageSquareIcon, title: "Clients pin feedback", body: "Reviewers click the exact spot — the “Book Now” button, the hero copy — and leave a comment there." },
  { icon: GitCompareArrowsIcon, title: "Ship the next version", body: "Reply, resolve threads, and upload V2. Feedback stays attached to the version it was about." },
  { icon: CheckCircle2Icon, title: "Get a clear approval", body: "The designated approver signs off on a specific version, with who, when and what on record." },
];

export default function LandingPage() {
  return (
    <div className="flex min-h-svh flex-col">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-4">
        <Logo />
        <nav className="flex items-center gap-2">
          <Button variant="ghost" asChild>
            <Link href="/sign-in">Sign in</Link>
          </Button>
          <Button asChild>
            <Link href="/sign-up">Get started</Link>
          </Button>
        </nav>
      </header>

      <main className="flex-1">
        <section className="mx-auto flex max-w-3xl flex-col items-center gap-6 px-4 py-20 text-center sm:py-28">
          <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
            Design feedback pinned to the pixel. Approvals you can point to.
          </h1>
          <p className="max-w-xl text-lg text-pretty text-muted-foreground">
            ReviewSpace gives agencies, freelancers and product teams one place to share work, collect precise client
            comments, iterate through versions and get sign-off.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Button size="lg" asChild>
              <Link href="/sign-up">Start a workspace</Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href="/sign-in">I have an invite</Link>
            </Button>
          </div>
        </section>

        <section aria-labelledby="workflow-heading" className="border-t bg-muted/40">
          <div className="mx-auto max-w-6xl px-4 py-16">
            <h2 id="workflow-heading" className="mb-10 text-center text-2xl font-semibold tracking-tight">
              From first upload to final approval
            </h2>
            <ol className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {WORKFLOW.map(({ icon: Icon, title, body }, i) => (
                <li key={title} className="flex flex-col gap-3 rounded-xl border bg-background p-5">
                  <span className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Icon className="size-4" aria-hidden /> Step {i + 1}
                  </span>
                  <h3 className="font-medium">{title}</h3>
                  <p className="text-sm text-muted-foreground">{body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>
      </main>

      <footer className="border-t py-6 text-center text-sm text-muted-foreground">ReviewSpace — a portfolio project.</footer>
    </div>
  );
}
