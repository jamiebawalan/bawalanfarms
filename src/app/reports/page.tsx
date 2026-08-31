import Link from "next/link";
import { Card, Money, Page, Stat, StatGrid } from "@/components/ui";
import { loadLedger } from "@/lib/db/ledger";
import { allCyclePnL, unattachedCosts } from "@/lib/domain/pnl";
import { capitalRegister, overheadWatch, periodSpend } from "@/lib/domain/reports";
import { presetPeriods, todayISO } from "@/lib/domain/dates";
import { formatPeso, percent } from "@/lib/domain/money";

export const dynamic = "force-dynamic";

const REPORTS = [
  {
    href: "/reports/plots",
    title: "Plot history",
    blurb: "Every cycle a plot has run, stacked — a bad plot or just a bad year?",
  },
  {
    href: "/reports/period",
    title: "Spend by period",
    blurb: "Any date range, cut by category, activity and plot",
  },
  {
    href: "/reports/overhead",
    title: "Overhead watch",
    blurb: "Whole-farm costs as a share of spend, month by month",
  },
  {
    href: "/reports/buyers",
    title: "Buyer margin",
    blurb: "Revenue and the price each buyer actually paid, by grade",
  },
  {
    href: "/reports/capital",
    title: "Capital register",
    blurb: "Equipment, with straight-line depreciation",
  },
  {
    href: "/reports/unattached",
    title: "Unattached costs",
    blurb: "Money on a plot with no cycle open — the gap to keep closed",
  },
] as const;

export default async function ReportsPage() {
  const ledger = await loadLedger();
  const cropNames = new Map(ledger.crops.map((c) => [c.code, c.label]));
  const cropLabel = (code: string) => cropNames.get(code) ?? code;
  const today = todayISO();
  const [, , thisYear] = presetPeriods(today);

  const year = periodSpend(ledger, thisYear!.from, thisYear!.to);
  const cycles = allCyclePnL(ledger);
  const closed = cycles.filter((c) => c.isClosed);
  const margin = closed.reduce((a, c) => a + c.grossMarginCentavos, 0);
  const overhead = overheadWatch(ledger);
  const unattached = unattachedCosts(ledger).reduce((a, r) => a + r.amountCentavos, 0);
  const capital = capitalRegister(ledger, today);

  return (
    <Page title="Reports" subtitle={`Year to date, ${thisYear!.label.toLowerCase()}`}>
      <StatGrid>
        <Stat label="Spend" value={formatPeso(year.totalCentavos)} />
        <Stat label="Revenue" value={formatPeso(year.revenueCentavos)} />
        <Stat
          label="Closed-cycle margin"
          value={formatPeso(margin)}
          tone={margin >= 0 ? "up" : "down"}
          hint={`${closed.length} closed`}
        />
        <Stat
          label="Overhead"
          value={percent(overhead.overallShare * 100, 100, 0)}
          hint={overhead.rising ? "climbing" : "steady"}
        />
        <Stat label="Unattached" value={formatPeso(unattached)} hint="reaches no cycle" />
        <Stat label="Equipment" value={formatPeso(capital.totalBookValueCentavos)} hint="book value" />
      </StatGrid>

      <Card>
        <ul className="divide-y-2 divide-line">
          {REPORTS.map((r) => (
            <li key={r.href}>
              <Link href={r.href} className="block min-h-16 py-3">
                <div className="font-semibold text-brand underline underline-offset-4">
                  {r.title}
                </div>
                <div className="text-sm text-ink-soft">{r.blurb}</div>
              </Link>
            </li>
          ))}
        </ul>
      </Card>

      <Card title="Cycle profit">
        <ul className="divide-y-2 divide-line">
          {cycles
            .sort((a, b) => b.grossMarginCentavos - a.grossMarginCentavos)
            .map((c) => (
              <li key={c.cycle.id}>
                <Link
                  href={`/cycles/${c.cycle.id}`}
                  className="flex min-h-14 items-center justify-between gap-3 py-2.5"
                >
                  <div className="min-w-0">
                    <div className="truncate font-semibold">
                      {c.plot?.label} · {cropLabel(c.cycle.crop)}
                    </div>
                    <div className="text-sm text-ink-soft">
                      {c.isClosed ? "closed" : c.cycle.status.replace("_", " ")}
                    </div>
                  </div>
                  <Money centavos={c.grossMarginCentavos} signed />
                </Link>
              </li>
            ))}
        </ul>
      </Card>
    </Page>
  );
}
