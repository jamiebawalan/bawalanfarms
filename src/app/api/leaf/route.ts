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
const Plants = z
  .object({
    cycle_id: z.string().uuid(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    plants: z
      .array(
        z.object({
          no: z.number().int().min(1).max(50),
          cm: z.number().positive().max(300),
          // Grams, where the plant was weighed as well as measured.
          g: z.number().positive().max(20000).nullable().optional(),
        }),
      )
      .min(1)
      .max(50),
    biomass_basis: z.enum(["d_leaf", "whole_plant"]).nullable().optional(),
    note: z.string().optional(),
  })
  .superRefine((v, ctx) => {
    // Grams with no record of what was weighed become unreadable the moment
    // the person who took them stops being asked. The database refuses it too.
    if (v.plants.some((p) => p.g != null) && !v.biomass_basis) {
      ctx.addIssue({
        code: "custom",
        message: "Say whether you weighed the D-leaf or the whole plant.",
      });
    }
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
    const { cycle_id, date, plants, note, biomass_basis } = measured.data;

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
        {
          cycle_id, date, avg_length_cm: average, sample_size: plants.length, note,
          // The averages are recomputed by a trigger from the rows below; the
          // basis is the one thing here the rows cannot work out for themselves.
          biomass_basis: plants.some((p) => p.g != null) ? biomass_basis : null,
          // Cleared, not left alone. Re-measuring the same morning without the
          // scale would otherwise leave yesterday's average weight on a row
          // that no longer says what was weighed, which the database refuses —
          // the trigger below puts the right figure back a statement later.
          avg_weight_grams: null,
        },
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
      plants.map((p) => ({
        measurement_id: header.id,
        plant_no: p.no,
        length_cm: p.cm,
        weight_grams: p.g ?? null,
      })),
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
