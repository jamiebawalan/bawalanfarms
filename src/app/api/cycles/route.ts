import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const Create = z.object({
  id: z.string().uuid().optional(),
  plot_id: z.string().uuid(),
  crop: z.string().min(1),
  status: z.enum(["planned", "land_prep", "planted", "growing", "harvesting"]),
  date_started: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  date_planted: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  planting_material_source: z.string().optional(),
  kasama_share_pct: z.number().min(0).max(100).nullable().optional(),
  notes: z.string().optional(),
});

export async function POST(request: Request) {
  const parsed = Create.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues.map((i) => i.message).join(" ") },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("crop_cycles")
    .insert(parsed.data)
    .select("id")
    .single();

  if (error) {
    // The one-live-cycle-per-plot index is the rule this app exists to keep,
    // so it gets an explanation rather than a raw index name.
    if (/one_active_cycle_per_plot/.test(error.message)) {
      return NextResponse.json(
        { error: "That plot already has a cycle running. Close it first." },
        { status: 400 },
      );
    }
    if (/one_planned_cycle_per_plot/.test(error.message)) {
      return NextResponse.json(
        { error: "That plot already has a cycle planned." },
        { status: 400 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ id: data.id });
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

const Patch = z.object({
  id: z.string().uuid(),
  action: z.enum(["close", "reopen", "update"]),
  date_closed: z.string().regex(ISO).optional(),
  status: z.enum(["planned", "land_prep", "planted", "growing", "harvesting"]).optional(),
  // The cycle start is when land prep began, and it is frequently corrected
  // after the fact — the date is remembered later than it is entered.
  date_started: z.string().regex(ISO).nullable().optional(),
  date_planted: z.string().regex(ISO).nullable().optional(),
  kasama_share_pct: z.number().min(0).max(100).nullable().optional(),
  notes: z.string().optional(),
});

export async function PATCH(request: Request) {
  const parsed = Patch.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  const supabase = await createClient();
  const { id, action, ...rest } = parsed.data;

  if (action === "close") {
    const { error } = await supabase.rpc("close_cycle", {
      p_cycle_id: id,
      p_date: rest.date_closed ?? null,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  if (action === "reopen") {
    const { error } = await supabase.rpc("reopen_cycle", { p_cycle_id: id });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  // Moving a start date changes which cycle a past cost belongs to, so only
  // the fields actually supplied are written — an absent field is left alone
  // rather than blanked.
  const patch = Object.fromEntries(
    Object.entries(rest).filter(([, v]) => v !== undefined),
  );
  const { error } = await supabase.from("crop_cycles").update(patch).eq("id", id);
  if (error) {
    if (/planted_after_started|closed_after_planted/.test(error.message)) {
      return NextResponse.json(
        { error: "Those dates are out of order — land prep, then planting, then close." },
        { status: 400 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
