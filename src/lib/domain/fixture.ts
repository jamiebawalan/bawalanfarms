import { DEFAULT_SETTINGS, type Ledger } from "./types";

/**
 * A small ledger that reproduces the situations the real data actually
 * contains: a bulk fertiliser lot drawn across two cycles, a farm-wide truck
 * repair, an area split, Primera sold at three different prices inside eleven
 * days, and a plot whose costs landed while no cycle was open.
 */
export function makeLedger(): Ledger {
  return {
    plots: [
      { id: "p1", code: "1", label: "Plot 1", sharesOverhead: true, active: true },
      { id: "p2", code: "2", label: "Plot 2", sharesOverhead: true, active: true },
      { id: "p3", code: "3", label: "Plot 3", sharesOverhead: true, active: true },
      { id: "pm", code: "Mango", label: "Mango", sharesOverhead: false, active: true },
      { id: "pc", code: "27", label: "Coffee (27)", sharesOverhead: true, active: true },
    ],
    plotAreas: [
      { plotId: "p1", effectiveFrom: "2015-01-01", areaSqm: 6000 },
      { plotId: "p2", effectiveFrom: "2015-01-01", areaSqm: 2000 },
      { plotId: "p3", effectiveFrom: "2015-01-01", areaSqm: 2000 },
      { plotId: "pm", effectiveFrom: "2015-01-01", areaSqm: 3630 },
      // Coffee has no area: it must never silently take a share.
    ],
    cycles: [
      {
        id: "c1", plotId: "p1", crop: "pineapple", status: "harvesting",
        dateStarted: "2024-01-01", datePlanted: "2024-02-01", dateClosed: null,
        kasamaSharePct: null, targetForcingDate: null, targetHarvestDate: null,
      },
      {
        id: "c2", plotId: "p2", crop: "peanut", status: "closed",
        dateStarted: "2024-01-01", datePlanted: "2024-01-15", dateClosed: "2024-06-30",
        kasamaSharePct: null, targetForcingDate: null, targetHarvestDate: null,
      },
      {
        id: "cm", plotId: "pm", crop: "mango", status: "growing",
        dateStarted: "2024-01-01", datePlanted: "2024-01-01", dateClosed: null,
        kasamaSharePct: null, targetForcingDate: null, targetHarvestDate: null,
      },
    ],
    expenses: [
      // Direct labour on the pineapple cycle: 4 people at ₱450.
      {
        id: "e1", date: "2024-03-01", category: "Labor", activity: "deweed",
        attribution: "direct", farmWideReason: null, capitalAssetId: null,
        labourMode: "daily", unitPriceCentavos: 45_000, quantity: 4,
        amountCentavos: 180_000,
      },
      // A split across plots 1 and 2, 6000:2000 sqm = 3:1.
      {
        id: "e2", date: "2024-03-02", category: "Labor", activity: "food",
        attribution: "split", farmWideReason: null, capitalAssetId: null,
        labourMode: null, unitPriceCentavos: null, quantity: null,
        amountCentavos: 40_000,
      },
      // Farm-wide truck repair on a day when both cycles were live.
      {
        id: "e3", date: "2024-03-03", category: "Machines", activity: "barang",
        attribution: "farm_wide", farmWideReason: "vehicle", capitalAssetId: null,
        labourMode: null, unitPriceCentavos: null, quantity: null,
        amountCentavos: 100_000,
      },
      // Capital: a sprayer. Must never reach a cycle P&L.
      {
        id: "e4", date: "2024-03-04", category: "Machines", activity: "other",
        activityOtherNote: "Knapsack sprayer purchase",
        attribution: "capital", farmWideReason: null, capitalAssetId: "a1",
        labourMode: null, unitPriceCentavos: null, quantity: null,
        amountCentavos: 600_000,
      },
      // Cost on plot 3, where no cycle was ever open.
      {
        id: "e5", date: "2024-04-01", category: "Labor", activity: "plot_clearing",
        attribution: "direct", farmWideReason: null, capitalAssetId: null,
        labourMode: "daily", unitPriceCentavos: 40_000, quantity: 2,
        amountCentavos: 80_000,
      },
    ],
    allocations: [
      { expenseId: "e1", plotId: "p1", cycleId: "c1", amountCentavos: 180_000 },
      { expenseId: "e2", plotId: "p1", cycleId: "c1", amountCentavos: 30_000 },
      { expenseId: "e2", plotId: "p2", cycleId: "c2", amountCentavos: 10_000 },
      { expenseId: "e5", plotId: "p3", cycleId: null, amountCentavos: 80_000 },
    ],
    purchases: [
      {
        id: "buy1", date: "2024-02-01", inputType: "fert_21_0_0", quantity: 250,
        unit: "sack", unitCostCentavos: 110_000, totalCentavos: 27_500_000,
        supplier: "Bulk lot",
      },
    ],
    draws: [
      { id: "d1", purchaseId: "buy1", cycleId: "c1", date: "2024-03-10", quantity: 10 },
      { id: "d2", purchaseId: "buy1", cycleId: "c2", date: "2024-03-10", quantity: 4 },
    ],
    harvests: [
      { id: "h1", cycleId: "c1", date: "2024-05-01" },
      { id: "h2", cycleId: "c1", date: "2024-05-10" },
    ],
    harvestLines: [
      { harvestId: "h1", product: "primera", quantity: 500 },
      { harvestId: "h1", product: "segunda", quantity: 300 },
      { harvestId: "h2", product: "primera", quantity: 200 },
    ],
    sales: [
      { id: "s1", cycleId: "c1", buyerId: "b1", date: "2024-05-02" },
      { id: "s2", cycleId: "c1", buyerId: "b2", date: "2024-05-08" },
      { id: "s3", cycleId: "c1", buyerId: "b1", date: "2024-05-13" },
    ],
    saleLines: [
      // The same grade at three prices inside eleven days, as in the real data.
      { saleId: "s1", product: "primera", quantity: 300, unitPriceCentavos: 7_000, totalCentavos: 2_100_000, isBulk: false },
      { saleId: "s2", product: "primera", quantity: 200, unitPriceCentavos: 6_500, totalCentavos: 1_300_000, isBulk: false },
      { saleId: "s3", product: "primera", quantity: 100, unitPriceCentavos: 6_000, totalCentavos: 600_000, isBulk: false },
      { saleId: "s1", product: "segunda", quantity: 250, unitPriceCentavos: 4_000, totalCentavos: 1_000_000, isBulk: false },
    ],
    plantCounts: [
      { cycleId: "c1", date: "2024-02-15", count: 12_000 },
      { cycleId: "c1", date: "2024-08-01", count: 11_500 },
    ],
    capitalAssets: [
      {
        id: "a1", name: "Knapsack sprayer", purchaseDate: "2024-03-04",
        costCentavos: 600_000, usefulLifeMonths: 60, disposedOn: null,
      },
    ],
    buyers: [
      { id: "b1", name: "Maynilaan" },
      { id: "b2", name: "Batas" },
    ],
    products: [
      { code: "primera", label: "Primera", sortOrder: 1, isGrade: true },
      { code: "segunda", label: "Segunda", sortOrder: 2, isGrade: true },
    ],
    crops: [
      { code: "pineapple", label: "Pineapple" },
      { code: "peanut", label: "Peanut" },
      { code: "mango", label: "Mango" },
    ],
    leafMeasurements: [],
    leafPlants: [],
    tasks: [],
    settings: DEFAULT_SETTINGS,
    activities: [
      { code: "deweed", label: "Deweed", activityGroup: "Crop care", defaultCategory: "Labor" },
      { code: "food", label: "Food", activityGroup: "Inputs", defaultCategory: "Farm Inputs" },
      { code: "barang", label: "Barang (repairs, parts, diesel)", activityGroup: "Machines & transport", defaultCategory: "Machines" },
      { code: "plot_clearing", label: "Plot Clearing", activityGroup: "Land & planting", defaultCategory: "Labor" },
      { code: "other", label: "Other", activityGroup: "Other", defaultCategory: "Miscellaneous" },
    ],
  };
}
