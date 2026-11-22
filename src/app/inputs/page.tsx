import { Card, Empty, Money, Note, Page, Stat, StatGrid } from "@/components/ui";
import { LiquidateForm } from "@/components/inputs-client";
import { loadStockScreen } from "@/lib/db/stock-screen";
import { formatDate } from "@/lib/domain/dates";
import { formatPeso } from "@/lib/domain/money";

export const dynamic = "force-dynamic";

/**
 * The shed.
 *
 * This screen exists because of one number: ₱275,000 of fertiliser bought as
 * a single lot of 250 sacks and attributed to nothing, because it was
 * consumed across many plots over months. Buying is not a cost here. Using
 * is — and that now happens under Log, where the day's writing-down happens.
 * What is left here is the question only this screen answers: what is
 * actually in the shed, and what has left it without going onto a plot.
 */
export default async function InputsPage() {
  const { lots, open, stockValueCentavos, lotOptions } = await loadStockScreen();

  return (
    <Page title="Stock" subtitle="What is in the shed.">
      <StatGrid>
        <Stat label="Lots open" value={String(open.length)} />
        <Stat
          label="Stock on hand"
          value={formatPeso(stockValueCentavos)}
          hint="not yet a cost"
        />
      </StatGrid>

      <Card title="Sell surplus">
        <LiquidateForm lots={lotOptions} />
      </Card>

      <Card title="Lots">
        {lots.length === 0 ? (
          <Empty>Nothing bought yet.</Empty>
        ) : (
          <ul className="divide-y-2 divide-line">
            {lots.map((l) => (
              <li key={l.id} className="py-3">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-semibold">{l.label}</span>
                  <Money centavos={l.totalCentavos} />
                </div>
                <div className="mt-0.5 flex items-baseline justify-between gap-3 text-sm text-ink-soft">
                  <span>
                    {formatDate(l.date)}
                    {l.supplier ? ` · ${l.supplier}` : ""}
                    {l.sold > 0 ? ` · ${l.sold} ${l.unit} sold off` : ""}
                  </span>
                  <span className="tabular font-semibold text-ink">
                    {l.remaining} of {l.quantity} {l.unit} left
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Note tone="info">
        Stock still in the shed is not a cost against any cycle. It becomes one
        the day it is used, on the plot that used it. Surplus sold off never
        becomes a cost at all — it leaves the shed without touching a plot.
      </Note>
    </Page>
  );
}
