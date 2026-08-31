import Link from "next/link";
import { Card, Empty, Money, Note, Page, Stat, StatGrid } from "@/components/ui";
import { loadLedger } from "@/lib/db/ledger";
import { allCyclePnL } from "@/lib/domain/pnl";
import { periodSpend } from "@/lib/domain/reports";
import { byAgeOldestFirst, cycleAgeMonths } from "@/lib/domain/age";
import { remainingStock } from "@/lib/domain/dosing";
import { formatDate, formatDateShort, presetPeriods, todayISO } from "@/lib/domain/dates";
import { formatPeso, percent } from "@/lib/domain/money";

export const dynamic = "force-dynamic";

/**
 * The landing screen answers "what is going on right now": what has been logged
 * today, which cycles are running, what stock is left, and anything that needs
 * attention. It is a status board, not a dashboard of vanity numbers.
 */
export default async function HomePage() {
  const ledger = await loadLedger();
  const cropNames = new Map(ledger.crops.map((c) => [c.code, c.label]));
  const cropLabel = (code: string) => cropNames.get(code) ?? code;
  const today = todayISO();
  const [thisMonth] = presetPeriods(today);

  const month = periodSpend(ledger, thisMonth!.from, thisMonth!.to);
  // Oldest first: the plot furthest into its cycle is the one with a decision
  // waiting on it. Banana sits at the bottom — planted years ago, and there is
  // little left to decide about it.
  const cycles = byAgeOldestFirst(
    allCyclePnL(ledger).filter((c) => !c.isClosed && c.cycle.status !== "planned"),
    (c) => c,
    today,
  );
  const plotById = new Map(ledger.plots.map((p) => [p.id, p]));

  const todayExpenses = ledger.expenses
    .filter((e) => e.date === today)
    .sort((a, b) => b.id.localeCompare(a.id));
  const todayTotal = todayExpenses.reduce((a, e) => a + e.amountCentavos, 0);
  const activityLabel = new Map(ledger.activities.map((a) => [a.code, a.label]));

  const openStock = ledger.purchases
    .map((p) => ({
      purchase: p,
      remaining: remainingStock(
        p.quantity,
        ledger.draws.filter((d) => d.purchaseId === p.id),
      ),
    }))
    .filter((s) => s.remaining > 0.001);

  return (
    <Page
      title="Today"
      subtitle={formatDate(today)}
      action={
        <Link
          href="/settings"
          aria-label="Settings"
          className="flex size-12 items-center justify-center rounded-xl border-2 border-line text-ink-soft"
        >
          <svg
            width="22" height="22" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round"
            strokeLinejoin="round" aria-hidden="true"
          >
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 8.9 19a1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 5 8.9a1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9.5a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9v.1a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
          </svg>
        </Link>
      }
    >
      <StatGrid>
        <Stat
          label="Logged today"
          value={formatPeso(todayTotal)}
          hint={`${todayExpenses.length} ${todayExpenses.length === 1 ? "entry" : "entries"}`}
        />
        <Stat label="This month" value={formatPeso(month.totalCentavos)} />
        <Stat
          label="Overhead"
          value={percent(month.farmWideCentavos, month.totalCentavos, 0)}
          hint="whole-farm share"
        />
      </StatGrid>

      <Card
        title="Today's entries"
        action={
          <Link href="/expenses" className="text-sm font-semibold text-brand underline underline-offset-4">
            All costs
          </Link>
        }
      >
        {todayExpenses.length === 0 ? (
          <Empty>Nothing logged yet today.</Empty>
        ) : (
          <ul className="divide-y-2 divide-line">
            {todayExpenses.map((e) => {
              const on = ledger.allocations
                .filter((a) => a.expenseId === e.id)
                .map((a) => plotById.get(a.plotId)?.code ?? "?");
              return (
                <li key={e.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <div className="truncate font-semibold">
                      {activityLabel.get(e.activity) ?? e.activity}
                    </div>
                    <div className="text-sm text-ink-soft">
                      {e.attribution === "farm_wide"
                        ? "Whole farm"
                        : e.attribution === "capital"
                          ? "Equipment"
                          : on.length > 0
                            ? `Plot ${on.join(", ")}`
                            : "—"}
                    </div>
                  </div>
                  <Money centavos={e.amountCentavos} />
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card
        title="Cycles running"
        action={
          <Link href="/cycles" className="text-sm font-semibold text-brand underline underline-offset-4">
            All cycles
          </Link>
        }
      >
        {cycles.length === 0 ? (
          <Empty>
            No cycles running.{" "}
            <Link href="/cycles/new" className="font-semibold text-brand underline underline-offset-4">
              Start one
            </Link>
            .
          </Empty>
        ) : (
          <ul className="divide-y-2 divide-line">
            {cycles.map((c) => (
              <li key={c.cycle.id}>
                <Link
                  href={`/cycles/${c.cycle.id}`}
                  className="flex min-h-14 items-center justify-between gap-3 py-3"
                >
                  <div className="min-w-0">
                    <div className="font-semibold">
                      {c.plot?.label} · {cropLabel(c.cycle.crop)}
                    </div>
                    <div className="text-sm text-ink-soft">
                      {(() => {
                        const months = cycleAgeMonths(c.cycle, today);
                        return months === null ? "not started" : `${months} months in`;
                      })()}
                      {" · "}
                      {c.cycle.status.replace("_", " ")}
                    </div>
                  </div>
                  <div className="text-right">
                    <Money centavos={c.grossMarginCentavos} signed />
                    <div className="text-xs text-ink-soft">
                      {formatPeso(c.totalCostCentavos)} spent
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {openStock.length > 0 ? (
        <Card
          title="Stock on hand"
          action={
            <Link href="/inputs" className="text-sm font-semibold text-brand underline underline-offset-4">
              Manage
            </Link>
          }
        >
          <ul className="divide-y-2 divide-line">
            {openStock.map(({ purchase, remaining }) => (
              <li key={purchase.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <div className="truncate font-semibold">{purchase.inputType}</div>
                  <div className="text-sm text-ink-soft">
                    bought {formatDateShort(purchase.date)}
                  </div>
                </div>
                <div className="tabular text-right font-semibold">
                  {remaining} <span className="text-ink-soft">of {purchase.quantity} {purchase.unit}</span>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </Page>
  );
}
