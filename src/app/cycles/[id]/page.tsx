import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Bar, Card, Empty, Money, Note, Page, Stat, StatGrid,
} from "@/components/ui";
import { CycleActions } from "@/components/cycle-actions";
import { LeafTracker, PlotTasks } from "@/components/plot-actions";
import { ProfitProjection } from "@/components/profit-projection";
import { Suggestions } from "@/components/suggestions";
import { projectForcing } from "@/lib/domain/dashboards";
import { evenness, readingsFor } from "@/lib/domain/leaf";
import { loadLedger } from "@/lib/db/ledger";
import { cyclePnL } from "@/lib/domain/pnl";
import { formatPeso, formatPesoPrecise, percent } from "@/lib/domain/money";
import { describeSpan, formatDate, formatDateShort, todayISO } from "@/lib/domain/dates";

export const dynamic = "force-dynamic";

/**
 * The answer to the question the whole app exists for: for this plot and this
 * crop cycle, did we make money?
 *
 * Costs are shown in the three parts they actually come from, because "why is
 * this number so big" is the next question and a single total cannot answer it.
 */
export default async function CyclePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ledger = await loadLedger();
  const pnl = cyclePnL(ledger, id);
  if (!pnl) notFound();

  const today = todayISO();
  const { cycle } = pnl;
  const activityLabel = new Map(ledger.activities.map((a) => [a.code, a.label]));
  const productLabel = new Map(ledger.products.map((p) => [p.code, p.label]));
  const buyerName = new Map(ledger.buyers.map((b) => [b.id, b.name]));

  const harvests = ledger.harvests
    .filter((h) => h.cycleId === id)
    .sort((a, b) => b.date.localeCompare(a.date));
  const sales = ledger.sales
    .filter((s) => s.cycleId === id)
    .sort((a, b) => b.date.localeCompare(a.date));
  const draws = ledger.draws.filter((d) => d.cycleId === id);
  const counts = ledger.plantCounts
    .filter((p) => p.cycleId === id)
    .sort((a, b) => b.date.localeCompare(a.date));

  const maxCost = Math.max(1, ...pnl.costByCategory.map((c) => c.amountCentavos));
  const maxActivity = Math.max(1, ...pnl.costByActivity.map((c) => c.amountCentavos));

  const readings = readingsFor(ledger, id);
  const plotTasks = ledger.tasks.filter(
    (t) => t.cycleId === id || (t.plotId !== null && t.plotId === cycle.plotId),
  );
  const forcing = projectForcing(ledger, id);

  // Seed the projection with what the farm has actually realised per fruit.
  const soldQty = pnl.revenueByProduct.reduce((a, r) => a + r.quantity, 0);
  const realisedPerFruit =
    soldQty > 0 ? Math.round(pnl.revenueCentavos / soldQty) : null;

  return (
    <Page
      title={`${pnl.plot?.label ?? "Plot"} · ${cycle.crop}`}
      subtitle={
        cycle.dateStarted
          ? `${cycle.status.replace("_", " ")} · started ${formatDate(cycle.dateStarted)}` +
            (cycle.dateClosed
              ? ` · closed ${formatDate(cycle.dateClosed)}`
              : ` · ${describeSpan(cycle.dateStarted, today)} in`)
          : cycle.status
      }
    >
      {pnl.isClosed ? (
        <Note tone="info">
          This cycle is closed. Its profit is frozen and no new costs or sales can
          land on it.
        </Note>
      ) : null}

      <StatGrid>
        <Stat
          label="Margin"
          value={formatPeso(pnl.grossMarginCentavos)}
          tone={pnl.grossMarginCentavos >= 0 ? "up" : "down"}
          hint={pnl.marginRatio === null ? "nothing sold yet" : percent(pnl.grossMarginCentavos, pnl.revenueCentavos, 0) + " of revenue"}
        />
        <Stat label="Revenue" value={formatPeso(pnl.revenueCentavos)} />
        <Stat label="Cost" value={formatPeso(pnl.totalCostCentavos)} />
        <Stat
          label="Cost / plant"
          value={pnl.costPerPlantCentavos === null ? "—" : formatPesoPrecise(pnl.costPerPlantCentavos)}
          hint={
            pnl.plantCount === null
              ? "no plant count yet"
              : `${pnl.plantCount.toLocaleString("en-PH")} plants, ${formatDateShort(pnl.plantCountDate)}`
          }
        />
        <Stat
          label="Cost / fruit"
          value={
            pnl.costPerUnitHarvestedCentavos === null
              ? "—"
              : formatPesoPrecise(pnl.costPerUnitHarvestedCentavos)
          }
          hint={`${pnl.quantityHarvested.toLocaleString("en-PH")} harvested`}
        />
        <Stat
          label="Margin / fruit"
          value={
            pnl.marginPerUnitSoldCentavos === null
              ? "—"
              : formatPesoPrecise(pnl.marginPerUnitSoldCentavos)
          }
          tone={(pnl.marginPerUnitSoldCentavos ?? 0) >= 0 ? "up" : "down"}
          hint={`${pnl.quantitySold.toLocaleString("en-PH")} sold`}
        />
      </StatGrid>

      {pnl.quantityUnsold > 0.001 ? (
        <Note tone="warn">
          {pnl.quantityUnsold.toLocaleString("en-PH")} picked but not sold — spoilage
          or giveaway.
        </Note>
      ) : null}

      <LeafTracker
        cycleId={id}
        readings={readings.map((r) => ({
          date: r.date,
          avgLengthCm: r.avgLengthCm,
          sampleSize: r.sampleSize,
          plants: r.plants,
          shortestCm: r.shortestCm,
          tallestCm: r.tallestCm,
          spreadCm: r.spreadCm,
          evenness: evenness(r.spreadCm),
        }))}
        sampleSize={ledger.settings.dleafSampleSize}
        forcingCm={ledger.settings.dleafForcingCm}
        projected={forcing === null ? null : { date: forcing.date, cmPerDay: forcing.cmPerDay }}
        target={cycle.targetForcingDate}
        closed={pnl.isClosed}
      />

      {pnl.isClosed ? null : (
        <Suggestions cycleId={id} plotId={cycle.plotId} />
      )}

      <PlotTasks
        plotId={cycle.plotId}
        cycleId={id}
        tasks={plotTasks.map((t) => ({
          id: t.id, title: t.title, dueDate: t.dueDate,
          isCritical: t.isCritical, doneAt: t.doneAt,
        }))}
        closed={pnl.isClosed}
      />

      <Card title="Cost by category">
        {pnl.costByCategory.length === 0 ? (
          <Empty>No costs yet.</Empty>
        ) : (
          <ul className="space-y-3">
            {pnl.costByCategory.map((row) => (
              <li key={row.category}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-semibold">{row.category}</span>
                  <Money centavos={row.amountCentavos} />
                </div>
                <Bar fraction={row.amountCentavos / maxCost} />
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Cost by activity">
        {pnl.costByActivity.length === 0 ? (
          <Empty>No costs yet.</Empty>
        ) : (
          <ul className="space-y-2.5">
            {pnl.costByActivity.map((row) => (
              <li key={row.activity}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-semibold">
                    {activityLabel.get(row.activity) ?? row.activity}
                  </span>
                  <Money centavos={row.amountCentavos} />
                </div>
                <Bar fraction={row.amountCentavos / maxActivity} />
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card
        title="Sales"
        action={
          !pnl.isClosed ? (
            <Link
              href={`/sales/new?cycle=${cycle.id}`}
              className="text-sm font-semibold text-brand underline underline-offset-4"
            >
              Log a sale
            </Link>
          ) : null
        }
      >
        {pnl.revenueByProduct.length === 0 ? (
          <Empty>Nothing sold yet.</Empty>
        ) : (
          <>
            <ul className="divide-y-2 divide-line">
              {pnl.revenueByProduct.map((row) => (
                <li key={row.product} className="flex items-center justify-between gap-3 py-2.5">
                  <div>
                    <div className="font-semibold">
                      {productLabel.get(row.product) ?? row.product}
                    </div>
                    <div className="text-sm text-ink-soft tabular">
                      {row.quantity.toLocaleString("en-PH")} at{" "}
                      {row.averagePriceCentavos === null
                        ? "—"
                        : `${formatPesoPrecise(row.averagePriceCentavos)} realised`}
                    </div>
                  </div>
                  <Money centavos={row.revenueCentavos} />
                </li>
              ))}
            </ul>
            <ul className="mt-3 space-y-1 text-sm text-ink-soft">
              {sales.slice(0, 5).map((s) => (
                <li key={s.id}>
                  {formatDateShort(s.date)} · {buyerName.get(s.buyerId) ?? "—"}
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>

      <Card
        title="Harvests"
        action={
          !pnl.isClosed ? (
            <Link
              href={`/harvests/new?cycle=${cycle.id}`}
              className="text-sm font-semibold text-brand underline underline-offset-4"
            >
              Log a harvest
            </Link>
          ) : null
        }
      >
        {harvests.length === 0 ? (
          <Empty>Nothing picked yet.</Empty>
        ) : (
          <ul className="divide-y-2 divide-line">
            {harvests.map((h) => {
              const lines = ledger.harvestLines.filter((l) => l.harvestId === h.id);
              return (
                <li key={h.id} className="py-2.5">
                  <div className="font-semibold">{formatDate(h.date)}</div>
                  <div className="text-sm text-ink-soft">
                    {lines
                      .map(
                        (l) =>
                          `${l.quantity.toLocaleString("en-PH")} ${productLabel.get(l.product) ?? l.product}`,
                      )
                      .join(" · ")}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {draws.length > 0 ? (
        <Card title="Stock drawn">
          <ul className="divide-y-2 divide-line">
            {draws.map((d) => {
              const purchase = ledger.purchases.find((p) => p.id === d.purchaseId);
              return (
                <li key={d.id} className="flex justify-between gap-3 py-2">
                  <span>
                    {formatDateShort(d.date)} · {purchase?.inputType ?? "—"}
                  </span>
                  <span className="tabular font-semibold">
                    {d.quantity} {purchase?.unit ?? ""}
                  </span>
                </li>
              );
            })}
          </ul>
        </Card>
      ) : null}

      <ProfitProjection
        plants={pnl.plantCount}
        costToDateCentavos={pnl.totalCostCentavos}
        revenueSoFarCentavos={pnl.revenueCentavos}
        defaultPerPlantCentavos={realisedPerFruit}
      />

      <CycleActions
        cycleId={cycle.id}
        status={cycle.status}
        crop={cycle.crop}
        dateStarted={cycle.dateStarted}
        datePlanted={cycle.datePlanted}
        dateClosed={cycle.dateClosed}
        latestCount={counts[0] ? { date: counts[0].date, count: counts[0].count } : null}
        countHistory={counts.map((c) => ({ date: c.date, count: c.count }))}
      />
    </Page>
  );
}

function CostRow({
  label, centavos, total, note,
}: {
  label: string;
  centavos: number;
  total: number;
  note?: string;
}) {
  return (
    <li>
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-semibold">{label}</span>
        <Money centavos={centavos} />
      </div>
      {note ? <p className="text-sm text-ink-soft">{note}</p> : null}
      <Bar fraction={total === 0 ? 0 : centavos / total} />
    </li>
  );
}
