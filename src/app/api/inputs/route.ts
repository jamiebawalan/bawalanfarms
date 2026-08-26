import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

/**
 * Buying stock and drawing stock are different events, and only one of them is
 * a cost. Keeping them on one route makes that pairing obvious in the code the
 * way it is on the screen.
 */

const Purchase = z.object({
  kind: z.literal("purchase"),
  id: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  input_type: z.string().min(1),
  quantity: z.number().positive(),
  unit: z.string().min(1),
  unit_cost_centavos: z.number().int().nonnegative(),
  supplier: z.string().optional(),
  note: z.string().optional(),
});

const Draw = z.object({
  kind: z.literal("draw"),
  id: z.string().uuid(),
  purchase_id: z.string().uuid(),
  cycle_id: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  quantity: z.number().positive(),
  dose_note: z.string().optional(),
});

export async function POST(request: Request) {
  const parsed = z
    .discriminatedUnion("kind", [Purchase, Draw])
    .safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues.map((i) => i.message).join(" ") },
      { status: 400 },
    );
  }

  const supabase = await createClient();

  if (parsed.data.kind === "purchase") {
    const { kind, unit_cost_centavos, quantity, ...rest } = parsed.data;
    const { error } = await supabase.from("input_purchases").insert({
      ...rest,
      quantity,
      unit_cost_centavos,
      total_centavos: Math.round(unit_cost_centavos * quantity),
    });
    if (error && !isDuplicate(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ id: parsed.data.id });
  }

  const { kind, ...draw } = parsed.data;
  const { error } = await supabase.from("input_draws").insert(draw);
  if (error && !isDuplicate(error.message)) {
    if (/over$/.test(error.message) || /holds/.test(error.message)) {
      return NextResponse.json(
        { error: "That is more than the lot has left." },
        { status: 400 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ id: parsed.data.id });
}

/** A replayed queued write hits the primary key. That is success, not failure. */
function isDuplicate(message: string): boolean {
  return /duplicate key value/.test(message);
}
