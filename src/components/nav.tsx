"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "./ui";

/**
 * Four destinations, thumb-height, at the bottom of the screen.
 *
 * "Log" sits in the middle and is the widest target, because logging a cost is
 * the thing that happens twice a day and everything else is occasional.
 */
const TABS = [
  { href: "/", label: "Today", icon: HomeIcon },
  { href: "/manager", label: "Plan", icon: StockIcon },
  { href: "/expenses/new", label: "Log", icon: PlusIcon, primary: true },
  { href: "/map", label: "Plots", icon: CycleIcon, also: "/cycles" },
  { href: "/owner", label: "Farm", icon: ReportIcon },
] as const;

export function Nav() {
  const pathname = usePathname();
  if (pathname.startsWith("/login")) return null;

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-20 border-t-2 border-line bg-paper"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="mx-auto flex max-w-2xl">
        {TABS.map(({ href, label, icon: Icon, ...rest }) => {
          const primary = "primary" in rest && rest.primary;
          // Plots lands on the map but owns the list and every plot page too,
          // so the tab stays lit wherever in that group he is.
          const also = "also" in rest ? rest.also : null;
          const active =
            href === "/"
              ? pathname === "/"
              : pathname.startsWith(href) ||
                (also !== null && pathname.startsWith(also));
          return (
            <li key={href} className={cx("flex-1", primary && "flex-[1.3]")}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "flex min-h-16 flex-col items-center justify-center gap-0.5 px-1 text-xs font-semibold",
                  primary
                    ? "m-1.5 rounded-xl bg-brand text-white"
                    : active
                      ? "text-brand"
                      : "text-ink-soft",
                )}
              >
                <Icon />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

const S = { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none",
  stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round",
  strokeLinejoin: "round", "aria-hidden": true } as const;

function HomeIcon() {
  return <svg {...S}><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /></svg>;
}
function CycleIcon() {
  return <svg {...S}><path d="M21 12a9 9 0 1 1-3-6.7" /><path d="M21 4v5h-5" /></svg>;
}
function PlusIcon() {
  return <svg {...S} strokeWidth={2.5}><path d="M12 5v14M5 12h14" /></svg>;
}
function StockIcon() {
  return <svg {...S}><path d="M3 7h18v13H3z" /><path d="M3 7l2-4h14l2 4" /><path d="M10 12h4" /></svg>;
}
function ReportIcon() {
  return <svg {...S}><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></svg>;
}
