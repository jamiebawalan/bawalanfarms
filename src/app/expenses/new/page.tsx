import { Page } from "@/components/ui";
import { ExpenseForm, type FormPlot } from "@/components/expense-form";
import { loadLedger } from "@/lib/db/ledger";
import { areaOn } from "@/lib/domain/plots";
import { todayISO } from "@/lib/domain/dates";
import { cycleIsLiveOn } from "@/lib/domain/allocation";

export const dynamic = "force-dynamic";

export default async function NewExpensePage({
  searchParams,
}: {
  searchParams: Promise<{ activity?: string; plots?: string; note?: string }>;
}) {
  const params = await searchParams;
  const ledger = await loadLedger();
  const today = todayISO();

  const plots: FormPlot[] = ledger.plots
    .filter((p) => p.active)
    .map((p) => {
      const cycle = ledger.cycles.find(
        (c) => c.plotId === p.id && cycleIsLiveOn(c, today),
      );
      return {
        id: p.id,
        code: p.code,
        label: p.label,
        areaSqm: areaOn(ledger.plotAreas, p.id, today),
        openCycle: cycle ? { id: cycle.id, crop: cycle.crop } : null,
      };
    });

  // The activity chips lead with what he actually uses. A list of 48 terms is
  // a list he will scroll past; the eight he used last month, he will tap.
  const recentActivities = mostUsedActivities(ledger, 90, 10);

  return (
    <Page title="Log a cost">
      <ExpenseForm
        plots={plots}
        activities={ledger.activities}
        recentActivities={recentActivities}
        prefill={
          params.activity || params.plots
            ? {
                activity: params.activity,
                plotIds: params.plots?.split(",").filter(Boolean),
                note: params.note,
              }
            : null
        }
      />
    </Page>
  );
}

function mostUsedActivities(
  ledger: Awaited<ReturnType<typeof loadLedger>>,
  days: number,
  limit: number,
): string[] {
  const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
  const counts = new Map<string, number>();
  for (const e of ledger.expenses) {
    if (e.date < since) continue;
    counts.set(e.activity, (counts.get(e.activity) ?? 0) + 1);
  }
  const top = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([code]) => code);

  // A brand-new farm has no history to lead with, so fall back to the handful
  // of activities that dominate a normal week.
  if (top.length >= 4) return top;
  return [
    ...new Set([
      ...top,
      "deweed", "abono", "food", "harvesting", "tanim", "spray", "land_prep", "kalakal",
    ]),
  ].slice(0, limit);
}
