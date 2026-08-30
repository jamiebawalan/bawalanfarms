import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

/**
 * A D-leaf reading: plants picked at random and measured one by one.
 *
 * The average is never sent. It is computed in the database from the rows, so
 * it cannot disagree with the numbers it came from — and the spread survives,
 * which is what says whether a block will force together.
 *
 * An average on its own is still accepted, because the older records are all
 * the farm has for those dates and refusing them would lose real history.
 */
const Plants = z.object({
  cycle_id: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  plants: z
    .array(z.object({ no: z.number().int().min(1).max(50), cm: z.number().positive().max(300) }))
    .min(1)
    .max(50),
  note: z.string().optional(),
});

const AverageOnly = z.object({
  cycle_id: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  avg_length_cm: z.number().positive().max(300),
  sample_size: z.number().int().positive().max(500).optional(),
  note: z.string().optional(),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const supabase = await createClient();

  const measured = Plants.safeParse(body);
  if (measured.success) {
    const { cycle_id, date, plants, note } = measured.data;

    // Two plants cannot share a number in one reading; that is a slip, and
    // silently keeping the last would lose a measurement someone took.
    const numbers = new Set(plants.map((p) => p.no));
    if (numbers.size !== plants.length) {
      return NextResponse.json(
        { error: "Two rows have the same plant number." },
        { status: 400 },
      );
    }

    const average =
      plants.reduce((a, p) => a + p.cm, 0) / plants.length;

    const { data: header, error: headerError } = await supabase
      .from("leaf_measurements")
      .upsert(
        { cycle_id, date, avg_length_cm: average, sample_size: plants.length, note },
        { onConflict: "cycle_id,date" },
      )
      .select("id")
      .single();
    if (headerError || !header) {
      return NextResponse.json(
        { error: headerError?.message ?? "Could not save the reading." },
        { status: 400 },
      );
    }

    // Replace rather than add: measuring the same plot twice on one day is a
    // correction, and the second set is the one that is right.
    await supabase.from("leaf_plant_readings").delete().eq("measurement_id", header.id);
    const { error } = await supabase.from("leaf_plant_readings").insert(
      plants.map((p) => ({ measurement_id: header.id, plant_no: p.no, length_cm: p.cm })),
    );
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json({ ok: true, average: Math.round(average * 100) / 100 });
  }

  const averaged = AverageOnly.safeParse(body);
  if (averaged.success) {
    const { error } = await supabase
      .from("leaf_measurements")
      .upsert(averaged.data, { onConflict: "cycle_id,date" });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json(
    { error: "Enter a measurement for at least one plant." },
    { status: 400 },
  );
}
