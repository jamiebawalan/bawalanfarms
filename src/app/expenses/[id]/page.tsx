import { notFound } from "next/navigation";
import { Page } from "@/components/ui";
import {
  ExpenseForm, type ExistingExpense, type FormPlot,
} from "@/components/expense-form";
import { loadLedger } from "@/lib/db/ledger";
import { areaOn } from "@/lib/domain/plots";
import { todayISO } from "@/lib/domain/dates";
import { plotIsOccupiedOn } from "@/lib/domain/allocation";

export const dynamic = "force-dynamic";

/**
 * Correcting a cost.
 *
 * The same form as logging one, opened on what was saved. He got it wrong in
 * the field, in a hurry, on a phone — tapped 24 instead of 2, typed 4,500 for
 * 450 — and until now the only fix was to ask an owner to open the database.
 * Which means, in practice, that the wrong figure stayed.
 */
export default async function CorrectExpensePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ledger = await loadLedger();
  const today = todayISO();

  // loadLedger returns only live costs, so a deleted entry is a 404 here — the
  // same answer the rest of the app gives about it.
  const expense = ledger.expenses.find((e) => e.id === id);
  if (!expense) notFound();

  const asset = expense.capitalAssetId
    ? ledger.capitalAssets.find((a) => a.id === expense.capitalAssetId) ?? null
    : null;

  const existing: ExistingExpense = {
    id: expense.id,
    date: expense.date,
    category: expense.category,
    activity: expense.activity,
    activityOtherNote: expense.activityOtherNote ?? null,
    attribution: expense.attribution,
    farmWideReason: expense.farmWideReason,
    labourMode: expense.labourMode,
    unitPriceCentavos: expense.unitPriceCentavos,
    quantity: expense.quantity,
    amountCentavos: expense.amountCentavos,
    paidTo: expense.paidTo ?? null,
    note: expense.note ?? null,
    allocations: ledger.allocations
      .filter((a) => a.expenseId === expense.id)
      .map((a) => ({ plotId: a.plotId, amountCentavos: a.amountCentavos })),
    capitalAsset: asset
      ? { name: asset.name, usefulLifeMonths: asset.usefulLifeMonths }
      : null,
    revisedAt: expense.revisedAt ?? null,
  };

  // The plot chips carry the cycle live today, which is what a correction saved
  // today will attach to. The one exception is a plot this cost already sits
  // on: it stays selectable even if the plot has since gone idle, or he could
  // not re-save the entry he came here to fix.
  const onThisCost = new Set(existing.allocations.map((a) => a.plotId));
  const plots: FormPlot[] = ledger.plots
    .filter((p) => p.active || onThisCost.has(p.id))
    .map((p) => {
      const cycle = ledger.cycles.find(
        (c) => c.plotId === p.id && plotIsOccupiedOn(c, today),
      );
      return {
        id: p.id,
        code: p.code,
        label: p.label,
        areaSqm: areaOn(ledger.plotAreas, p.id, today),
        openCycle: cycle ? { id: cycle.id, crop: cycle.crop } : null,
      };
    });

  return (
    <Page title="Correct a cost">
      <ExpenseForm
        plots={plots}
        activities={ledger.activities}
        // Correcting means every activity is already on screen as the chosen
        // one; the shortlist is for speed when entering, not when fixing.
        recentActivities={ledger.activities.map((a) => a.code)}
        existing={existing}
      />
    </Page>
  );
}
