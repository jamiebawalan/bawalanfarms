import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const Payload = z.object({
  id: z.string().uuid(),
  cycle_id: z.string().uuid(),
  buyer_id: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  note: z.string().optional(),
  lines: z
    .array(
      z.object({
        product: z.string().min(1),
        quantity: z.number().positive(),
        // Captured per line, every time: the same grade fetched ₱70, ₱65 and
        // ₱60 inside eleven days at different markets.
        unit_price_centavos: z.number().int().nonnegative(),
        is_bulk: z.boolean().optional(),
      }),
    )
    .min(1, "Add at least one line."),
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
  const { data, error } = await supabase.rpc("save_sale", { payload: parsed.data });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ id: data });
}
