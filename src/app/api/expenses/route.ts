import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

/**
 * The single write path for expenses, used by the form and replayed verbatim by
 * the offline queue. Validation happens here as well as in the database: the
 * database is the guarantee, this is the part that can explain itself.
 */

const Allocation = z.object({
  plot_id: z.string().uuid(),
  cycle_id: z.string().uuid().nullable().optional(),
  amount_centavos: z.number().int().nonnegative(),
});

const Payload = z
  .object({
    id: z.string().uuid(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    category: z.enum([
      "Labor", "Farm Inputs", "Farm Transport", "Selling Transport",
      "Machines", "Miscellaneous",
    ]),
    activity: z.string().min(1),
    activity_other_note: z.string().optional(),
    attribution: z.enum(["direct", "split", "farm_wide", "capital"]),
    farm_wide_reason: z.enum(["vehicle", "selling", "general", "animal_care"]).optional(),
    labour_mode: z.enum(["daily", "pakyaw", "kasama"]).optional(),
    unit_price_centavos: z.number().int().nonnegative().nullable().optional(),
    quantity: z.number().positive().nullable().optional(),
    amount_centavos: z.number().int().positive(),
    paid_to: z.string().optional(),
    note: z.string().optional(),
    photo_path: z.string().optional(),
    new_capital_asset: z
      .object({
        name: z.string().min(1),
        useful_life_months: z.number().int().positive().default(60),
        note: z.string().optional(),
      })
      .nullable()
      .optional(),
    allocations: z.array(Allocation).default([]),
  })
  .superRefine((v, ctx) => {
    const fail = (message: string) => ctx.addIssue({ code: "custom", message });

    if (v.attribution === "direct" && v.allocations.length !== 1) {
      fail("Pick exactly one plot, or choose Split for more than one.");
    }
    if (v.attribution === "split" && v.allocations.length < 2) {
      fail("A split needs at least two plots.");
    }
    if (
      (v.attribution === "farm_wide" || v.attribution === "capital") &&
      v.allocations.length > 0
    ) {
      fail("Whole-farm and equipment costs are not tagged to plots.");
    }
    if (v.attribution === "farm_wide" && !v.farm_wide_reason) {
      fail("Say why this covers the whole farm.");
    }
    if (v.attribution === "capital" && !v.new_capital_asset) {
      fail("Equipment needs a name for the capital register.");
    }
    if (v.activity === "other" && (v.activity_other_note ?? "").trim().length < 3) {
      fail("Say what this was, in the note.");
    }
    if (v.attribution === "direct" || v.attribution === "split") {
      const allocated = v.allocations.reduce((a, l) => a + l.amount_centavos, 0);
      if (allocated !== v.amount_centavos) {
        const off = Math.abs(v.amount_centavos - allocated) / 100;
        fail(`The split is off by ₱${off.toFixed(2)}. It must add up to the amount.`);
      }
    }
    if (
      v.unit_price_centavos != null && v.quantity != null &&
      Math.round(v.unit_price_centavos * v.quantity) !== v.amount_centavos
    ) {
      fail("The amount does not match the unit price times the quantity.");
    }
    if (v.labour_mode && v.category !== "Labor") {
      fail("A labour mode only belongs on a Labor cost.");
    }
  });

export async function POST(request: Request) {
  const parsed = Payload.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues.map((i) => i.message).join(" ") },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { data, error } = await supabase.rpc("save_expense", { payload: parsed.data });
  if (error) {
    // A constraint violation is the entry's fault and will fail again on retry,
    // so it comes back as a 400 the form can show. Anything else may be
    // transient, and a 5xx tells the client to queue and try later.
    const isConstraint = /violates|must|refus|check constraint|exception/i.test(error.message);
    return NextResponse.json(
      { error: humanise(error.message) },
      { status: isConstraint ? 400 : 500 },
    );
  }

  return NextResponse.json({ id: data });
}

/** Postgres speaks to developers. This speaks to a farm manager. */
function humanise(message: string): string {
  if (/one_active_cycle_per_plot/.test(message)) {
    return "That plot already has a cycle running.";
  }
  if (/allocations for expense .* total/.test(message)) {
    return "The split does not add up to the amount.";
  }
  if (/is closed/.test(message)) {
    return "That cycle is closed, so its costs are frozen.";
  }
  if (/date_in_plausible_range/.test(message)) {
    return "That date looks wrong — check the year.";
  }
  return message;
}
