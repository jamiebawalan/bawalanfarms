import Link from "next/link";
import { Bar, Card, Empty, Money, Page, Stat, StatGrid } from "@/components/ui";
import { loadLedger } from "@/lib/db/ledger";
import { periodSpend } from "@/lib/domain/reports";
import { formatDate, presetPeriods, todayISO } from "@/lib/domain/dates";
import { formatPeso } from "@/lib/domain/money";

export const dynamic = "force-dynamic";

export default async function PeriodPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const params = await searchParams;
  const today = todayISO();
  const presets = presetPeriods(today);
  const from = params.from ?? presets[0]!.from;
  const to = params.to ?? presets[0]!.to;

  const ledger = await loadLedger();
  const spend = periodSpend(ledger, from, to);
  const maxCat = Math.max(1, ...spend.byCategory.map((c) => c.amountCentavos));

  return (
    <Page
      title="Spend by period"
      subtitle={`${formatDate(from)} to ${formatDate(to)}`}
    >
      <div className="mb-4 flex flex-wrap gap-2">
        {presets.map((p) => {
          const active = p.from === from && p.to === to;
          return (
            <Link
              key={p.label}
              href={`/reports/period?from=${p.from}&to=${p.to}`}
              className={
                "min-h-12 rounded-xl border-2 px-3 py-2.5 font-semibold " +
                (active
                  ? "border-brand bg-brand text-white"
                  : "border-line-strong bg-paper text-ink")
              }
            >
              {p.label}
            </Link>
          );
        })}
      </div>

      <StatGrid>
        <Stat label="Spend" value={formatPeso(spend.totalCentavos)} />
        <Stat label="Revenue" value={formatPeso(spend.revenueCentavos)} />
        <Stat
          label="Difference"
          value={formatPeso(spend.revenueCentavos - spend.totalCentavos)}
          tone={spend.revenueCentavos - spend.totalCentavos >= 0 ? "up" : "down"}
        />
        <Stat label="Whole-farm" value={formatPeso(spend.farmWideCentavos)} />
        <Stat label="Equipment" value={formatPeso(spend.capitalCentavos)} hint="not in spend" />
      </StatGrid>

      <Card title="By category">
        {spend.byCategory.length === 0 ? (
          <Empty>Nothing in this window.</Empty>
        ) : (
          <ul className="space-y-3">
            {spend.byCategory.map((row) => (
              <li key={row.key}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-semibold">{row.key}</span>
                  <span>
                    <Money centavos={row.amountCentavos} />
                    <span className="ml-2 text-sm text-ink-soft tabular">
                      {(row.share * 100).toFixed(0)}%
                    </span>
                  </span>
                </div>
                <Bar fraction={row.amountCentavos / maxCat} />
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="By activity">
        {spend.byActivity.length === 0 ? (
          <Empty>Nothing in this window.</Empty>
        ) : (
          <ul className="divide-y-2 divide-line">
            {spend.byActivity.slice(0, 20).map((row) => (
              <li key={row.key} className="flex justify-between gap-3 py-2">
                <span>{row.label}</span>
                <Money centavos={row.amountCentavos} />
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="By plot">
        {spend.byPlot.length === 0 ? (
          <Empty>Nothing tagged to a plot in this window.</Empty>
        ) : (
          <ul className="divide-y-2 divide-line">
            {spend.byPlot.map((row) => (
              <li key={row.key} className="flex justify-between gap-3 py-2">
                <span>{row.label}</span>
                <Money centavos={row.amountCentavos} />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </Page>
  );
}
