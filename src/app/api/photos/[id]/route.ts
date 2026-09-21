import { NextResponse } from "next/server";
import { accessTokenFrom } from "@/lib/drive/oauth";
import { Drive } from "@/lib/drive/drive";
import { supabaseMemory } from "@/lib/drive/mirror";
import { createAdminClient, createClient } from "@/lib/supabase/server";

/**
 * Hands back a photo that lives in the owners' Drive.
 *
 * Drive files are private, and rightly so — nothing here is public. The app
 * fetches the bytes with the farm's own permission and passes them through, so
 * a signed-in person sees the picture and nobody else can reach it by guessing
 * a URL.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { id } = await params;
  const admin = createAdminClient();
  const { data: photo } = await admin
    .from("plot_photos").select("drive_file_id").eq("id", id).maybeSingle();
  if (!photo) return NextResponse.json({ error: "No such photo." }, { status: 404 });

  const { data: auth } = await admin
    .from("google_auth").select("refresh_token").maybeSingle();
  if (!auth?.refresh_token) {
    return NextResponse.json({ error: "Drive is not connected." }, { status: 400 });
  }

  try {
    const token = await accessTokenFrom(auth.refresh_token);
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${photo.drive_file_id}?alt=media`,
      { headers: { authorization: `Bearer ${token}` } },
    );
    if (!res.ok) {
      return NextResponse.json({ error: "Could not fetch that photo." }, { status: 502 });
    }
    return new NextResponse(res.body, {
      headers: {
        "content-type": res.headers.get("content-type") ?? "image/jpeg",
        // Private, because the farm's photos are not for a shared cache, but
        // worth holding in this browser: the gallery re-fetches on every visit.
        "cache-control": "private, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ error: "Could not fetch that photo." }, { status: 502 });
  }
}

/**
 * Removing a photo.
 *
 * He takes these one-handed, in the field, with the phone at arm's length over
 * a pineapple. A good few will be of his boots. Leaving them there makes the
 * gallery worse at the one job it has — showing how the plot changed — so he
 * needs to be able to take one back out.
 *
 * The file goes to the bin in the owners' Drive rather than being destroyed,
 * and the record goes only once Drive has agreed. If that order were reversed,
 * a failure would leave a photo in Drive that the app had forgotten about, and
 * nothing in the app could ever reach it again.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { id } = await params;
  const admin = createAdminClient();
  const { data: photo } = await admin
    .from("plot_photos").select("id, drive_file_id").eq("id", id).maybeSingle();
  if (!photo) return NextResponse.json({ error: "No such photo." }, { status: 404 });

  const { data: auth } = await admin
    .from("google_auth").select("refresh_token").maybeSingle();
  if (!auth?.refresh_token) {
    return NextResponse.json(
      { error: "Google Drive is not connected, so the picture cannot be removed." },
      { status: 400 },
    );
  }

  try {
    const drive = await Drive.open(auth.refresh_token, supabaseMemory(admin));
    await drive.trash(photo.drive_file_id);
  } catch (cause) {
    return NextResponse.json(
      { error: `Could not remove it from Drive, so it is still there: ${(cause as Error).message}` },
      { status: 502 },
    );
  }

  // The remembered Drive id, dropped by file rather than by name: the upload
  // keyed it on a random stamp that was never written down anywhere else.
  await admin.from("drive_files").delete().eq("file_id", photo.drive_file_id);

  const { error } = await admin.from("plot_photos").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}
