import { allCyclePnL } from "@/lib/domain/pnl";
import { buyerMargins, capitalRegister } from "@/lib/domain/reports";
import type { Ledger } from "@/lib/domain/types";
import type { Tab } from "./google";

/**
 * What the mirror writes.
 *
 * One tab per entity plus the flat cycle_pnl tab the owners asked for. The P&L
 * tab is built by the same tested functions the app's own screens use, so the
 * spreadsheet and the app can never quietly disagree about a number — which is
 * precisely the failure this whole project is replacing.
 *
 * Money crosses over as pesos, not centavos, so a column of it sums to
 * something a human recognises.
 */
export function buildTabs(ledger: Ledger, refreshedAt: string): Tab[] {
  const pesos = (centavos: number) => Math.round(centavos) / 100;
  const plotLabel = new Map(ledger.plots.map((p) => [p.id, p.label]));
  const buyerName = new Map(ledger.buyers.map((b) => [b.id, b.name]));
  const activityLabel = new Map(ledger.activities.map((a) => [a.code, a.label]));
  const productLabel = new Map(ledger.products.map((p) => [p.code, p.label]));

  const expenseById = new Map(ledger.expenses.map((e) => [e.id, e]));
  const saleById = new Map(ledger.sales.map((s) => [s.id, s]));
  const purchaseById = new Map(ledger.purchases.map((p) => [p.id, p]));
  const cycleLabel = new Map(
    ledger.cycles.map((c) => [
      c.id,
      `${plotLabel.get(c.plotId) ?? "Plot"} · ${c.crop} · ${c.dateStarted ?? "?"}`,
    ]),
  );

  const pnl = allCyclePnL(ledger);

  return [
    {
      title: "cycle_pnl",
      header: [
        "Cycle", "Plot", "Crop", "Status", "Started", "Planted", "Closed",
        "Area sqm", "Direct cost", "Stock drawn", "Farm-wide share",
        "Kasama share", "Total cost", "Revenue", "Gross margin", "Margin %",
        "Plants", "Cost per plant", "Harvested", "Sold", "Unsold",
        "Cost per unit harvested", "Margin per unit sold",
      ],
      rows: pnl.map((c) => [
        cycleLabel.get(c.cycle.id) ?? c.cycle.id,
        c.plot?.label ?? "",
        c.cycle.crop,
        c.cycle.status,
        c.cycle.dateStarted ?? "",
        c.cycle.datePlanted ?? "",
        c.cycle.dateClosed ?? "",
        c.areaSqm ?? "",
        pesos(c.directCostCentavos),
        pesos(c.inputDrawCostCentavos),
        pesos(c.farmWideShareCentavos),
        pesos(c.kasamaShareCentavos),
        pesos(c.totalCostCentavos),
        pesos(c.revenueCentavos),
        pesos(c.grossMarginCentavos),
        c.marginRatio === null ? "" : Math.round(c.marginRatio * 1000) / 10,
        c.plantCount ?? "",
        c.costPerPlantCentavos === null ? "" : pesos(c.costPerPlantCentavos),
        c.quantityHarvested,
        c.quantitySold,
        c.quantityUnsold,
        c.costPerUnitHarvestedCentavos === null ? "" : pesos(c.costPerUnitHarvestedCentavos),
        c.marginPerUnitSoldCentavos === null ? "" : pesos(c.marginPerUnitSoldCentavos),
      ]),
    },
    {
      title: "plots",
      header: ["Code", "Label", "Area sqm", "Shares overhead", "Active", "Notes"],
      rows: ledger.plots.map((p) => [
        p.code, p.label,
        ledger.plotAreas
          .filter((a) => a.plotId === p.id)
          .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0]?.areaSqm ?? "",
        p.sharesOverhead ? "yes" : "no",
        p.active ? "yes" : "no",
        p.notes ?? "",
      ]),
    },
    {
      title: "crop_cycles",
      header: ["Plot", "Crop", "Status", "Started", "Planted", "Closed", "Kasama %", "Notes"],
      rows: ledger.cycles.map((c) => [
        plotLabel.get(c.plotId) ?? "", c.crop, c.status,
        c.dateStarted ?? "", c.datePlanted ?? "", c.dateClosed ?? "",
        c.kasamaSharePct ?? "", c.notes ?? "",
      ]),
    },
    {
      title: "expenses",
      header: [
        "Date", "Category", "Activity", "Other note", "Attribution",
        "Farm-wide reason", "Labour mode", "Unit price", "Quantity", "Amount",
        "Paid to", "Note",
      ],
      rows: ledger.expenses
        .slice()
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((e) => [
          e.date, e.category, activityLabel.get(e.activity) ?? e.activity,
          e.activityOtherNote ?? "", e.attribution, e.farmWideReason ?? "",
          e.labourMode ?? "",
          e.unitPriceCentavos === null ? "" : pesos(e.unitPriceCentavos),
          e.quantity ?? "", pesos(e.amountCentavos), e.paidTo ?? "", e.note ?? "",
        ]),
    },
    {
      title: "expense_allocations",
      header: ["Date", "Activity", "Plot", "Cycle", "Amount"],
      rows: ledger.allocations.map((a) => {
        const e = expenseById.get(a.expenseId);
        return [
          e?.date ?? "",
          e ? (activityLabel.get(e.activity) ?? e.activity) : "",
          plotLabel.get(a.plotId) ?? "",
          a.cycleId === null ? "(no cycle open)" : (cycleLabel.get(a.cycleId) ?? ""),
          pesos(a.amountCentavos),
        ];
      }),
    },
    {
      title: "input_purchases",
      header: ["Date", "Input", "Quantity", "Unit", "Unit cost", "Total", "Supplier", "Remaining"],
      rows: ledger.purchases.map((p) => {
        const drawn = ledger.draws
          .filter((d) => d.purchaseId === p.id)
          .reduce((a, d) => a + d.quantity, 0);
        return [
          p.date, p.inputType, p.quantity, p.unit,
          pesos(p.unitCostCentavos), pesos(p.totalCentavos), p.supplier ?? "",
          Math.round((p.quantity - drawn) * 1000) / 1000,
        ];
      }),
    },
    {
      title: "input_draws",
      header: ["Date", "Input", "Cycle", "Quantity", "Cost", "Dose note"],
      rows: ledger.draws.map((d) => {
        const p = purchaseById.get(d.purchaseId);
        return [
          d.date, p?.inputType ?? "", cycleLabel.get(d.cycleId) ?? "", d.quantity,
          p ? pesos(Math.round(p.unitCostCentavos * d.quantity)) : "",
          d.doseNote ?? "",
        ];
      }),
    },
    {
      title: "harvests",
      header: ["Date", "Cycle", "Product", "Quantity", "Note"],
      rows: ledger.harvestLines.map((l) => {
        const h = ledger.harvests.find((x) => x.id === l.harvestId);
        return [
          h?.date ?? "", h ? (cycleLabel.get(h.cycleId) ?? "") : "",
          productLabel.get(l.product) ?? l.product, l.quantity, h?.note ?? "",
        ];
      }),
    },
    {
      title: "sales",
      header: ["Date", "Buyer", "Cycle", "Product", "Quantity", "Unit price", "Total", "Bulk"],
      rows: ledger.saleLines.map((l) => {
        const s = saleById.get(l.saleId);
        return [
          s?.date ?? "", s ? (buyerName.get(s.buyerId) ?? "") : "",
          s ? (cycleLabel.get(s.cycleId) ?? "") : "",
          productLabel.get(l.product) ?? l.product, l.quantity,
          pesos(l.unitPriceCentavos), pesos(l.totalCentavos),
          l.isBulk ? "yes" : "",
        ];
      }),
    },
    {
      title: "buyer_margin",
      header: ["Buyer", "Product", "Quantity", "Revenue", "Realised price", "Lowest", "Highest"],
      rows: buyerMargins(ledger).flatMap((b) =>
        b.byProduct.map((p) => [
          b.buyerName, productLabel.get(p.product) ?? p.product, p.quantity,
          pesos(p.revenueCentavos), pesos(p.averagePriceCentavos),
          pesos(p.minPriceCentavos), pesos(p.maxPriceCentavos),
        ]),
      ),
    },
    {
      title: "capital_register",
      header: ["Asset", "Bought", "Cost", "Life (months)", "Monthly charge", "Book value", "Disposed"],
      rows: capitalRegister(ledger).rows.map((a) => [
        a.name, a.purchaseDate, pesos(a.costCentavos), a.usefulLifeMonths,
        pesos(a.monthlyChargeCentavos), pesos(a.bookValueCentavos), a.disposedOn ?? "",
      ]),
    },
    {
      title: "about",
      header: ["Field", "Value"],
      rows: [
        ["Refreshed at", refreshedAt],
        ["Source of truth", "The Farm Tracker database. This copy is read-only."],
        [
          "Warning",
          "Edits made here are overwritten on the next refresh and are never read back.",
        ],
        ["Money", "All amounts are in pesos."],
      ],
    },
  ];
}
