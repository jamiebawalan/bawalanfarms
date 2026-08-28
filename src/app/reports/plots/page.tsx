import Link from "next/link";
import { Card, Empty, Money, Note, Page } from "@/components/ui";
import { loadLedger } from "@/lib/db/ledger";
import { plotHistories } from "@/lib/domain/reports";
import { formatDate } from "@/lib/domain/dates";
import { formatPeso, formatPesoPrecise } from "@/lib/domain/money";

export const dynamic = "force-dynamic";

/**
 * Stacking every cycle a plot has run is what separates "this plot is bad" from
 * "that year was bad", which is a decision about replanting, not a curiosity.
 */
export default async function PlotsPage() {
  const ledger = await loadLedger();
  const histories = plotHistories(ledger);

  return (
    <Page title="Plot history" subtitle="Every cycle each plot has run">
      {histories.map((h) => (
        <Card
          key={h.plot.id}
          title={h.plot.label}
          action={
            h.marginPerSqmCentavos !== null ? (
              <span className="tabular text-sm font-semibold">
                {formatPesoPrecise(h.marginPerSqmCentavos)}/sqm
              </span>
            ) : null
          }
        >
          <p className="mb-3 text-sm text-ink-soft">
            {h.areaSqm === null
              ? "Area not surveyed yet"
              : `${h.areaSqm.toLocaleString("en-PH")} sqm`}
            {" · "}
            {h.closedCycleCount} closed{" "}
            {h.closedCycleCount === 1 ? "cycle" : "cycles"}
          </p>

          {h.cycles.length === 0 ? (
            <Empty>No cycle has run here yet.</Empty>
          ) : (
            <ul className="divide-y-2 divide-line">
              {h.cycles.map((c) => (
                <li key={c.cycle.id}>
                  <Link
                    href={`/cycles/${c.cycle.id}`}
                    className="flex min-h-14 items-center justify-between gap-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <div className="font-semibold">{c.cycle.crop}</div>
                      <div className="text-sm text-ink-soft">
                        {c.cycle.dateStarted ? formatDate(c.cycle.dateStarted) : "not started"}
                        {c.isClosed ? ` → ${formatDate(c.cycle.dateClosed)}` : " → running"}
                      </div>
                    </div>
                    <div className="text-right">
                      <Money centavos={c.grossMarginCentavos} signed />
                      <div className="text-xs text-ink-soft">
                        {formatPeso(c.revenueCentavos)} in, {formatPeso(c.totalCostCentavos)} out
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      ))}

      <Note tone="info">
        Margin per square metre counts closed cycles only. A cycle still running
        has spent its costs but not yet earned its revenue, so including it would
        make every live plot look like a disaster.
      </Note>
    </Page>
  );
}
