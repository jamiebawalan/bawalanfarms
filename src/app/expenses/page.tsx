import Link from "next/link";
import type { ComponentProps } from "react";
import { Card, Empty, Money, Page } from "@/components/ui";
import { loadLedger } from "@/lib/db/ledger";
import { formatDate } from "@/lib/domain/dates";
import { formatPeso } from "@/lib/domain/money";
import { FARM_WIDE_REASONS } from "@/lib/domain/types";

export const dynamic = "force-dynamic";

/**
 * Every cost, newest first, and every row is a way in to correcting it.
 *
 * The plot filter is here because finding the entry is most of the work of
 * fixing it. "The ₱4,500 on Plot 12 last month looks wrong" is how the owners
 * actually arrive at this screen, and scrolling six weeks of a whole farm's
 * costs to reach it is how they give up before they get there.
 */
export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{ plot?: string }>;
}) {
  const { plot: plotFilter } = await searchParams;
  const ledger = await loadLedger();
  const activityLabel = new Map(ledger.activities.map((a) => [a.code, a.label]));
  const plotByCode = new Map(ledger.plots.map((p) => [p.id, p.code]));

  const onPlot = new Map<string, Set<string>>();
  for (const a of ledger.allocations) {
    (onPlot.get(a.expenseId) ?? onPlot.set(a.expenseId, new Set()).get(a.expenseId)!)
      .add(a.plotId);
  }

  const chosen = ledger.plots.find((p) => p.id === plotFilter) ?? null;
  const shown = chosen
    ? ledger.expenses.filter((e) => onPlot.get(e.id)?.has(chosen.id))
    : ledger.expenses;

  const byDate = new Map<string, typeof ledger.expenses>();
  for (const e of [...shown].sort((a, b) => b.date.localeCompare(a.date))) {
    (byDate.get(e.date) ?? byDate.set(e.date, []).get(e.date)!).push(e);
  }

  // Filtering to one plot thins the list out, so it can reach much further back
  // without becoming a scroll. Unfiltered it stays at the recent weeks.
  const days = chosen ? 200 : 40;
  const total = shown.reduce((a, e) => a + e.amountCentavos, 0);

  // Only plots that have ever carried a cost. A filter chip that returns
  // nothing is a chip that wasted a tap.
  const plotsWithCosts = ledger.plots.filter((p) =>
    ledger.allocations.some((a) => a.plotId === p.id),
  );

  return (
    <Page
      title="Costs"
      subtitle={
        chosen
          ? `${shown.length} on ${chosen.label} — ${formatPeso(total)}`
          : `${shown.length} entries — tap one to correct it`
      }
      action={
        <Link
          href="/expenses/new"
          className="text-sm font-semibold text-brand underline underline-offset-4"
        >
          Log one
        </Link>
      }
    >
      <div className="mb-4 flex flex-wrap gap-2">
        <FilterChip href="/expenses" label="All" selected={chosen === null} />
        {plotsWithCosts.map((p) => (
          <FilterChip
            key={p.id}
            href={`/expenses?plot=${p.id}`}
            label={p.code}
            selected={chosen?.id === p.id}
          />
        ))}
      </div>

      {byDate.size === 0 ? (
        <Card>
          <Empty>
            {chosen ? `Nothing logged against ${chosen.label}.` : "Nothing logged yet."}
          </Empty>
        </Card>
      ) : (
        [...byDate.entries()].slice(0, days).map(([date, entries]) => (
          <Card key={date} title={formatDate(date)}>
            <ul className="divide-y-2 divide-line">
              {entries.map((e) => {
                const plots = ledger.allocations
                  .filter((a) => a.expenseId === e.id)
                  .map((a) => plotByCode.get(a.plotId) ?? "?");
                return (
                  <li key={e.id}>
                    {/* Every row is a way in to fixing it. The wrong figure he
                        can see and cannot touch is the one that stays wrong. */}
                    <Link
                      href={`/expenses/${e.id}`}
                      className="-mx-2 flex min-h-14 items-center justify-between gap-3 rounded-xl px-2 py-3 active:bg-paper-sunk"
                    >
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
                          {e.revisedAt ? " · corrected" : ""}
                        </div>
                      </div>
                      <Money centavos={e.amountCentavos} />
                    </Link>
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

function FilterChip({
  href, label, selected,
}: {
  href: ComponentProps<typeof Link>["href"];
  label: string;
  selected: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={selected ? "true" : undefined}
      className={
        "flex min-h-12 min-w-12 items-center justify-center rounded-xl border-2 px-3 font-semibold tabular " +
        (selected
          ? "border-brand bg-brand text-white"
          : "border-line-strong bg-paper text-ink active:bg-paper-sunk")
      }
    >
      {label}
    </Link>
  );
}
