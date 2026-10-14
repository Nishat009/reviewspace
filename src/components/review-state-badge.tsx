import { CheckCircle2Icon, CircleDashedIcon, ClockIcon, RotateCcwIcon } from "lucide-react";
import type { ReviewState } from "@/generated/prisma/enums";
import { REVIEW_STATE_LABELS } from "@/lib/review-state";
import { cn } from "@/lib/utils";

// Icon + text, never colour alone, so the state reads without colour vision.
const STYLES: Record<ReviewState, { icon: typeof ClockIcon; className: string }> = {
  DRAFT: { icon: CircleDashedIcon, className: "border-border bg-muted text-muted-foreground" },
  IN_REVIEW: { icon: ClockIcon, className: "border-sky-300 bg-sky-50 text-sky-900 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-100" },
  CHANGES_REQUESTED: {
    icon: RotateCcwIcon,
    className: "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100",
  },
  APPROVED: {
    icon: CheckCircle2Icon,
    className: "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-100",
  },
};

export function ReviewStateBadge({ state, className }: { state: ReviewState; className?: string }) {
  const { icon: Icon, className: tone } = STYLES[state];
  return (
    <span
      className={cn(
        "inline-flex h-5 shrink-0 items-center gap-1 rounded-full border px-2 text-xs font-medium whitespace-nowrap",
        tone,
        className,
      )}
    >
      <Icon className="size-3" aria-hidden />
      {REVIEW_STATE_LABELS[state]}
    </span>
  );
}
