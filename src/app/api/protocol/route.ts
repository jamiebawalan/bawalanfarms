import { NextResponse } from "next/server";
import { z } from "zod";
import {
  plantedOnForMap, supersededBy, type Activity, type Basis,
} from "@/lib/domain/protocol";
import { todayISO } from "@/lib/domain/dates";
import { createAdminClient, createClient } from "@/lib/supabase/server";

/**
 * Answering a suggestion.
 *
 * The first answer is a plan, not a completion. Nothing on this farm happens
 * the moment it is agreed: the material has to be bought, the crew booked,
 * the weather watched. So the suggestion asks when he will do it, and the
 * answer is a date — which is also the only thing a calendar can be built
 * out of.
 *
 * Then: "did it" closes a plan. "Already did it" is work done before the app
 * knew about the protocol, which is how months of unrecorded history get
 * reconciled without a data-entry chore. "Not this one" is a decision not to
 * do it, which is information — a plot that skipped three phosphonate rounds
 * explains itself later.
 */
const Answer = z.object({
  cycle_id: z.string().uuid(),
  sub_plot_id: z.string().uuid().nullable().optional(),
  activity_code: z.string().min(1).max(60),
  /** scheduled = he will do it, by due_on. done = carried out. skipped = not. */
  state: z.enum(["scheduled", "done", "skipped"]),
  due_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  done_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  skip_reason: z
    .enum(["already_done", "not_needed", "no_material", "too_late"])
    .nullable()
    .optional(),
  note: z.string().max(400).nullable().optional(),
  plants: z.number().int().nonnegative().nullable().optional(),
});

export async function POST(request: Request) {
  const parsed = Answer.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "That answer did not make sense." }, { status: 400 });
  }
  const answer = parsed.data;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user === null) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  /*
   * "Already did it" is a skip in the data and a completion in meaning. It is
   * recorded as skipped with that reason rather than as done, because the farm
   * did not do it *through the app* and nothing was drawn from inventory for
   * it. Reporting it as done would conjure materials the farm never issued.
   */
  /*
   * Keep the date he promised when he now reports it done. The upsert
   * replaces the whole row, so without this the plan date is lost the
   * moment the work lands — and "three weeks later than he said" is
   * exactly the figure worth having at the end of a cycle.
   */
  let dueOn = answer.due_on ?? null;
  if (dueOn === null && answer.state !== "scheduled") {
    const base = supabase
      .from("protocol_plan")
      .select("due_on")
      .eq("cycle_id", answer.cycle_id)
      .eq("activity_code", answer.activity_code);
    // `is` is for null only; a real id needs `eq`.
    const existing = await (answer.sub_plot_id == null
      ? base.is("sub_plot_id", null)
      : base.eq("sub_plot_id", answer.sub_plot_id)
    ).maybeSingle();
    dueOn = (existing.data?.due_on as string | null) ?? null;
  }

  const row = {
    cycle_id: answer.cycle_id,
    sub_plot_id: answer.sub_plot_id ?? null,
    activity_code: answer.activity_code,
    state: answer.state,
    /*
     * The date he committed to is kept when the work is done, not cleared.
     * How late the farm runs against its own plan is the thing worth knowing
     * at the end of a cycle, and overwriting the promise with the delivery
     * would throw it away.
     */
    due_on: dueOn,
    done_on: answer.state === "done" ? (answer.done_on ?? todayISO()) : null,
    skip_reason: answer.state === "skipped" ? (answer.skip_reason ?? "not_needed") : null,
    note: answer.note ?? null,
    plants: answer.plants ?? null,
    created_by: user.email,
  };

  const { error } = await supabase
    .from("protocol_plan")
    .upsert(row, { onConflict: "cycle_id,sub_plot_id,activity_code" });
  if (error !== null) {
    return NextResponse.json({ error: humanise(error.message) }, { status: 400 });
  }

  const closed = await closeEarlierRounds(answer);
  return NextResponse.json({ ok: true, superseded: closed });
}

/**
 * Earlier rounds of the same programme, written down as overtaken.
 *
 * Recorded rather than deleted, and recorded rather than left pending. The
 * farm's record should say the plant missed the month-4 foliar; it is just
 * that nobody is going to be asked to do it now. Only the same series is
 * touched — feeding the plants says nothing about whether the ants were
 * baited or the drainage dug.
 *
 * Done with the service-role client because this is bookkeeping the app owes
 * the farm, not an edit the user asked for, and it must not half-succeed
 * because of a policy on a row he never saw.
 */
async function closeEarlierRounds(answer: {
  cycle_id: string;
  sub_plot_id?: string | null;
  activity_code: string;
}): Promise<string[]> {
  const admin = createAdminClient();

  const [{ data: activityRows }, { data: planRows }] = await Promise.all([
    admin.from("protocol_activities").select("*"),
    admin
      .from("protocol_plan")
      .select("activity_code")
      .eq("cycle_id", answer.cycle_id),
  ]);
  if (activityRows === null) return [];

  const activities: Activity[] = activityRows.map((a: Record<string, unknown>) => ({
    code: String(a.code),
    mapMonth: Number(a.map_month),
    category: String(a.category),
    title: String(a.title),
    instruction: String(a.instruction),
    basis: a.basis as Basis,
    series: (a.series as string | null) ?? null,
    choiceGroup: (a.choice_group as string | null) ?? null,
    isDefault: Boolean(a.is_default),
    condition: (a.condition as string | null) ?? null,
    sortOrder: Number(a.sort_order),
  }));

  const accepted = activities.find((a) => a.code === answer.activity_code);
  if (accepted === undefined) return [];

  const answered = new Set<string>(
    (planRows ?? []).map((p: Record<string, unknown>) => String(p.activity_code)),
  );
  const closing = supersededBy(accepted, activities, answered);
  if (closing.length === 0) return [];

  const { error } = await admin.from("protocol_plan").upsert(
    closing.map((a) => ({
      cycle_id: answer.cycle_id,
      sub_plot_id: answer.sub_plot_id ?? null,
      activity_code: a.code,
      state: "skipped" as const,
      skip_reason: "superseded" as const,
      note: `Overtaken by ${accepted.title} (month ${accepted.mapMonth}).`,
    })),
    { onConflict: "cycle_id,sub_plot_id,activity_code" },
  );
  if (error !== null) return [];

  return closing.map((a) => a.code);
}

/**
 * Undoing an answer.
 *
 * The rounds it superseded come back with it, because they were only closed
 * by this answer existing. Leaving them closed would make an undo lose work
 * silently, which is the one thing an undo must not do.
 *
 * Only its own programme is revived. Undoing the month-5 foliar must not also
 * reopen an ant-bait round that some other answer closed — that would hand
 * back work nobody asked about and the list would grow on an undo.
 */
export async function DELETE(request: Request) {
  const url = new URL(request.url);
  const cycleId = url.searchParams.get("cycle_id");
  const activityCode = url.searchParams.get("activity_code");
  const subPlotId = url.searchParams.get("sub_plot_id");
  if (cycleId === null || activityCode === null) {
    return NextResponse.json({ error: "Nothing named to undo." }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user === null) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const admin = createAdminClient();

  const { data: activityRows } = await admin
    .from("protocol_activities")
    .select("code, series");
  const undone = (activityRows ?? []).find(
    (a: Record<string, unknown>) => String(a.code) === activityCode,
  );
  const series =
    undone === undefined ? null : ((undone.series as string | null) ?? null);

  /* The codes whose superseded rows this answer could have written. */
  const siblings =
    series === null
      ? []
      : (activityRows ?? [])
          .filter((a: Record<string, unknown>) => (a.series as string | null) === series)
          .map((a: Record<string, unknown>) => String(a.code))
          .filter((code: string) => code !== activityCode);

  let remove = admin
    .from("protocol_plan")
    .delete()
    .eq("cycle_id", cycleId)
    /*
     * The answer itself, plus the siblings it had overtaken. A sibling the
     * farm answered for itself is left alone: only rows this answer wrote,
     * which are exactly the superseded ones, come back.
     */
    .or(
      `activity_code.eq.${activityCode},` +
        `and(skip_reason.eq.superseded,activity_code.in.(${siblings.join(",") || "none"}))`,
    );
  remove = subPlotId === null
    ? remove.is("sub_plot_id", null)
    : remove.eq("sub_plot_id", subPlotId);
  const { error } = await remove;
  if (error !== null) {
    return NextResponse.json({ error: humanise(error.message) }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}

/**
 * Setting where a plot or block sits on the protocol.
 *
 * He enters the stage he can see — "this is at month five" — and the app
 * stores the date that stage implies, which then advances by itself. A
 * stored number would be wrong four weeks later and would mean re-entering
 * a stage for every block on the farm every month, for ever.
 *
 * MAP is not calendar age. A plot planted last December can be at month 8,
 * so this is never derived from the planting date.
 */
const Stage = z.object({
  cycle_id: z.string().uuid(),
  sub_plot_id: z.string().uuid().nullable().optional(),
  /** Null clears it, which puts the plot back to asking. */
  map_month: z.number().min(-6).max(24).nullable(),
});

export async function PATCH(request: Request) {
  const parsed = Stage.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Give a growth stage between -6 and 24 months." },
      { status: 400 },
    );
  }
  const { cycle_id, sub_plot_id, map_month } = parsed.data;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user === null) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const effective = map_month === null ? null : plantedOnForMap(map_month);

  const { data, error } =
    sub_plot_id == null
      ? await supabase
          .from("crop_cycles")
          .update({ effective_planted_on: effective })
          .eq("id", cycle_id)
          .select("id")
      : await supabase
          .from("sub_plots")
          .update({ effective_planted_on: effective })
          .eq("id", sub_plot_id)
          .select("id");

  if (error !== null) {
    return NextResponse.json({ error: humanise(error.message) }, { status: 400 });
  }
  if (data === null || data.length === 0) {
    return NextResponse.json({ error: "That plot is not there any more." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}

/** Postgres speaks to developers. This speaks to a farm manager. */
function humanise(message: string): string {
  if (/relation .* does not exist/.test(message)) {
    return "The protocol is not loaded on this farm yet.";
  }
  if (/violates foreign key/.test(message)) {
    return "That is not an activity the protocol knows about.";
  }
  return message;
}
