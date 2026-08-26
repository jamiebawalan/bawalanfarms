import type { Ledger } from "@/lib/domain/types";
import { cycleIsLiveOn } from "@/lib/domain/allocation";
import { lastPriceFor } from "@/lib/domain/reports";
import { todayISO } from "@/lib/domain/dates";

/** The cycles a harvest or sale can be attached to: the ones actually running. */
export function openCycleOptions(ledger: Ledger, today = todayISO()) {
  return ledger.cycles
    .filter((c) => cycleIsLiveOn(c, today) && c.status !== "closed")
    .map((c) => ({
      id: c.id,
      crop: c.crop,
      label: `${ledger.plots.find((p) => p.id === c.plotId)?.label ?? "Plot"} · ${c.crop}`,
    }));
}

/**
 * The last price each buyer paid for each product, so the sale form opens with
 * a sensible starting figure instead of an empty box.
 */
export function lastPriceBook(
  ledger: Ledger,
): Record<string, Record<string, { centavos: number; date: string }>> {
  const book: Record<string, Record<string, { centavos: number; date: string }>> = {};
  for (const buyer of ledger.buyers) {
    for (const product of ledger.products) {
      const last = lastPriceFor(ledger, buyer.id, product.code);
      if (!last) continue;
      (book[buyer.id] ??= {})[product.code] = {
        centavos: last.unitPriceCentavos,
        date: last.date,
      };
    }
  }
  return book;
}
