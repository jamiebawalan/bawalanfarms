import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

/**
 * A D-leaf reading: ten plants picked at random, their D-leaf measured, the
 * average recorded. Two readings give a growth rate, and the rate is what says
 * when the plants are big enough to force.
 */
const Payload = z.object({
  cycle_id: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  avg_length_cm: z.number().positive().max(300),
  sample_size: z.number().int().positive().max(500).optional(),
  note: z.string().optional(),
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
  // Measuring the same cycle twice on one day is a correction, not a second
  // observation, so the later figure wins for that date.
  const { error } = await supabase
    .from("leaf_measurements")
    .upsert(parsed.data, { onConflict: "cycle_id,date" });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
