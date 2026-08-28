import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { readSpreadsheet } from "@/lib/import/xlsx";
import { parseExpenseSheet, type PlotRef } from "@/lib/import/parse";
import { areaOn } from "@/lib/domain/plots";
import { todayISO } from "@/lib/domain/dates";

export const maxDuration = 60;

/**
 * Two phases on purpose.
 *
 * "preview" reads the file and reports exactly what would happen — how many
 * rows are good, what was assumed, and every rejection with its reason — while
 * writing nothing. "commit" runs the same parse and hands it to a single
 * transactional function.
 *
 * The owner will run this, find something wrong, fix the sheet and run it
 * again, so the whole path is built around being run more than once.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const actorEmail = user.email?.toLowerCase() ?? "";
  const { data: me } = await supabase
    .from("app_users")
    .select("role")
    .eq("email", actorEmail)
    .maybeSingle();
  if (me?.role !== "owner") {
    return NextResponse.json(
      { error: "Only an owner can run the import." },
      { status: 403 },
    );
  }

  const form = await request.formData();
  const file = form.get("file");
  const mode = form.get("mode") === "commit" ? "commit" : "preview";
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file was attached." }, { status: 400 });
  }

  const [plotsRes, activitiesRes, areasRes] = await Promise.all([
    supabase.from("plots").select("id, code, label"),
    supabase.from("activities").select("code, label"),
    supabase.from("plot_areas").select("plot_id, effective_from, area_sqm"),
  ]);
  if (plotsRes.error || activitiesRes.error || areasRes.error) {
    return NextResponse.json({ error: "Could not read the plot list." }, { status: 500 });
  }

  const today = todayISO();
  const areas = (areasRes.data ?? []).map((a) => ({
    plotId: a.plot_id,
    effectiveFrom: a.effective_from,
    areaSqm: Number(a.area_sqm),
  }));
  const plots: PlotRef[] = (plotsRes.data ?? []).map((p) => ({
    id: p.id,
    code: p.code,
    label: p.label,
    areaSqm: areaOn(areas, p.id, today),
  }));

  let sheet;
  try {
    sheet = readSpreadsheet(new Uint8Array(await file.arrayBuffer()), file.name);
  } catch (cause) {
    return NextResponse.json(
      { error: `Could not open that file: ${(cause as Error).message}` },
      { status: 400 },
    );
  }

  // Keyed on the file name so a corrected version of the same sheet replaces
  // its own rows instead of adding a second copy of them.
  const sheetTag = file.name.replace(/\.[^.]+$/, "").slice(0, 60);
  const parsed = parseExpenseSheet(sheet.rows, plots, activitiesRes.data ?? [], {
    sheetTag,
    today,
  });

  const summary = {
    sheet: sheet.name,
    sheetTag,
    totalRows: Math.max(0, sheet.rows.length - 1),
    accepted: parsed.expenses.length,
    rejected: parsed.rejections.length,
    acceptedTotalCentavos: parsed.expenses.reduce((a, e) => a + e.amountCentavos, 0),
    rejectedRows: parsed.rejections,
    warnings: Object.entries(parsed.warningCounts)
      .map(([message, count]) => ({ message, count }))
      .sort((a, b) => b.count - a.count),
    unusedColumns: parsed.unusedColumns,
    sample: parsed.expenses.slice(0, 5).map((e) => ({
      rowNumber: e.rowNumber,
      date: e.date,
      activity: e.activity,
      category: e.category,
      attribution: e.attribution,
      amountCentavos: e.amountCentavos,
      plotCount: e.allocations.length,
    })),
  };

  if (mode === "preview") {
    return NextResponse.json({ mode, ...summary, committed: false });
  }

  if (parsed.expenses.length === 0) {
    return NextResponse.json(
      { error: "There is nothing to import — every row was rejected." },
      { status: 400 },
    );
  }

  // The import writes onto cycles that closed years ago, which RLS and the
  // closed-cycle freeze both refuse for an ordinary session. The owner check
  // above is the gate; this is the key.
  //
  // The service role carries no user identity, so the function cannot work out
  // who is calling on its own. The email is passed in — taken from the verified
  // session above, never from the request body — and the function checks it
  // against app_users again rather than trusting it.
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("import_expenses", {
    actor_email: actorEmail,
    payload: {
      expenses: parsed.expenses.map((e) => ({
        import_key: e.importKey,
        date: e.date,
        category: e.category,
        activity: e.activity,
        activity_other_note: e.activityOtherNote ?? "",
        attribution: e.attribution,
        farm_wide_reason: e.farmWideReason ?? "",
        labour_mode: e.labourMode ?? "",
        unit_price_centavos: e.unitPriceCentavos ?? "",
        quantity: e.quantity ?? "",
        amount_centavos: e.amountCentavos,
        paid_to: e.paidTo ?? "",
        note: e.note ?? "",
        allocations: e.allocations.map((a) => ({
          plot_id: a.plotId,
          amount_centavos: a.amountCentavos,
        })),
      })),
    },
  });

  if (error) {
    return NextResponse.json(
      { error: `Nothing was imported. ${error.message}`, ...summary },
      { status: 400 },
    );
  }

  return NextResponse.json({ mode, ...summary, committed: true, result: data });
}
