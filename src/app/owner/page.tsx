import Link from "next/link";
import { Card, Empty, Note, Page } from "@/components/ui";
import {
  ChartStyles, GRADE_RAMP, Legend, PairStat, SERIES, StackedBar,
} from "@/components/charts";
import { loadLedger } from "@/lib/db/ledger";
import { ownerDashboard } from "@/lib/domain/dashboards";
import {
  formatPeso, formatPesoCompact, formatPesoPrecise, percent,
} from "@/lib/domain/money";
import { todayISO } from "@/lib/domain/dates";

export const dynamic = "force-dynamic";

/**
 * What the whole farm is doing.
 *
 * Every figure comes twice — the last three months in the headline, the last
 * twelve underneath. On an eighteen-month crop a single number is either stale
 * or noise, and the pair is what can actually be read as a direction.
 */
export default async function OwnerPage() {
  const ledger = await loadLedger();
  const today = todayISO();
  const d = ownerDashboard(ledger, today);
  const productLabel = new Map(ledger.products.map((p) => [p.code, p.label]));

  const nothingYet = d.year.revenueCentavos === 0 && d.year.costCentavos === 0;

  return (
    <Page title="The farm" subtitle="Last 3 months, against the last 12">
      <ChartStyles />

      {nothingYet ? (
        <Note tone="info">
          Nothing recorded in the last twelve months yet. These figures fill in as
          costs and sales are logged.
        </Note>
      ) : null}

      <div className="mb-4 grid grid-cols-2 gap-2">
        <PairStat
          label="Sales"
          recent={formatPeso(d.quarter.revenueCentavos)}
          recentLabel="last 3 months"
          prior={formatPeso(d.year.revenueCentavos)}
          priorLabel="last 12 months"
        />
        <PairStat
          label="Pineapples sold"
          recent={d.quarter.fruitSold.toLocaleString("en-PH")}
          recentLabel="last 3 months"
          prior={d.year.fruitSold.toLocaleString("en-PH")}
          priorLabel="last 12 months"
        />
        <PairStat
          label="Revenue / fruit"
          recent={
            d.quarter.avgRevenuePerFruitCentavos === null
              ? "—"
              : formatPesoPrecise(d.quarter.avgRevenuePerFruitCentavos)
          }
          recentLabel="last 3 months"
          prior={
            d.year.avgRevenuePerFruitCentavos === null
              ? "—"
              : formatPesoPrecise(d.year.avgRevenuePerFruitCentavos)
          }
          priorLabel="last 12 months"
          hint={
            d.quarter.gradeMix.length > 0
              ? `mostly ${productLabel.get(d.quarter.gradeMix[0]!.product) ?? ""} (${Math.round(d.quarter.gradeMix[0]!.share * 100)}%)`
              : undefined
          }
        />
        <PairStat
          label="Cost / fruit sold"
          recent={
            d.quarter.avgCostPerFruitSoldCentavos === null
              ? "—"
              : formatPesoPrecise(d.quarter.avgCostPerFruitSoldCentavos)
          }
          recentLabel="last 3 months"
          prior={
            d.year.avgCostPerFruitSoldCentavos === null
              ? "—"
              : formatPesoPrecise(d.year.avgCostPerFruitSoldCentavos)
          }
          priorLabel="last 12 months"
          tone={
            d.quarter.avgCostPerFruitSoldCentavos !== null &&
            d.quarter.avgRevenuePerFruitCentavos !== null &&
            d.quarter.avgCostPerFruitSoldCentavos > d.quarter.avgRevenuePerFruitCentavos
              ? "down"
              : undefined
          }
        />
        <PairStat
          label="Harvested / planted"
          recent={
            d.quarter.harvestRate === null
              ? "—"
              : `${(d.quarter.harvestRate * 100).toFixed(1)}%`
          }
          recentLabel="last 3 months"
          prior={
            d.year.harvestRate === null ? "—" : `${(d.year.harvestRate * 100).toFixed(1)}%`
          }
          priorLabel="last 12 months"
          hint="fruit picked against plants standing"
        />
        <PairStat
          label="Spend"
          recent={formatPeso(d.quarter.costCentavos)}
          recentLabel="last 3 months"
          prior={formatPeso(d.year.costCentavos)}
          priorLabel="last 12 months"
        />
      </div>

      <Card title="What sold, by grade">
        {d.year.gradeMix.length === 0 ? (
          <Empty>No pineapple sold in the last twelve months.</Empty>
        ) : (
          <>
            <p className="mb-2 text-sm text-ink-soft">
              The size behind the average price. Best grade first.
            </p>
            <StackedBar
              segments={d.year.gradeMix.map((g, i) => ({
                value: g.quantity,
                color: GRADE_RAMP[Math.min(i, GRADE_RAMP.length - 1)]!,
                label: productLabel.get(g.product) ?? g.product,
              }))}
            />
            <ul className="mt-3 divide-y-2 divide-line">
              {d.year.gradeMix.map((g, i) => (
                <li key={g.product} className="flex items-center justify-between gap-3 py-2">
                  <span className="flex items-center gap-2">
                    <span
                      aria-hidden="true"
                      className="inline-block size-3 rounded-sm"
                      style={{ background: GRADE_RAMP[Math.min(i, GRADE_RAMP.length - 1)] }}
                    />
                    <span className="font-semibold">
                      {productLabel.get(g.product) ?? g.product}
                    </span>
                  </span>
                  <span className="tabular text-ink-soft">
                    {g.quantity.toLocaleString("en-PH")} ·{" "}
                    <span className="font-semibold text-ink">
                      {Math.round(g.share * 100)}%
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>

      <Card title="What drove the cost">
        {d.year.costDrivers.length === 0 ? (
          <Empty>Nothing spent in the last twelve months.</Empty>
        ) : (
          <ul className="space-y-3">
            {d.year.costDrivers.map((row) => {
              const q = d.quarter.costDrivers.find((r) => r.category === row.category);
              return (
                <li key={row.category}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-semibold">{row.category}</span>
                    <span className="tabular text-sm">
                      <span className="font-semibold">
                        {formatPesoCompact(row.amountCentavos)}
                      </span>
                      <span className="ml-2 text-ink-soft">
                        {Math.round(row.share * 100)}% of 12mo
                      </span>
                    </span>
                  </div>
                  <StackedBar
                    segments={[
                      {
                        value: q?.amountCentavos ?? 0,
                        color: "var(--color-brand)",
                        label: "last 3 months",
                      },
                      {
                        value: Math.max(0, row.amountCentavos - (q?.amountCentavos ?? 0)),
                        color: "var(--color-paper-sunk)",
                        label: "earlier in the year",
                      },
                    ]}
                    title={`${row.category}: ${formatPeso(q?.amountCentavos ?? 0)} of ${formatPeso(row.amountCentavos)} fell in the last 3 months`}
                  />
                  <p className="mt-1 text-xs text-ink-soft">
                    {formatPeso(q?.amountCentavos ?? 0)} of it in the last 3 months
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card>
        <Link
          href="/manager"
          className="font-semibold text-brand underline underline-offset-4"
        >
          The day-to-day view →
        </Link>
        <p className="mt-1 text-sm text-ink-soft">
          Land use, cost per plant by plot, and what needs doing this week.
        </p>
        <Link
          href="/reports"
          className="mt-3 block font-semibold text-brand underline underline-offset-4"
        >
          All the detailed reports →
        </Link>
        <p className="mt-1 text-sm text-ink-soft">
          Plot history, spend by period, overhead watch, buyer margin, capital.
        </p>
      </Card>
    </Page>
  );
}
