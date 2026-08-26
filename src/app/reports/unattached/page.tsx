import { Card, Empty, Money, Note, Page } from "@/components/ui";
import { loadLedger } from "@/lib/db/ledger";
import { unattachedCosts } from "@/lib/domain/pnl";
import { formatPeso } from "@/lib/domain/money";

export const dynamic = "force-dynamic";

/**
 * The report that keeps this from quietly becoming the old spreadsheet again.
 *
 * Money logged against a plot on a day when no cycle was open is not lost, but
 * it reaches no profit figure. Left invisible, that gap grows.
 */
export default async function UnattachedPage() {
  const ledger = await loadLedger();
  const rows = unattachedCosts(ledger);
  const total = rows.reduce((a, r) => a + r.amountCentavos, 0);

  return (
    <Page
      title="Unattached costs"
      subtitle="Logged against a plot, but no cycle was open that day"
    >
      {rows.length === 0 ? (
        <Card>
          <Empty>Every cost has found a cycle. Nothing to chase.</Empty>
        </Card>
      ) : (
        <>
          <Note tone="warn">
            {formatPeso(total)} across {rows.length}{" "}
            {rows.length === 1 ? "plot" : "plots"}. Starting a cycle with the right
            start date, or backdating one, pulls these into a profit figure.
          </Note>
          <Card>
            <ul className="divide-y-2 divide-line">
              {rows.map((r) => (
                <li key={r.plotId} className="flex items-center justify-between gap-3 py-3">
                  <div>
                    <div className="font-semibold">{r.plotLabel}</div>
                    <div className="text-sm text-ink-soft">
                      {r.count} {r.count === 1 ? "entry" : "entries"}
                    </div>
                  </div>
                  <Money centavos={r.amountCentavos} />
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}
    </Page>
  );
}
