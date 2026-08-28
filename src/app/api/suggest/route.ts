import { NextResponse } from "next/server";
import { z } from "zod";
import { cycleBriefing } from "@/lib/domain/briefing";
import { todayISO } from "@/lib/domain/dates";
import { loadLedger } from "@/lib/db/ledger";
import { suggestActions } from "@/lib/advice/suggest";

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

  const result = await suggestActions(briefing.text, today);
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
