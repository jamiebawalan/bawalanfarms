import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const Payload = z.object({
  cycle_id: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  count: z.number().int().nonnegative(),
  note: z.string().optional(),
});

export async function POST(request: Request) {
  const parsed = Payload.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  const supabase = await createClient();
  // Counts are never overwritten, but recording the same day twice is a slip,
  // not new information, so the later figure wins for that date.
  const { error } = await supabase
    .from("plant_count_observations")
    .upsert(parsed.data, { onConflict: "cycle_id,date" });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
