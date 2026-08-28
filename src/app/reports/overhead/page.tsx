import { Bar, Card, Empty, Money, Note, Page, Stat, StatGrid } from "@/components/ui";
import { loadLedger } from "@/lib/db/ledger";
import { allocateFarmWide, idlePlotOverhead } from "@/lib/domain/allocation";
import { overheadWatch } from "@/lib/domain/reports";
import { formatMonth } from "@/lib/domain/dates";
import { formatPeso } from "@/lib/domain/money";
import { FARM_WIDE_REASONS, type FarmWideReason } from "@/lib/domain/types";

export const dynamic = "force-dynamic";

/**
 * The owners explicitly want the whole-farm pool kept under control, so this
 * report leads with the trend rather than the total.
 */
export default async function OverheadPage() {
  const ledger = await loadLedger();
  const watch = overheadWatch(ledger);
  const pool = allocateFarmWide(ledger);
  const idle = idlePlotOverhead(ledger);
  const idleTotal = idle.reduce((a, r) => a + r.amountCentavos, 0);

  const byReason = new Map<FarmWideReason, number>();
  for (const e of ledger.expenses) {
    if (e.attribution !== "farm_wide" || !e.farmWideReason) continue;
    byReason.set(e.farmWideReason, (byReason.get(e.farmWideReason) ?? 0) + e.amountCentavos);
  }
  const maxReason = Math.max(1, ...byReason.values());
  const maxShare = Math.max(0.01, ...watch.points.map((p) => p.share));

  return (
    <Page title="Overhead watch" subtitle="Whole-farm costs as a share of spend">
      {watch.rising ? (
        <Note tone="warn">
          The last three months average higher than the three before them. Worth a
          look at what is going into the pool.
        </Note>
      ) : null}

      <StatGrid>
        <Stat
          label="Overall share"
          value={`${(watch.overallShare * 100).toFixed(1)}%`}
        />
        <Stat label="Pool" value={formatPeso(pool.poolCentavos)} />
        <Stat
          label="Carried by idle plots"
          value={formatPeso(idleTotal)}
          hint="cost of not planting"
        />
      </StatGrid>

      <Card title="Month by month">
        {watch.points.length === 0 ? (
          <Empty>No spend recorded yet.</Empty>
        ) : (
          <ul className="space-y-3">
            {watch.points.map((p) => (
              <li key={p.month}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-semibold">{formatMonth(p.month)}</span>
                  <span className="tabular font-semibold">
                    {(p.share * 100).toFixed(0)}%
                    <span className="ml-2 font-normal text-ink-soft">
                      {formatPeso(p.poolCentavos)} of {formatPeso(p.totalCentavos)}
                    </span>
                  </span>
                </div>
                <Bar fraction={p.share / maxShare} tone={p.share > 0.25 ? "warn" : "brand"} />
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="What the idle plots cost">
        {idle.length === 0 ? (
          <Empty>Every plot was planted whenever money was spent.</Empty>
        ) : (
          <>
            <p className="mb-3 text-sm text-ink-soft">
              Overhead is shared across every plot, planted or not. This is what
              the empty ones absorbed — the price of leaving them idle.
            </p>
            <ul className="divide-y-2 divide-line">
              {idle.map((r) => (
                <li key={r.plotId} className="flex justify-between gap-3 py-2.5">
                  <span className="font-semibold">{r.plotLabel}</span>
                  <Money centavos={r.amountCentavos} />
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>

      <Card title="What is in the pool">
        {byReason.size === 0 ? (
          <Empty>Nothing has been logged as whole-farm.</Empty>
        ) : (
          <ul className="space-y-3">
            {[...byReason.entries()]
              .sort((a, b) => b[1] - a[1])
              .map(([reason, amount]) => (
                <li key={reason}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-semibold">
                      {FARM_WIDE_REASONS[reason].split(" — ")[0]}
                    </span>
                    <Money centavos={amount} />
                  </div>
                  <Bar fraction={amount / maxReason} />
                </li>
              ))}
          </ul>
        )}
      </Card>

      <Note tone="info">
        The pool is shared out by plot area across every plot that carries
        overhead, planted or not — never at the moment it was entered. An idle
        plot still costs the farm its share of the truck and the tollgates, so it
        shows up carrying cost and earning nothing. The Mango plot is excluded by
        choice.
      </Note>
    </Page>
  );
}
