import { NextResponse } from "next/server";
import { Drive } from "@/lib/drive/drive";
import { cycleFolderFor, supabaseMemory } from "@/lib/drive/mirror";
import { loadLedger } from "@/lib/db/ledger";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { todayISO } from "@/lib/domain/dates";

export const maxDuration = 60;

/** Phone photos are megabytes; the browser shrinks them first, and this is the
 *  ceiling after that. Comfortably under what a serverless request will carry. */
const MAX_BYTES = 4_000_000;

/**
 * A photo of a plot, filed in that cycle's Drive folder.
 *
 * It goes to Drive rather than into the database because a season of field
 * photos is gigabytes, and because a photo in a folder the owners can open on
 * their phones is worth more than one locked inside an app.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const form = await request.formData().catch(() => null);
  const file = form?.get("photo");
  const cycleId = String(form?.get("cycle_id") ?? "");
  const takenOn = String(form?.get("taken_on") ?? todayISO());
  const caption = String(form?.get("caption") ?? "").trim();

  if (!(file instanceof File) || cycleId === "") {
    return NextResponse.json({ error: "No photo was sent." }, { status: 400 });
  }
  if (!file.type.startsWith("image/")) {
    return NextResponse.json({ error: "That file is not a picture." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "That picture is too big even after shrinking. Try another." },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const { data: auth } = await admin
    .from("google_auth").select("refresh_token, root_folder_id").maybeSingle();
  if (!auth?.refresh_token || !auth.root_folder_id) {
    return NextResponse.json(
      { error: "Google Drive is not connected yet. Connect it from Settings." },
      { status: 400 },
    );
  }

  try {
    const ledger = await loadLedger();
    const memory = supabaseMemory(admin);
    const drive = await Drive.open(auth.refresh_token, memory);
    const folder = await cycleFolderFor(drive, ledger, cycleId, auth.root_folder_id);
    if (folder === null) {
      return NextResponse.json({ error: "No such cycle." }, { status: 404 });
    }

    // Named by the day it was taken and a short id, so the folder sorts by date
    // and two photos on one morning cannot collide.
    const stamp = Math.random().toString(36).slice(2, 7);
    const name = `${takenOn} ${caption || "plot"} ${stamp}.jpg`.replace(/[\\/]/g, "-");
    const bytes = Buffer.from(await file.arrayBuffer());
    const driveId = await drive.upload(
      "photo", `${cycleId}:${stamp}`, name, folder, file.type, bytes,
    );

    const { data: row, error } = await admin
      .from("plot_photos")
      .insert({
        cycle_id: cycleId,
        taken_on: takenOn,
        drive_file_id: driveId,
        caption: caption || null,
        bytes: bytes.length,
        created_by: user.email,
      })
      .select("id")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json({ ok: true, id: row.id });
  } catch (cause) {
    return NextResponse.json({ error: (cause as Error).message }, { status: 502 });
  }
}
