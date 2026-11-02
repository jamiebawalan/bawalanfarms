import { NextResponse } from "next/server";
import { z } from "zod";
import { plantedOnForMap } from "@/lib/domain/protocol";
import { createClient } from "@/lib/supabase/server";

/**
 * Blocking out a plot.
 *
 * He does this standing in the field with the planting half done, so the
 * screen asks for the three things he actually knows: what he calls the
 * block, the day he planted it, and roughly how much of the plot it is. The
 * plant count comes later, when it has been counted.
 */
const Block = z.object({
  cycle_id: z.string().uuid(),
  name: z.string().trim().min(1).max(40),
  planted_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  land_pct: z.number().positive().max(100),
  plant_count: z.number().int().nonnegative().nullable().optional(),
  target_forcing_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  forced_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  note: z.string().max(200).optional(),

  /*
   * Where the block sits on the protocol, as the stage he can see rather
   * than the months since planting. The two are not the same thing: Plot 24
   * went in last December and is at month 8. He enters the stage once and
   * the app stores the date it implies, which then advances by itself.
   */
  map_month: z.number().min(-6).max(24).nullable().optional(),
});

/** The stage he entered, as the date the rest of the app reasons with. */
function withEffectiveDate<T extends { map_month?: number | null }>(
  fields: T,
): Omit<T, "map_month"> & { effective_planted_on?: string | null } {
  const { map_month, ...rest } = fields;
  if (map_month === undefined) return rest;
  return {
    ...rest,
    effective_planted_on: map_month === null ? null : plantedOnForMap(map_month),
  };
}

/** Postgres speaks to developers. This speaks to a farm manager. */
function humanise(message: string): string {
  if (/more than all of it/.test(message)) {
    return message.replace(/^.*add up to/, "The blocks add up to");
  }
  if (/sub_plots_cycle_id_name_key|duplicate key/.test(message)) {
    return "There is already a block with that name on this plot.";
  }
  if (/sub_plot_planting_in_range/.test(message)) {
    return "That planting date looks wrong — check the year.";
  }
  return message;
}

export async function POST(request: Request) {
  const parsed = Block.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Give the block a name, a planting date and a share of the plot." },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { error } = await supabase
    .from("sub_plots")
    .insert({ ...withEffectiveDate(parsed.data), created_by: user.email });
  if (error) return NextResponse.json({ error: humanise(error.message) }, { status: 400 });

  return NextResponse.json({ ok: true });
}

const Edit = Block.partial().omit({ cycle_id: true }).extend({
  id: z.string().uuid(),
});

export async function PATCH(request: Request) {
  const parsed = Edit.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Nothing to change." }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { id, ...fields } = parsed.data;
  const { data, error } = await supabase
    .from("sub_plots").update(withEffectiveDate(fields)).eq("id", id).select("id");
  if (error) return NextResponse.json({ error: humanise(error.message) }, { status: 400 });
  if (!data || data.length === 0) {
    return NextResponse.json({ error: "That block is not there any more." }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}

/**
 * Removing a block.
 *
 * Its costs are not removed with it. The allocation keeps its amount and
 * simply stops naming a block, which puts it back among the plot's shared
 * costs — where it was before he blocked anything out. Deleting money because
 * somebody redrew a line on the ground would be indefensible.
 */
export async function DELETE(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  if (id === null) return NextResponse.json({ error: "No block named" }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { data, error } = await supabase
    .from("sub_plots").delete().eq("id", id).select("id");
  if (error) return NextResponse.json({ error: humanise(error.message) }, { status: 400 });
  if (!data || data.length === 0) {
    return NextResponse.json({ error: "That block is not there any more." }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
