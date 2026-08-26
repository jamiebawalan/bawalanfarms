import Link from "next/link";
import { Card, Empty, Money, Note, Page, Stat, StatGrid } from "@/components/ui";
import { loadLedger } from "@/lib/db/ledger";
import { allCyclePnL, unattachedCosts } from "@/lib/domain/pnl";
import { overheadWatch, periodSpend } from "@/lib/domain/reports";
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
  const today = todayISO();
  const [thisMonth] = presetPeriods(today);

  const month = periodSpend(ledger, thisMonth!.from, thisMonth!.to);
  const cycles = allCyclePnL(ledger).filter((c) => !c.isClosed && c.cycle.status !== "planned");
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

  const unattached = unattachedCosts(ledger);
  const overhead = overheadWatch(ledger);

  return (
    <Page title="Today" subtitle={formatDate(today)}>
      {unattached.length > 0 ? (
        <Note tone="warn">
          <Link href="/reports/unattached" className="underline underline-offset-4">
            {formatPeso(unattached.reduce((a, r) => a + r.amountCentavos, 0))} of costs
            sit on plots with no cycle open
          </Link>
          . They belong to a plot but reach no profit figure.
        </Note>
      ) : null}

      {overhead.rising && overhead.latestShare !== null ? (
        <Note tone="warn">
          <Link href="/reports/overhead" className="underline underline-offset-4">
            Whole-farm costs are climbing
          </Link>
          {" "}— now {(overhead.latestShare * 100).toFixed(0)}% of spend.
        </Note>
      ) : null}

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
                      {c.plot?.label} · {c.cycle.crop}
                    </div>
                    <div className="text-sm text-ink-soft">
                      {c.cycle.status.replace("_", " ")} · started{" "}
                      {formatDateShort(c.cycle.dateStarted)}
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
