import { createClient } from "@/lib/supabase/server";
import { loadLedger } from "./ledger";
import { remainingStock } from "@/lib/domain/dosing";
import { plotIsOccupiedOn } from "@/lib/domain/allocation";
import { todayISO } from "@/lib/domain/dates";
import type { Ledger } from "@/lib/domain/types";

/**
 * Everything the three stock screens need, assembled once.
 *
 * Buying, using and selling are three different errands at three different
 * moments, so they are three screens — but they all ask the shed the same
 * questions, and a second copy of this arithmetic is a second place for the
 * remaining-stock figure to be subtly wrong.
 */
export async function loadStockScreen() {
  const ledger = await loadLedger();
  const supabase = await createClient();
  const { data: types } = await supabase
    .from("input_types")
    .select("*")
    .eq("active", true)
    .order("label");

  const today = todayISO();
  const nameOf = new Map<string, string>(
    ledger.inputTypes.map((t) => [t.code, t.label]),
  );

  const lots = ledger.purchases
    .map((p) => {
      const draws = ledger.draws.filter((d) => d.purchaseId === p.id);
      const remaining = remainingStock(p.quantity, draws);
      // Sold stock has already left `remaining`; it is named separately so a
      // lot that shrank without any plot being charged says why.
      const sold = draws
        .filter((d) => d.reason === "sold")
        .reduce((a, d) => a + d.quantity, 0);
      return {
        ...p,
        label: nameOf.get(p.inputType) ?? p.inputTypeLabel,
        sold: Math.round(sold * 1000) / 1000,
        remaining,
        remainingValueCentavos: Math.round(p.unitCostCentavos * remaining),
      };
    })
    .sort((a, b) => b.date.localeCompare(a.date));

  const open = lots.filter((l) => l.remaining > 0.001);

  return {
    ledger,
    lots,
    open,
    stockValueCentavos: open.reduce((a, l) => a + l.remainingValueCentavos, 0),
    // Buying offers only what is active; drawing and selling offer whatever
    // has stock, retired or not, or the last of a retired lot could never
    // leave the shed.
    inputTypes: ((types ?? []) as Record<string, unknown>[]).map((t) => ({
      code: String(t.code),
      label: String(t.label),
      unit: String(t.unit),
      kgPerUnit: t.kg_per_unit === null || t.kg_per_unit === undefined
        ? null
        : Number(t.kg_per_unit),
      category: (t.category === "protection" || t.category === "forcing"
        ? t.category
        : "care") as "care" | "protection" | "forcing",
    })),
    lotOptions: open.map((l) => ({
      id: l.id,
      label: l.label,
      unit: l.unit,
      remaining: l.remaining,
      unitCostCentavos: l.unitCostCentavos,
      kgPerUnit: kgPerUnitOf(ledger, l.inputType),
    })),
    openCycles: openCyclesOf(ledger, today),
  };
}

function kgPerUnitOf(ledger: Ledger, code: string): number | null {
  // From the whole catalogue, not the active slice: a lot of a retired type
  // still needs its pack weight to suggest a draw quantity.
  return ledger.inputTypes.find((t) => t.code === code)?.kgPerUnit ?? null;
}

function openCyclesOf(ledger: Ledger, today: string) {
  return ledger.cycles
    .filter((c) => plotIsOccupiedOn(c, today))
    .map((c) => ({
      id: c.id,
      label: `${ledger.plots.find((p) => p.id === c.plotId)?.label ?? "Plot"} · ${c.crop}`,
      counts: ledger.plantCounts
        .filter((p) => p.cycleId === c.id)
        .map((p) => ({ date: p.date, count: p.count })),
    }));
}
