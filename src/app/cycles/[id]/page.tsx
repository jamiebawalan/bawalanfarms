import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Bar, Card, Empty, Money, Note, Page, Section, Stat, StatGrid,
} from "@/components/ui";
import { CycleActions } from "@/components/cycle-actions";
import { LeafTracker, PlotTasks } from "@/components/plot-actions";
import { ProfitProjection } from "@/components/profit-projection";
import { Suggestions } from "@/components/suggestions";
import { PlotPhotos } from "@/components/plot-photos";
import { ProtocolPlan, type PlanSuggestion } from "@/components/protocol-plan";
import { SubPlots } from "@/components/sub-plots";
import { readMarks } from "@/lib/domain/annotations";
import { blockedFraction, subPlotLedger } from "@/lib/domain/subplots";
import { createAdminClient } from "@/lib/supabase/server";
import { evenness, readingsFor } from "@/lib/domain/leaf";
import { loadLedger } from "@/lib/db/ledger";
import { loadProtocol } from "@/lib/db/protocol";
import {
  describeTiming, dosesFor, forcingReadiness, mapForPlantedOn, sizeOf,
  suggestionsFor,
} from "@/lib/domain/protocol";
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
  const cropNames = new Map(ledger.crops.map((c) => [c.code, c.label]));
  const cropLabel = (code: string) => cropNames.get(code) ?? code;
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

  /**
   * Bars are a share of what the cycle has cost, not of the biggest line.
   *
   * Scaling to the largest row made every plot look the same: whatever the
   * biggest category happened to be ran the full width, and the eye read
   * "this is where the money went" from a bar that only meant "this is the
   * largest of these". Against the total, the widths add to the whole and a
   * line that is a tenth of the spend looks like a tenth of the spend.
   */
  const categoryTotal = Math.max(
    1, pnl.costByCategory.reduce((a, c) => a + c.amountCentavos, 0),
  );
  const activityTotal = Math.max(
    1, pnl.costByActivity.reduce((a, c) => a + c.amountCentavos, 0),
  );

  const readings = readingsFor(ledger, id);
  const plotTasks = ledger.tasks.filter(
    (t) => t.cycleId === id || (t.plotId !== null && t.plotId === cycle.plotId),
  );
  /*
   * Forcing, on the protocol's criteria rather than a projected date.
   *
   * Read off the most recent reading that actually weighed plants. An older
   * reading with weights beats a newer one without: a verdict from real
   * weights, clearly dated, is worth more than silence because the latest
   * walk only measured length.
   */
  const weighed = readings
    .filter((r) => r.weights.length > 0)
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  const forcing = weighed === undefined ? null : forcingReadiness(weighed.weights);

  // Blocks, and this cycle's costs divided across them. Shared costs are
  // divided here rather than when they were saved, so a corrected percentage
  // or a first plant count corrects the history with it.
  const blocks = ledger.subPlots.filter((s) => s.cycleId === id);
  const expenseById = new Map(ledger.expenses.map((e) => [e.id, e]));
  const blockLedger = subPlotLedger(
    blocks,
    ledger.allocations
      .filter((a) => a.cycleId === id)
      .flatMap((a) => {
        const expense = expenseById.get(a.expenseId);
        return expense === undefined
          ? []
          : [{
              subPlotId: a.subPlotId ?? null,
              category: expense.category,
              amountCentavos: a.amountCentavos,
            }];
      }),
  );
  const { photos, driveConnected } = await readPhotos(id);
  const protocol = await loadProtocol(id);

  /*
   * The plot's ground, as of today. Areas are dated because a boundary gets
   * re-traced, and a per-area dose mixed last month was mixed against last
   * month's figure.
   */
  const plotAreaSqm =
    ledger.plotAreas
      .filter((a) => a.plotId === cycle.plotId && a.effectiveFrom <= today)
      .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0]?.areaSqm ?? null;

  /*
   * One protocol list per block, because a block is the thing that has a
   * growth stage. Blocks exist precisely because one plot holds plants at
   * different stages, so a single list for the plot would be wrong for every
   * block on it. With no blocks, the cycle is the one unit.
   */
  const protocolUnits = (blocks.length > 0
    ? blocks.map((b) => ({
        subPlotId: b.id,
        name: b.name,
        plantedOn: b.effectivePlantedOn ?? null,
        size: sizeOf(b, { areaSqm: plotAreaSqm, plants: pnl.plantCount }),
      }))
    : [{
        subPlotId: null,
        name: null,
        plantedOn: cycle.effectivePlantedOn ?? null,
        size: sizeOf(null, { areaSqm: plotAreaSqm, plants: pnl.plantCount }),
      }]
  ).map((unit) => {
    const mapMonth =
      unit.plantedOn === null ? null : mapForPlantedOn(unit.plantedOn, today);
    const planHere = protocol.plan.filter((p) => p.subPlotId === unit.subPlotId);

    const suggestions: PlanSuggestion[] =
      mapMonth === null
        ? []
        : suggestionsFor(mapMonth, protocol.activities, planHere).map((s) => {
            const { doses, missing } = dosesFor(
              s.activity, protocol.activityMaterials, protocol.materials, unit.size,
            );
            return {
              code: s.activity.code,
              title: s.activity.title,
              instruction: s.activity.instruction,
              category: s.activity.category,
              mapMonth: s.activity.mapMonth,
              timing: describeTiming(s.timing),
              tone: s.timing.kind,
              condition: s.activity.condition,
              options: s.options.map((o) => ({
                code: o.code, title: o.title, condition: o.condition,
              })),
              doses: doses.map((d) => ({
                name: d.material.analysis === null
                  ? d.material.name
                  : `${d.material.name} (${d.material.analysis})`,
                display: d.display,
                note: d.note,
              })),
              missing,
            };
          });

    const titleOf = new Map(protocol.activities.map((a) => [a.code, a]));
    const answered = planHere
      .flatMap((p) => {
        const activity = titleOf.get(p.activityCode);
        return activity === undefined
          ? []
          : [{
              code: p.activityCode,
              title: activity.title,
              mapMonth: activity.mapMonth,
              state: p.state,
              skipReason: p.skipReason,
              dueOn: p.dueOn,
              doneOn: p.doneOn,
            }];
      })
      .sort((a, b) => b.mapMonth - a.mapMonth);

    return { ...unit, mapMonth, suggestions, answered };
  });

  // Seed the projection with what the farm has actually realised per fruit.
  const soldQty = pnl.revenueByProduct.reduce((a, r) => a + r.quantity, 0);
  const realisedPerFruit =
    soldQty > 0 ? Math.round(pnl.revenueCentavos / soldQty) : null;

  // Counted blocks make the plot's own count arithmetic; see CycleActions.
  const countedBlocks = blocks.filter((b) => b.plantCount !== null && b.plantCount > 0);
  const derivedCount =
    countedBlocks.length > 0 && countedBlocks.length === blocks.length
      ? {
          plants: countedBlocks.reduce((a, b) => a + (b.plantCount ?? 0), 0),
          blocks: countedBlocks.length,
        }
      : null;

  const setupSummary = [
    blocks.length === 0 ? "not blocked out" : `${blocks.length} blocks`,
    derivedCount !== null
      ? `${derivedCount.plants.toLocaleString("en-PH")} plants`
      : counts[0]
        ? `${counts[0].count.toLocaleString("en-PH")} plants`
        : "not counted",
    cycle.dateStarted === null ? "no start date" : `started ${formatDate(cycle.dateStarted)}`,
  ].join(" · ");

  return (
    <Page
      title={`${pnl.plot?.label ?? "Plot"} · ${cropLabel(cycle.crop)}`}
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

      <PlotPhotos
        cycleId={id}
        photos={photos}
        closed={pnl.isClosed}
        driveConnected={driveConnected}
      />

      {protocolUnits.map((unit) => (
        <ProtocolPlan
          key={unit.subPlotId ?? "cycle"}
          cycleId={id}
          subPlotId={unit.subPlotId}
          blockName={unit.name}
          mapMonth={unit.mapMonth}
          suggestions={unit.suggestions}
          answered={unit.answered}
          closed={pnl.isClosed}
          loaded={protocol.loaded}
        />
      ))}

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
          avgWeightGrams: r.avgWeightGrams,
          biomassBasis: r.biomassBasis,
          weighedCount: r.weighedCount,
        }))}
        sampleSize={ledger.settings.dleafSampleSize}
        forcingCm={ledger.settings.dleafForcingCm}
        forcing={forcing}
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

      <Card
        title="Cost by category"
        action={
          // Standing on the plot is when he knows what the cost was. Sales and
          // harvests could be logged from here; costs, the thing that happens
          // twice a day, could not.
          !pnl.isClosed ? (
            <Link
              href={`/expenses/new?plots=${cycle.plotId}&from=/cycles/${cycle.id}`}
              className="text-sm font-semibold text-brand underline underline-offset-4"
            >
              Log a cost
            </Link>
          ) : null
        }
      >
        {pnl.costByCategory.length === 0 ? (
          <Empty>No costs yet.</Empty>
        ) : (
          <ul className="space-y-3">
            {pnl.costByCategory.map((row) => (
              <li key={row.category}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-semibold">{row.category}</span>
                  <span className="shrink-0 whitespace-nowrap">
                    <Money centavos={row.amountCentavos} />
                    <span className="ml-2 tabular text-sm text-ink-soft">
                      {percent(row.amountCentavos, categoryTotal, 0)}
                    </span>
                  </span>
                </div>
                <Bar fraction={row.amountCentavos / categoryTotal} />
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
                  <span className="shrink-0 whitespace-nowrap">
                    <Money centavos={row.amountCentavos} />
                    <span className="ml-2 tabular text-sm text-ink-soft">
                      {percent(row.amountCentavos, activityTotal, 0)}
                    </span>
                  </span>
                </div>
                <Bar fraction={row.amountCentavos / activityTotal} />
              </li>
            ))}
          </ul>
        )}
        {/* These bars are totals. When one looks wrong the entry behind it is
            what needs correcting, and it is on this plot's list. */}
        <Link
          href={`/expenses?plot=${cycle.plotId}`}
          className="mt-3 inline-block text-sm font-semibold text-brand underline underline-offset-4"
        >
          Every cost on this plot →
        </Link>
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

      {/* Set once and then left alone for a season: blocked out, dated,
          counted. Three cards' worth of chrome for something touched twice a
          cycle, sitting above the figures he looks at every week — so it is
          one folded section, and it is last. */}
      <Section
        title="Blocks, dates and plant counts"
        summary={setupSummary}
        defaultOpen={blocks.length === 0 && cycle.dateStarted === null}
      >
      <SubPlots
        cycleId={id}
        ledger={blockLedger}
        blockedPct={Math.round(blockedFraction(blocks) * 1000) / 10}
        closed={pnl.isClosed}
        bare
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
        derivedCount={derivedCount}
        bare
      />
      </Section>
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

/**
 * The plot's photos, and whether there is anywhere to put a new one.
 *
 * Read with the service key because google_auth holds a credential and no
 * policy grants anyone read access to it. Nothing sensitive leaves here — only
 * whether a connection exists.
 */
async function readPhotos(cycleId: string) {
  try {
    const admin = createAdminClient();
    const [{ data: rows }, { data: auth }] = await Promise.all([
      admin
        .from("plot_photos")
        .select("id, taken_on, caption, created_at, annotations")
        .eq("cycle_id", cycleId)
        .order("taken_on", { ascending: false }),
      admin.from("google_auth").select("root_folder_id").maybeSingle(),
    ]);
    return {
      photos: (rows ?? []).map(
        (r: {
          id: string; taken_on: string; caption: string | null;
          created_at: string; annotations: unknown;
        }) => ({
          id: r.id, takenOn: r.taken_on, caption: r.caption, addedAt: r.created_at,
          marks: readMarks(r.annotations),
        }),
      ),
      driveConnected: Boolean(auth?.root_folder_id),
    };
  } catch {
    return { photos: [], driveConnected: false };
  }
}
