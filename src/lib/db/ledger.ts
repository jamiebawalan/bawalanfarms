import { createClient } from "@/lib/supabase/server";
import { DEFAULT_SETTINGS, type FarmSettings, type Ledger } from "@/lib/domain/types";

/**
 * Loads the whole ledger.
 *
 * That sounds reckless and is not: this farm books about 700 expense rows and
 * twenty-odd sales a year. The entire history is a few hundred kilobytes, and
 * reading it once per report page keeps every figure computed by the same
 * tested functions instead of by a drift-prone second implementation in SQL.
 *
 * If the farm ever grows enough for this to hurt, the fix is a date-windowed
 * version of this one function, not a rewrite of the reports.
 */
export async function loadLedger(): Promise<Ledger> {
  const supabase = await createClient();

  const [
    plots, plotAreas, cycles, expenses, allocations, purchases, draws,
    harvests, harvestLines, sales, saleLines, plantCounts, capitalAssets,
    buyers, products, activities, crops, leaves, tasks, settings,
  ] = await Promise.all([
    supabase.from("plots").select("*").order("sort_order"),
    supabase.from("plot_areas").select("*"),
    supabase.from("crop_cycles").select("*"),
    supabase.from("expenses").select("*"),
    supabase.from("expense_allocations").select("*"),
    supabase.from("input_purchases").select("*"),
    supabase.from("input_draws").select("*"),
    supabase.from("harvests").select("*"),
    supabase.from("harvest_lines").select("*"),
    supabase.from("sales").select("*"),
    supabase.from("sale_lines").select("*"),
    supabase.from("plant_count_observations").select("*"),
    supabase.from("capital_assets").select("*"),
    supabase.from("buyers").select("*").order("name"),
    supabase.from("products").select("*").order("sort_order"),
    supabase.from("activities").select("*").order("sort_order"),
    supabase.from("crops").select("*").order("label"),
    supabase.from("leaf_measurements").select("*"),
    supabase.from("tasks").select("*"),
    supabase.from("farm_settings").select("*"),
  ]);

  const rows = <T,>(r: { data: T[] | null; error: unknown }, what: string): T[] => {
    if (r.error) throw new Error(`could not load ${what}: ${JSON.stringify(r.error)}`);
    return r.data ?? [];
  };

  return {
    plots: rows<any>(plots, "plots").map((p) => ({
      id: p.id, code: p.code, label: p.label,
      sharesOverhead: p.shares_overhead, active: p.active, notes: p.notes,
    })),
    plotAreas: rows<any>(plotAreas, "plot areas").map((a) => ({
      plotId: a.plot_id, effectiveFrom: a.effective_from, areaSqm: Number(a.area_sqm),
    })),
    cycles: rows<any>(cycles, "cycles").map((c) => ({
      id: c.id, plotId: c.plot_id, crop: c.crop, status: c.status,
      dateStarted: c.date_started, datePlanted: c.date_planted, dateClosed: c.date_closed,
      kasamaSharePct: c.kasama_share_pct === null ? null : Number(c.kasama_share_pct),
      targetForcingDate: c.target_forcing_date ?? null,
      targetHarvestDate: c.target_harvest_date ?? null,
      plantingMaterialSource: c.planting_material_source, notes: c.notes,
    })),
    expenses: rows<any>(expenses, "expenses").map((e) => ({
      id: e.id, date: e.date, category: e.category, activity: e.activity,
      activityOtherNote: e.activity_other_note, attribution: e.attribution,
      farmWideReason: e.farm_wide_reason, capitalAssetId: e.capital_asset_id,
      labourMode: e.labour_mode,
      unitPriceCentavos: e.unit_price_centavos === null ? null : Number(e.unit_price_centavos),
      quantity: e.quantity === null ? null : Number(e.quantity),
      amountCentavos: Number(e.amount_centavos),
      paidTo: e.paid_to, note: e.note,
    })),
    allocations: rows<any>(allocations, "allocations").map((a) => ({
      expenseId: a.expense_id, plotId: a.plot_id, cycleId: a.cycle_id,
      amountCentavos: Number(a.amount_centavos),
    })),
    purchases: rows<any>(purchases, "input purchases").map((p) => ({
      id: p.id, date: p.date, inputType: p.input_type, quantity: Number(p.quantity),
      unit: p.unit, unitCostCentavos: Number(p.unit_cost_centavos),
      totalCentavos: Number(p.total_centavos), supplier: p.supplier,
    })),
    draws: rows<any>(draws, "input draws").map((d) => ({
      id: d.id, purchaseId: d.purchase_id, cycleId: d.cycle_id, date: d.date,
      quantity: Number(d.quantity), doseNote: d.dose_note,
    })),
    harvests: rows<any>(harvests, "harvests").map((h) => ({
      id: h.id, cycleId: h.cycle_id, date: h.date, note: h.note,
    })),
    harvestLines: rows<any>(harvestLines, "harvest lines").map((l) => ({
      harvestId: l.harvest_id, product: l.product, quantity: Number(l.quantity),
    })),
    sales: rows<any>(sales, "sales").map((s) => ({
      id: s.id, cycleId: s.cycle_id, buyerId: s.buyer_id, date: s.date, note: s.note,
    })),
    saleLines: rows<any>(saleLines, "sale lines").map((l) => ({
      saleId: l.sale_id, product: l.product, quantity: Number(l.quantity),
      unitPriceCentavos: Number(l.unit_price_centavos),
      totalCentavos: Number(l.total_centavos), isBulk: l.is_bulk,
    })),
    plantCounts: rows<any>(plantCounts, "plant counts").map((p) => ({
      cycleId: p.cycle_id, date: p.date, count: p.count, note: p.note,
    })),
    capitalAssets: rows<any>(capitalAssets, "capital assets").map((a) => ({
      id: a.id, name: a.name, purchaseDate: a.purchase_date,
      costCentavos: Number(a.cost_centavos), usefulLifeMonths: a.useful_life_months,
      disposedOn: a.disposed_on, note: a.note,
    })),
    buyers: rows<any>(buyers, "buyers").map((b) => ({ id: b.id, name: b.name })),
    products: rows<any>(products, "products").map((p) => ({
      code: p.code, label: p.label, sortOrder: p.sort_order, isGrade: p.is_grade,
    })),
    activities: rows<any>(activities, "activities").map((a) => ({
      code: a.code, label: a.label, activityGroup: a.activity_group,
      defaultCategory: a.default_category,
    })),
    crops: rows<any>(crops, "crops").map((c) => ({ code: c.code, label: c.label })),
    leafMeasurements: rows<any>(leaves, "leaf measurements").map((l) => ({
      cycleId: l.cycle_id, date: l.date,
      avgLengthCm: Number(l.avg_length_cm),
      sampleSize: l.sample_size === null ? null : Number(l.sample_size),
    })),
    tasks: rows<any>(tasks, "tasks").map((t) => ({
      id: t.id, plotId: t.plot_id, cycleId: t.cycle_id, title: t.title,
      activity: t.activity, dueDate: t.due_date, isCritical: t.is_critical,
      doneAt: t.done_at,
    })),
    settings: readSettings(rows<any>(settings, "farm settings")),
  };
}

/**
 * Settings are rows so the owners can correct them without a deploy. A missing
 * one falls back to the documented default rather than to zero, which would
 * quietly turn a ratio into a divide-by-zero or a 0% utilisation figure.
 */
function readSettings(rows: { key: string; value: number | string }[]): FarmSettings {
  const get = (key: string, fallback: number) => {
    const row = rows.find((r) => r.key === key);
    const value = row === undefined ? NaN : Number(row.value);
    return Number.isFinite(value) && value > 0 ? value : fallback;
  };
  return {
    targetPlantsPerSqm: get(
      "target_plants_per_sqm", DEFAULT_SETTINGS.targetPlantsPerSqm),
    pineappleMonthsToHarvest: get(
      "pineapple_months_to_harvest", DEFAULT_SETTINGS.pineappleMonthsToHarvest),
    dleafForcingCm: get("dleaf_forcing_cm", DEFAULT_SETTINGS.dleafForcingCm),
    monthsForcingToHarvest: get(
      "months_forcing_to_harvest", DEFAULT_SETTINGS.monthsForcingToHarvest),
    dleafSampleSize: get("dleaf_sample_size", DEFAULT_SETTINGS.dleafSampleSize),
  };
}
