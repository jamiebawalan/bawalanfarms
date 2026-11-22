"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "./ui";
import type { Route } from "next";

/**
 * The three things that get written down.
 *
 * They were one form and two screens filed under "Stock" that nothing linked
 * to unless a lot happened to be open, so the half of the spending that goes
 * through the shed was effectively invisible from the tab he taps twice a
 * day. Same place, same row, in the order of how often each happens.
 */
const TABS: { href: Route; label: string }[] = [
  { href: "/expenses/new" as Route, label: "Cost" },
  { href: "/inputs/use" as Route, label: "Use inputs" },
  { href: "/inputs/buy" as Route, label: "Buy inputs" },
];

export function LogTabs() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="What are you logging?"
      className="mb-5 flex gap-2 overflow-x-auto"
    >
      {TABS.map(({ href, label }) => {
        const active = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cx(
              "inline-flex min-h-12 shrink-0 items-center rounded-xl border-2 px-4",
              "font-semibold transition-colors",
              active
                ? "border-brand bg-brand text-white"
                : "border-line-strong bg-paper text-ink",
            )}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
