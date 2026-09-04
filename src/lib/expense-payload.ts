import { z } from "zod";

/**
 * The shape of an expense on the wire.
 *
 * Shared by the two write paths — logging one and correcting one — because a
 * correction is the same entry, re-stated. Anything this accepts on the way in,
 * it has to accept on the way back out of the edit form, or a saved cost would
 * become uncorrectable by the very rules that let it be saved.
 *
 * Validation happens here as well as in the database: the database is the
 * guarantee, this is the part that can explain itself.
 */

const Allocation = z.object({
  plot_id: z.string().uuid(),
  cycle_id: z.string().uuid().nullable().optional(),
  amount_centavos: z.number().int().nonnegative(),
});

export const ExpensePayload = z
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
    /**
     * Only on a correction. The client generates it so a correction that was
     * queued on the phone and sent twice is applied once, exactly as the
     * expense id makes the original save idempotent.
     */
    revision_id: z.string().uuid().optional(),
    revision_note: z.string().optional(),
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

export type ExpensePayload = z.infer<typeof ExpensePayload>;

/**
 * Postgres speaks to developers. This speaks to a farm manager.
 *
 * Shared by both write paths so a rule explains itself the same way whether he
 * hits it entering a cost or correcting one.
 */
export function humanise(message: string): string {
  if (/one_active_cycle_per_plot/.test(message)) {
    return "That plot already has a cycle running.";
  }
  if (/allocations for expense .* total/.test(message)) {
    return "The split does not add up to the amount.";
  }
  if (/is closed/.test(message)) {
    return "That cycle is closed, so its costs are frozen. Reopen it on the cycle page first.";
  }
  if (/date_in_plausible_range/.test(message)) {
    return "That date looks wrong — check the year.";
  }
  if (/was deleted/.test(message)) {
    return "That entry was already deleted.";
  }
  if (/no such cost/.test(message)) {
    return "That entry is not there any more.";
  }
  if (/equipment purchase cannot be changed/.test(message)) {
    return "An equipment purchase cannot be turned into an ordinary cost. Delete this entry and log it again.";
  }
  if (/say why this entry is being deleted/.test(message)) {
    return "Say why you are deleting it.";
  }
  return message;
}

/**
 * Whose fault is it — the entry's, or the network's?
 *
 * It decides what happens next, and getting it wrong is expensive both ways. A
 * bad entry told to wait is retried on a timer forever and never fixed; a
 * dropped connection told it is a bad entry is dropped on the floor, and he
 * will not type the cost in a second time.
 *
 * So it reads the Postgres error code first, which is unambiguous: P0001 is a
 * rule this app raised by hand, and 23xxx is a constraint the schema refused.
 * Both mean the entry itself is wrong and will be wrong again in an hour. The
 * text is only a fallback for errors that arrive without a code.
 *
 * (Reading the code rather than the words also fixes a real hole: "allocations
 * for expense X total 175000 but the expense is 225000" contains none of the
 * words below, so a split that did not add up used to come back as a 500 and be
 * queued for retry — the one failure the form was written to show him.)
 */
export function isEntryFault(error: { code?: string | null; message: string }): boolean {
  const code = error.code ?? "";
  if (code === "P0001" || code.startsWith("23")) return true;
  // 08xxx connection, 57014 cancelled, 53xxx out of resources: all transient.
  if (code.startsWith("08") || code.startsWith("53") || code === "57014") return false;

  return /violates|refus|check constraint|is closed|was deleted|no such cost|cannot be changed|being deleted|does not add up/i
    .test(error.message);
}
