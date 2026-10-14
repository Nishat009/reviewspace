"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

/** Tabs that are real links (`?tab=`), so each tab is shareable and works without JS. */
export function TabLinks({ tabs, param = "tab", fallback }: { tabs: { value: string; label: string }[]; param?: string; fallback: string }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const current = params.get(param) ?? fallback;
  return (
    <nav aria-label="Sections" className="flex gap-1 overflow-x-auto border-b">
      {tabs.map((tab) => {
        const next = new URLSearchParams(params);
        if (tab.value === fallback) next.delete(param);
        else next.set(param, tab.value);
        const active = tab.value === current;
        return (
          <Link
            key={tab.value}
            href={`${pathname}${next.size ? `?${next}` : ""}`}
            aria-current={active ? "page" : undefined}
            scroll={false}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm whitespace-nowrap",
              active ? "border-primary font-medium" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
