import { NextResponse } from "next/server";
import { accessTokenFrom } from "@/lib/drive/oauth";
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
