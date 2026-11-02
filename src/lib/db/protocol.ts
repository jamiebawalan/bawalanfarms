/**
 * The protocol, read out of the database.
 *
 * Kept out of the main ledger on purpose. The ledger loads on every page and
 * the protocol is needed on one, so putting 66 activities and 110 dose rows
 * into it would make the cash screen pay for the plot screen's data.
 */

import type {
  Activity, ActivityMaterial, Basis, Material, PlanState, QtyUnit,
} from "@/lib/domain/protocol";
import type { InputType, StockLot } from "@/lib/domain/draws";
import type { ISODate } from "@/lib/domain/types";
import { createAdminClient } from "@/lib/supabase/server";

export type PlanEntry = {
  id: string;
  cycleId: string;
  subPlotId: string | null;
  activityCode: string;
  state: PlanState;
  dueOn: ISODate | null;
  doneOn: ISODate | null;
  skipReason: string | null;
  note: string | null;
  plants: number | null;
};

export type ProtocolData = {
  activities: Activity[];
  materials: Map<string, Material>;
  activityMaterials: ActivityMaterial[];
  plan: PlanEntry[];
  /**
   * False when the protocol tables are not there yet, which is the honest
   * answer on a database the migration has not reached: the page says the
   * protocol is not loaded rather than that there is nothing to do.
   */
  loaded: boolean;
};

const EMPTY: ProtocolData = {
  activities: [], materials: new Map(), activityMaterials: [], plan: [], loaded: false,
};

/**
 * The protocol itself, with no cycle attached.
 *
 * For reading the crop end to end rather than answering what one block is
 * due. Skips the plan query, which would otherwise be a round trip asking
 * about a cycle nobody named.
 */
export async function loadProtocolCatalogue(): Promise<ProtocolData> {
  return loadProtocol(null);
}

export async function loadProtocol(cycleId: string | null): Promise<ProtocolData> {
  const supabase = createAdminClient();

  const [activities, materials, activityMaterials, plan] = await Promise.all([
    supabase.from("protocol_activities").select("*").order("sort_order"),
    supabase.from("materials").select("*").eq("active", true).order("sort_order"),
    supabase.from("protocol_activity_materials").select("*"),
    cycleId === null
      ? Promise.resolve({ data: [], error: null })
      : supabase.from("protocol_plan").select("*").eq("cycle_id", cycleId),
  ]);

  // A missing table is a migration that has not run, not a failure worth a 500.
  if (activities.error !== null || materials.error !== null) return EMPTY;

  return {
    loaded: true,
    activities: (activities.data ?? []).map((a: Record<string, unknown>): Activity => ({
      code: String(a.code),
      mapMonth: Number(a.map_month),
      category: String(a.category),
      title: String(a.title),
      instruction: String(a.instruction),
      basis: a.basis as Basis,
      series: (a.series as string | null) ?? null,
      choiceGroup: (a.choice_group as string | null) ?? null,
      isDefault: Boolean(a.is_default),
      condition: (a.condition as string | null) ?? null,
      sortOrder: Number(a.sort_order),
    })),
    materials: new Map(
      (materials.data ?? []).map((m: Record<string, unknown>) => [
        String(m.code),
        {
          code: String(m.code),
          name: String(m.name),
          kind: String(m.kind),
          analysis: (m.analysis as string | null) ?? null,
          unit: m.unit as "kg" | "L",
          note: (m.note as string | null) ?? null,
          inputType: (m.input_type as string | null) ?? null,
        } satisfies Material,
      ]),
    ),
    activityMaterials: (activityMaterials.data ?? []).map(
      (m: Record<string, unknown>): ActivityMaterial => ({
        activityCode: String(m.activity_code),
        materialCode: String(m.material_code),
        qty: Number(m.qty),
        qtyUnit: m.qty_unit as QtyUnit,
        mixOrder:
          m.mix_order === null || m.mix_order === undefined ? null : Number(m.mix_order),
        note: (m.note as string | null) ?? null,
      }),
    ),
    plan: (plan.data ?? []).map((p: Record<string, unknown>): PlanEntry => ({
      id: String(p.id),
      cycleId: String(p.cycle_id),
      subPlotId: (p.sub_plot_id as string | null) ?? null,
      activityCode: String(p.activity_code),
      state: p.state as PlanState,
      dueOn: (p.due_on as ISODate | null) ?? null,
      doneOn: (p.done_on as ISODate | null) ?? null,
      skipReason: (p.skip_reason as string | null) ?? null,
      note: (p.note as string | null) ?? null,
      plants: p.plants === null || p.plants === undefined ? null : Number(p.plants),
    })),
  };
}

export type ScheduledWork = {
  id: string;
  cycleId: string;
  subPlotId: string | null;
  activityCode: string;
  title: string;
  dueOn: ISODate;
  blockName: string | null;
};

/**
 * Every protocol round the farm has committed to and not yet closed.
 *
 * Across all cycles, because the calendar is the farm's week rather than one
 * plot's. Rows without a date are left out: a plan with no day on it is not
 * something a calendar can show, and inventing one would put work in front of
 * the crew that nobody agreed to.
 */
export async function loadScheduledWork(): Promise<ScheduledWork[]> {
  const supabase = createAdminClient();

  const [plan, activities, blocks] = await Promise.all([
    supabase
      .from("protocol_plan")
      .select("id, cycle_id, sub_plot_id, activity_code, due_on")
      .eq("state", "scheduled")
      .not("due_on", "is", null),
    supabase.from("protocol_activities").select("code, title"),
    supabase.from("sub_plots").select("id, name"),
  ]);

  // A missing table means the migration has not run here. Nothing scheduled.
  if (plan.error !== null || activities.error !== null) return [];

  const titles = new Map(
    (activities.data ?? []).map((a: Record<string, unknown>) => [
      String(a.code),
      String(a.title),
    ]),
  );
  const blockNames = new Map(
    (blocks.data ?? []).map((b: Record<string, unknown>) => [
      String(b.id),
      String(b.name),
    ]),
  );

  return (plan.data ?? []).flatMap((p: Record<string, unknown>) => {
    const title = titles.get(String(p.activity_code));
    if (title === undefined) return [];
    const subPlotId = (p.sub_plot_id as string | null) ?? null;
    return [{
      id: String(p.id),
      cycleId: String(p.cycle_id),
      subPlotId,
      activityCode: String(p.activity_code),
      title,
      dueOn: p.due_on as ISODate,
      blockName: subPlotId === null ? null : blockNames.get(subPlotId) ?? null,
    }];
  });
}

/**
 * What is actually in the shed, lot by lot.
 *
 * A lot rather than a running total, because draws are recorded against the
 * purchase they came out of: that is what lets a plot's costs reflect the
 * price actually paid rather than an average across a year of buying.
 */
export async function loadStock(): Promise<{
  lots: StockLot[];
  types: Map<string, InputType>;
}> {
  const supabase = createAdminClient();

  const [types, purchases, draws] = await Promise.all([
    supabase.from("input_types").select("*").eq("active", true),
    supabase.from("input_purchases").select("id, input_type, date, quantity, unit_cost_centavos"),
    supabase.from("input_draws").select("purchase_id, quantity"),
  ]);
  if (types.error !== null || purchases.error !== null) {
    return { lots: [], types: new Map() };
  }

  const drawnByPurchase = new Map<string, number>();
  for (const d of draws.data ?? []) {
    const row = d as Record<string, unknown>;
    const id = String(row.purchase_id);
    drawnByPurchase.set(id, (drawnByPurchase.get(id) ?? 0) + Number(row.quantity));
  }

  return {
    types: new Map(
      (types.data ?? []).map((t: Record<string, unknown>) => [
        String(t.code),
        {
          code: String(t.code),
          label: String(t.label),
          unit: String(t.unit),
          kgPerUnit:
            t.kg_per_unit === null || t.kg_per_unit === undefined
              ? null
              : Number(t.kg_per_unit),
        } satisfies InputType,
      ]),
    ),
    lots: (purchases.data ?? []).flatMap((p: Record<string, unknown>) => {
      const id = String(p.id);
      const remaining =
        Math.round((Number(p.quantity) - (drawnByPurchase.get(id) ?? 0)) * 1000) / 1000;
      // An empty lot is not stock. Leaving it in would only make the
      // proposal walk past rows it can never take anything from.
      if (remaining <= 0) return [];
      return [{
        purchaseId: id,
        inputType: String(p.input_type),
        date: p.date as ISODate,
        remaining,
        unitCostCentavos: Number(p.unit_cost_centavos),
      } satisfies StockLot];
    }),
  };
}
