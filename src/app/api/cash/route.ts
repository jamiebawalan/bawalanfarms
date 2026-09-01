import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

/** Cash handed to the manager. The only side of the float anyone types. */
const Create = z.object({
  id: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amount_centavos: z.number().int().positive(),
  note: z.string().optional(),
});

export async function POST(request: Request) {
  const parsed = Create.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter an amount and a date." }, { status: 400 });
  }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase
    .from("cash_advances")
    .insert({ ...parsed.data, recorded_by: user?.email });
  // A replayed queued write hits the primary key; that is success, not failure.
  if (error && !/duplicate key value/.test(error.message)) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  if (id === null) return NextResponse.json({ error: "No advance named" }, { status: 400 });
  const supabase = await createClient();
  const { error } = await supabase.from("cash_advances").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
