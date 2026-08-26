import { Card, Empty, Money, Note, Page, Stat, StatGrid } from "@/components/ui";
import { loadLedger } from "@/lib/db/ledger";
import { capitalRegister } from "@/lib/domain/reports";
import { formatDate, todayISO } from "@/lib/domain/dates";
import { formatPeso } from "@/lib/domain/money";

export const dynamic = "force-dynamic";

export default async function CapitalPage() {
  const ledger = await loadLedger();
  const register = capitalRegister(ledger, todayISO());

  return (
    <Page title="Capital register" subtitle="Equipment, written down in a straight line">
      <StatGrid>
        <Stat label="Bought" value={formatPeso(register.totalCostCentavos)} />
        <Stat label="Book value" value={formatPeso(register.totalBookValueCentavos)} />
        <Stat
          label="Monthly charge"
          value={formatPeso(register.monthlyChargeCentavos)}
          hint="still depreciating"
        />
      </StatGrid>

      <Card>
        {register.rows.length === 0 ? (
          <Empty>
            No equipment recorded. Log a purchase as "Equipment" and it appears here.
          </Empty>
        ) : (
          <ul className="divide-y-2 divide-line">
            {register.rows.map((a) => (
              <li key={a.id} className="py-3">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-semibold">{a.name}</span>
                  <Money centavos={a.costCentavos} />
                </div>
                <div className="mt-0.5 text-sm text-ink-soft tabular">
                  {formatDate(a.purchaseDate)} · {a.usefulLifeMonths} months ·{" "}
                  {formatPeso(a.monthlyChargeCentavos)}/month
                </div>
                <div className="mt-1 text-sm tabular">
                  {a.disposedOn
                    ? `Disposed ${formatDate(a.disposedOn)}`
                    : a.fullyDepreciated
                      ? "Fully written down"
                      : `Book value ${formatPeso(a.bookValueCentavos)} after ${a.monthsElapsed} months`}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Note tone="info">
        Equipment is kept out of every cycle's profit. This is a simple asset list
        with a monthly charge, deliberately not a fixed-asset subledger.
      </Note>
    </Page>
  );
}
