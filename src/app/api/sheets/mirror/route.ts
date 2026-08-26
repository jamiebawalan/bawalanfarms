import { NextResponse } from "next/server";
import { loadLedger } from "@/lib/db/ledger";
import { buildTabs } from "@/lib/sheets/tabs";
import { mirrorTabs } from "@/lib/sheets/google";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 60;

/**
 * Refreshes the Google Sheets copy.
 *
 * One way, always: this writes and never reads. Reading from Sheets would put
 * free-text plots and four spellings of one activity straight back into the
 * data the app was built to clean up.
 *
 * Called on a schedule by Vercel Cron (see vercel.json) and on demand from the
 * settings page.
 */
export async function POST(request: Request) {
  const auth = await authorise(request);
  if (auth !== null) return auth;
  return refresh();
}

/** Vercel Cron issues a GET, so the schedule and the button share one path. */
export async function GET(request: Request) {
  const auth = await authorise(request);
  if (auth !== null) return auth;
  return refresh();
}

async function refresh() {
  const spreadsheetId = process.env.SHEETS_SPREADSHEET_ID;
  if (!spreadsheetId) {
    return NextResponse.json(
      { error: "SHEETS_SPREADSHEET_ID is not set, so there is nowhere to mirror to." },
      { status: 400 },
    );
  }

  try {
    const ledger = await loadLedger();
    const refreshedAt = new Date().toISOString();
    const tabs = buildTabs(ledger, refreshedAt);
    await mirrorTabs(spreadsheetId, tabs);

    return NextResponse.json({
      ok: true,
      refreshedAt,
      tabs: tabs.map((t) => ({ title: t.title, rows: t.rows.length })),
    });
  } catch (cause) {
    return NextResponse.json(
      { error: `The mirror failed: ${(cause as Error).message}` },
      { status: 500 },
    );
  }
}

/** Either the cron secret, or a signed-in user. Returns null when allowed. */
async function authorise(request: Request): Promise<NextResponse | null> {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") === `Bearer ${secret}`) {
    return null;
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  return null;
}
