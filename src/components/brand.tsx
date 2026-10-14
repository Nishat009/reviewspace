import Link from "next/link";
import { cn } from "@/lib/utils";

export function Logo({ className, href = "/" }: { className?: string; href?: string }) {
  return (
    <Link href={href} className={cn("inline-flex items-center gap-2 font-semibold tracking-tight", className)}>
      <span aria-hidden className="grid size-7 place-items-center rounded-lg bg-primary text-primary-foreground">
        <svg viewBox="0 0 16 16" className="size-4" fill="currentColor">
          <path d="M8 1.5a4.5 4.5 0 0 0-4.5 4.5c0 3.2 4.5 8.5 4.5 8.5s4.5-5.3 4.5-8.5A4.5 4.5 0 0 0 8 1.5Zm0 6.25A1.75 1.75 0 1 1 8 4.25a1.75 1.75 0 0 1 0 3.5Z" />
        </svg>
      </span>
      ReviewSpace
    </Link>
  );
}
