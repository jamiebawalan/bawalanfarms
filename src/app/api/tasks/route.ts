import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const Create = z.object({
  id: z.string().uuid(),
  plot_id: z.string().uuid().nullable().optional(),
  cycle_id: z.string().uuid().nullable().optional(),
  title: z.string().min(3, "Say what needs doing."),
  activity: z.string().nullable().optional(),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  is_critical: z.boolean().default(false),
  note: z.string().optional(),
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
  const { error } = await supabase.from("tasks").insert(parsed.data);
  // A replayed queued write hits the primary key; that is success, not failure.
  if (error && !/duplicate key value/.test(error.message)) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ id: parsed.data.id });
}

const Patch = z.object({
  id: z.string().uuid(),
  done: z.boolean().optional(),
  is_critical: z.boolean().optional(),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export async function PATCH(request: Request) {
  const parsed = Patch.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  const { id, done, ...rest } = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase
    .from("tasks")
    .update({
      ...rest,
      ...(done === undefined ? {} : { done_at: done ? new Date().toISOString() : null }),
    })
    .eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  if (id === null) return NextResponse.json({ error: "No task named" }, { status: 400 });
  const supabase = await createClient();
  const { error } = await supabase.from("tasks").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
