import { NextResponse } from "next/server";
import { z } from "zod";
import { cycleBriefing } from "@/lib/domain/briefing";
import { formatDate, todayISO } from "@/lib/domain/dates";
import { loadLedger } from "@/lib/db/ledger";
import { suggestActions, type Photo } from "@/lib/advice/suggest";
import { accessTokenFrom } from "@/lib/drive/oauth";
import { createAdminClient } from "@/lib/supabase/server";

/**
 * Ask Claude what to do on a plot.
 *
 * Nothing is written. The answer goes back to the phone as a list; only when
 * the manager taps one does it become a task, through the ordinary task route.
 */

export const dynamic = "force-dynamic";
// Adaptive thinking on a full briefing takes longer than a default invocation
// is allowed to run.
export const maxDuration = 60;

const Payload = z.object({ cycle_id: z.string().uuid() });

export async function POST(request: Request) {
  const parsed = Payload.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "No plot named." }, { status: 400 });
  }

  const ledger = await loadLedger();
  const today = todayISO();
  const briefing = cycleBriefing(ledger, parsed.data.cycle_id, today);
  if (briefing === null) {
    return NextResponse.json({ error: "No such cycle." }, { status: 404 });
  }
  if (!briefing.isUseful) {
    return NextResponse.json(
      {
        error:
          "There is nothing recorded on this plot yet — log a D-leaf reading or some work first.",
      },
      { status: 400 },
    );
  }

  const result = await suggestActions(briefing.text, today, await recentPhotos(parsed.data.cycle_id));
  if (!result.ok) {
    // Not the manager's fault and not his problem to debug: 502 so the phone
    // shows the message rather than treating it as a bad entry.
    return NextResponse.json({ error: result.error }, { status: 502 });
  }

  return NextResponse.json({
    suggestions: result.suggestions,
    note: result.note,
    briefing: briefing.text,
  });
}

/**
 * The last few photos of this plot, for Claude to look at.
 *
 * Three, newest first. More would cost tokens for diminishing returns — what
 * matters is how the plot looks now and whether it has changed, and the third
 * photo back answers that as well as the tenth would.
 *
 * A photo that will not fetch is skipped rather than failing the request: the
 * D-leaf and cost half of the advice is still worth having.
 */
async function recentPhotos(cycleId: string): Promise<Photo[]> {
  try {
    const admin = createAdminClient();
    const { data: rows } = await admin
      .from("plot_photos")
      .select("drive_file_id, taken_on")
      .eq("cycle_id", cycleId)
      .order("taken_on", { ascending: false })
      .limit(3);
    if (!rows || rows.length === 0) return [];

    const { data: auth } = await admin
      .from("google_auth").select("refresh_token").maybeSingle();
    if (!auth?.refresh_token) return [];
    const token = await accessTokenFrom(auth.refresh_token);

    const photos: Photo[] = [];
    for (const row of rows as { drive_file_id: string; taken_on: string }[]) {
      const res = await fetch(
        `https://www.googleapis.com/drive/v3/files/${row.drive_file_id}?alt=media`,
        { headers: { authorization: `Bearer ${token}` } },
      );
      if (!res.ok) continue;
      const bytes = Buffer.from(await res.arrayBuffer());
      const mediaType = res.headers.get("content-type") ?? "image/jpeg";
      if (!/^image\/(png|jpeg|gif|webp)$/.test(mediaType)) continue;
      photos.push({
        mediaType,
        base64: bytes.toString("base64"),
        takenOn: formatDate(row.taken_on),
      });
    }
    return photos;
  } catch {
    return [];
  }
}
