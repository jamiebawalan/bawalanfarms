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

/**
 * Taking back a handover that was recorded wrongly.
 *
 * There is no negative advance and there should not be — cash on hand is the
 * advances less the spending, so a negative "handover" would be a subtraction
 * wearing the wrong label. Removing the row that is wrong says what happened.
 */
export async function DELETE(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  if (id === null) return NextResponse.json({ error: "No advance named" }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  // Asking for the removed row back is what makes this honest. A delete that
  // matches nothing — a stale screen, a row row-level security will not show
  // this person — succeeds with no rows, and answering "done" to that would
  // leave the cash figure unchanged while the app claimed it had fixed it.
  const { data, error } = await supabase
    .from("cash_advances").delete().eq("id", id).select("id");
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!data || data.length === 0) {
    return NextResponse.json(
      { error: "That entry is not there any more — pull down to refresh." },
      { status: 404 },
    );
  }

  return NextResponse.json({ ok: true });
}
