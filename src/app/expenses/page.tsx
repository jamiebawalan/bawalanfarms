import Link from "next/link";
import { Card, Empty, Money, Page } from "@/components/ui";
import { loadLedger } from "@/lib/db/ledger";
import { formatDate } from "@/lib/domain/dates";
import { FARM_WIDE_REASONS } from "@/lib/domain/types";

export const dynamic = "force-dynamic";

export default async function ExpensesPage() {
  const ledger = await loadLedger();
  const activityLabel = new Map(ledger.activities.map((a) => [a.code, a.label]));
  const plotByCode = new Map(ledger.plots.map((p) => [p.id, p.code]));

  const byDate = new Map<string, typeof ledger.expenses>();
  for (const e of [...ledger.expenses].sort((a, b) => b.date.localeCompare(a.date))) {
    (byDate.get(e.date) ?? byDate.set(e.date, []).get(e.date)!).push(e);
  }

  return (
    <Page
      title="Costs"
      subtitle={`${ledger.expenses.length} entries`}
      action={
        <Link
          href="/expenses/new"
          className="text-sm font-semibold text-brand underline underline-offset-4"
        >
          Log one
        </Link>
      }
    >
      {byDate.size === 0 ? (
        <Card><Empty>Nothing logged yet.</Empty></Card>
      ) : (
        [...byDate.entries()].slice(0, 40).map(([date, entries]) => (
          <Card key={date} title={formatDate(date)}>
            <ul className="divide-y-2 divide-line">
              {entries.map((e) => {
                const plots = ledger.allocations
                  .filter((a) => a.expenseId === e.id)
                  .map((a) => plotByCode.get(a.plotId) ?? "?");
                return (
                  <li key={e.id} className="flex items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <div className="truncate font-semibold">
                        {activityLabel.get(e.activity) ?? e.activity}
                        {e.activityOtherNote ? ` — ${e.activityOtherNote}` : ""}
                      </div>
                      <div className="text-sm text-ink-soft">
                        {e.category}
                        {" · "}
                        {e.attribution === "farm_wide"
                          ? `Whole farm (${FARM_WIDE_REASONS[e.farmWideReason!]?.split(" — ")[0] ?? ""})`
                          : e.attribution === "capital"
                            ? "Equipment"
                            : `Plot ${plots.join(", ")}`}
                      </div>
                    </div>
                    <Money centavos={e.amountCentavos} />
                  </li>
                );
              })}
            </ul>
          </Card>
        ))
      )}
    </Page>
  );
}
