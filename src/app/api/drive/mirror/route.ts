import { NextResponse } from "next/server";
import { loadLedger } from "@/lib/db/ledger";
import { mirrorToDrive, supabaseMemory } from "@/lib/drive/mirror";
import { createAdminClient, createClient } from "@/lib/supabase/server";

export const maxDuration = 300;

/**
 * Writes the farm into Drive. One way, like the Sheets mirror: this never
 * reads Drive back into the ledger.
 */
export async function POST(request: Request) {
  const denied = await authorise(request);
  if (denied !== null) return denied;
  return run();
}

/** Vercel Cron issues a GET, so the schedule and the button share one path. */
export async function GET(request: Request) {
  const denied = await authorise(request);
  if (denied !== null) return denied;
  return run();
}

async function run() {
  const admin = createAdminClient();
  const { data: auth } = await admin
    .from("google_auth")
    .select("refresh_token, root_folder_id")
    .maybeSingle();

  if (!auth?.refresh_token) {
    return NextResponse.json(
      { error: "Google Drive is not connected yet. Connect it from Settings." },
      { status: 400 },
    );
  }

  try {
    const ledger = await loadLedger();
    const result = await mirrorToDrive(
      ledger, auth.refresh_token, supabaseMemory(admin), auth.root_folder_id ?? null,
    );
    await admin.from("google_auth").update({
      root_folder_id: result.rootFolderId,
      last_mirror_at: new Date().toISOString(),
      last_error: null,
    }).eq("id", true);

    return NextResponse.json({
      ok: true,
      folder: `https://drive.google.com/drive/folders/${result.rootFolderId}`,
      plots: result.plots,
      cycles: result.cycles,
    });
  } catch (cause) {
    const message = (cause as Error).message;
    await admin.from("google_auth").update({ last_error: message }).eq("id", true);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

async function authorise(request: Request): Promise<NextResponse | null> {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") === `Bearer ${secret}`) return null;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  return null;
}
