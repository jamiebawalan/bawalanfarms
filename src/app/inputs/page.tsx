import { Card, Empty, Money, Note, Page, Stat, StatGrid } from "@/components/ui";
import { InputsClient } from "@/components/inputs-client";
import { loadLedger } from "@/lib/db/ledger";
import { remainingStock } from "@/lib/domain/dosing";
import { formatDate } from "@/lib/domain/dates";
import { formatPeso } from "@/lib/domain/money";
import { cycleIsLiveOn } from "@/lib/domain/allocation";
import { todayISO } from "@/lib/domain/dates";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Stock.
 *
 * This screen exists because of one number: ₱275,000 of fertiliser bought as a
 * single lot of 250 sacks and attributed to nothing, because it was consumed
 * across many plots over months. Buying is not a cost here. Drawing is.
 */
export default async function InputsPage() {
  const ledger = await loadLedger();
  const supabase = await createClient();
  const { data: inputTypes } = await supabase
    .from("input_types")
    .select("*")
    .eq("active", true)
    .order("label");

  const today = todayISO();

  const lots = ledger.purchases
    .map((p) => {
      const draws = ledger.draws.filter((d) => d.purchaseId === p.id);
      const remaining = remainingStock(p.quantity, draws);
      return {
        ...p,
        draws: draws.length,
        remaining,
        remainingValueCentavos: Math.round(p.unitCostCentavos * remaining),
      };
    })
    .sort((a, b) => b.date.localeCompare(a.date));

  const open = lots.filter((l) => l.remaining > 0.001);
  const stockValue = open.reduce((a, l) => a + l.remainingValueCentavos, 0);

  const openCycles = ledger.cycles
    .filter((c) => cycleIsLiveOn(c, today))
    .map((c) => ({
      id: c.id,
      label: `${ledger.plots.find((p) => p.id === c.plotId)?.label ?? "Plot"} · ${c.crop}`,
      counts: ledger.plantCounts
        .filter((p) => p.cycleId === c.id)
        .map((p) => ({ date: p.date, count: p.count })),
    }));

  return (
    <Page title="Stock" subtitle="Buying is not a cost. Drawing is.">
      <StatGrid>
        <Stat label="Lots open" value={String(open.length)} />
        <Stat label="Stock on hand" value={formatPeso(stockValue)} hint="not yet a cost" />
      </StatGrid>

      <InputsClient
        inputTypes={(inputTypes ?? []).map((t: any) => ({
          code: t.code, label: t.label, unit: t.unit,
          kgPerUnit: t.kg_per_unit === null ? null : Number(t.kg_per_unit),
        }))}
        lots={open.map((l) => ({
          id: l.id,
          label: l.inputType,
          unit: l.unit,
          remaining: l.remaining,
          unitCostCentavos: l.unitCostCentavos,
          kgPerUnit:
            (inputTypes ?? []).find((t: any) => t.code === l.inputType)?.kg_per_unit ?? null,
        }))}
        cycles={openCycles}
      />

      <Card title="Lots">
        {lots.length === 0 ? (
          <Empty>Nothing bought yet.</Empty>
        ) : (
          <ul className="divide-y-2 divide-line">
            {lots.map((l) => (
              <li key={l.id} className="py-3">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-semibold">{l.inputType}</span>
                  <Money centavos={l.totalCentavos} />
                </div>
                <div className="mt-0.5 flex items-baseline justify-between gap-3 text-sm text-ink-soft">
                  <span>
                    {formatDate(l.date)}
                    {l.supplier ? ` · ${l.supplier}` : ""}
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
        the day it is drawn, on the cycle that used it.
      </Note>
    </Page>
  );
}
