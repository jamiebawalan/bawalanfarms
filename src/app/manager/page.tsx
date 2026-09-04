import Link from "next/link";
import { Bar, Card, Empty, Note, Page, Stat, StatGrid, cx, Section } from "@/components/ui";
import { ChartStyles, Legend, SERIES, StackedBar } from "@/components/charts";
import { loadLedger } from "@/lib/db/ledger";
import { landUse, plotCostByAge, tasksForWeek } from "@/lib/domain/dashboards";
import { cashIsLow, cashPosition } from "@/lib/domain/cash";
import { CashCard } from "@/components/cash-card";
import { cycleAgeMonths, groupByBand } from "@/lib/domain/age";
import { formatPeso, formatPesoPrecise } from "@/lib/domain/money";
import { formatDate, formatDateShort, todayISO } from "@/lib/domain/dates";

export const dynamic = "force-dynamic";

/**
 * The day-to-day view: what to plant, what is costing too much, and what needs
 * doing this week. A step down in detail from the owner's page, and pointed at
 * decisions rather than results.
 */
export default async function ManagerPage() {
  const ledger = await loadLedger();
  const today = todayISO();
  const land = landUse(ledger, today);
  const rows = plotCostByAge(ledger, today);
  const cycleById = new Map(ledger.cycles.map((c) => [c.id, c]));
  const tasks = tasksForWeek(ledger, today);

  // Bars are drawn in cost per plant and scaled to the worst of them, so their
  // lengths mean something across rows rather than only within one.
  const perPlant = (value: number, plants: number | null) =>
    plants === null || plants <= 0 ? 0 : value / plants;
  const worstCost = Math.max(1, ...rows.map((r) => r.costPerPlantCentavos ?? 0));
  const banded = groupByBand(rows, (r) => ({ cycle: cycleById.get(r.cycleId)! }), today);
  const cash = cashPosition(ledger, today);
  const lowOnCash = cashIsLow(cash);
  const worst = rows.find((r) => r.costPerPlantCentavos !== null) ?? null;

  return (
    <Page title="Day to day" subtitle="Land, cost per plant, and this week's work">
      <ChartStyles />

      {/* 1. Keep the land planted. */}
      <Section
        title="Land in use"
        summary={`${Math.round(land.utilisation * 100)}% planted · ${land.idlePlots.length} idle`}
        tone={land.utilisation < 0.7 ? "warn" : undefined}
      >
        <StatGrid>
          <Stat
            label="Planted"
            value={`${Math.round(land.utilisation * 100)}%`}
            hint={`${land.plantedSqm.toLocaleString("en-PH")} of ${land.totalSqm.toLocaleString("en-PH")} sqm`}
            tone={land.utilisation >= 0.9 ? "up" : undefined}
          />
          <Stat
            label="Plants standing"
            value={land.plantsStanding.toLocaleString("en-PH")}
            hint={
              land.plantUtilisation === null
                ? "no counts yet"
                : `${Math.round(land.plantUtilisation * 100)}% of ${land.plantsPotential.toLocaleString("en-PH")} possible`
            }
          />
          <Stat
            label="Idle plots"
            value={String(land.idlePlots.length)}
            tone={land.idlePlots.length > 0 ? "down" : "up"}
            hint={
              land.idlePlots.length > 0
                ? `${land.idlePlots.reduce((a, p) => a + p.areaSqm, 0).toLocaleString("en-PH")} sqm`
                : "everything is planted"
            }
          />
        </StatGrid>

        <Bar fraction={land.utilisation} />
        <p className="mt-1 text-sm text-ink-soft">
          Planted area against the area that could carry a crop. Plants standing
          are measured against {ledger.settings.targetPlantsPerSqm} per sqm — the
          density the farm plants for, about{" "}
          {(ledger.settings.targetPlantsPerSqm * 10_000).toLocaleString("en-PH")}{" "}
          a hectare.
        </p>

        {land.idlePlots.length > 0 ? (
          <ul className="mt-3 divide-y-2 divide-line">
            {land.idlePlots.map((p) => (
              <li key={p.plotId} className="flex justify-between gap-3 py-2">
                <span className="font-semibold">{p.label}</span>
                <span className="tabular text-ink-soft">
                  {p.areaSqm.toLocaleString("en-PH")} sqm sitting empty
                </span>
              </li>
            ))}
          </ul>
        ) : null}

        {land.nextPlanned ? (
          <Note tone="good">
            Next in: <strong>{land.nextPlanned.crop}</strong> on{" "}
            <strong>{land.nextPlanned.label}</strong>
            {land.nextPlanned.areaSqm !== null
              ? ` (${land.nextPlanned.areaSqm.toLocaleString("en-PH")} sqm)`
              : ""}
            .{" "}
            {land.utilisationAfterNext !== null
              ? `Once it goes in, ${Math.round(land.utilisationAfterNext * 100)}% of the land is planted.`
              : ""}
          </Note>
        ) : (
          <Note tone="warn">
            No cycle is queued. Every empty plot is still carrying its share of the
            farm-wide costs while it earns nothing.
          </Note>
        )}
      </Section>

      {/* 2. Which plots cost the most to grow. */}
      <Section
        title="Cost per plant"
        summary={
          worst === null
            ? "no pineapple cycle running"
            : `oldest first · worst ${formatPesoPrecise(worst.costPerPlantCentavos!)} on ${worst.plotLabel}`
        }
      >
        {rows.length === 0 ? (
          <Empty>No pineapple cycle is running.</Empty>
        ) : (
          <>
            <Legend
              items={[
                { color: "var(--s-labour)", label: SERIES.labour.label },
                { color: "var(--s-inputs)", label: SERIES.inputs.label },
                { color: "var(--s-other)", label: SERIES.other.label },
              ]}
            />
            {banded.map(({ band, items }) => (
            <section key={band?.key ?? "rest"} className="viz">
              <h3 className="mt-4 text-xs font-bold uppercase tracking-wide text-ink-soft first:mt-0">
                {band === null ? "Everything else" : band.label}
              </h3>
              <ul className="divide-y-2 divide-line">
              {items.map((r) => (
                <li key={r.cycleId} className="py-3">
                  <Link href={`/cycles/${r.cycleId}`} className="block">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="font-semibold">{r.plotLabel}</span>
                      <span className="tabular font-bold">
                        {r.costPerPlantCentavos === null
                          ? "—"
                          : `${formatPesoPrecise(r.costPerPlantCentavos)} / plant`}
                      </span>
                    </div>
                    <div className="mb-1.5 text-sm text-ink-soft">
                      {(() => {
                        const months = cycleAgeMonths(cycleById.get(r.cycleId)!, today);
                        return months === null ? "not started" : `${months} months in`;
                      })()}
                      {" · "}
                      {r.plants === null
                        ? "no plant count"
                        : `${r.plants.toLocaleString("en-PH")} plants`}
                      {" · "}
                      {formatPeso(r.totalCostCentavos)}
                    </div>
                    <StackedBar
                      of={worstCost}
                      segments={[
                        { value: perPlant(r.labourCentavos, r.plants), color: "var(--s-labour)", label: "Labour" },
                        { value: perPlant(r.inputsCentavos, r.plants), color: "var(--s-inputs)", label: "Inputs" },
                        { value: perPlant(r.otherCentavos, r.plants), color: "var(--s-other)", label: "Everything else" },
                      ]}
                    />
                    {/* Written out as well as coloured: the aqua sits below 3:1
                        on white, and identity must never be colour alone. */}
                    <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-ink-soft tabular">
                      <span>Labour {formatPeso(r.labourCentavos)}</span>
                      <span>Inputs {formatPeso(r.inputsCentavos)}</span>
                      <span>Other {formatPeso(r.otherCentavos)}</span>
                    </div>

                    <div className="mt-2 rounded-lg bg-paper-sunk px-3 py-2 text-sm">
                      {r.latestDleafCm === null ? (
                        <div className="text-ink-soft">No D-leaf measured yet.</div>
                      ) : (
                        <div className="text-ink">
                          D-leaf{" "}
                          <span className="tabular font-semibold">{r.latestDleafCm} cm</span>{" "}
                          <span className="text-ink-soft">
                            on {formatDateShort(r.latestDleafDate)}
                            {r.dleafGrowthPerDay !== null
                              ? `, growing ${r.dleafGrowthPerDay} cm/day`
                              : ""}
                          </span>
                        </div>
                      )}

                      {/* Forcing is what the readings are for: liquid goes on when
                          the plants are big enough, and the harvest follows. */}
                      {r.projectedForcing !== null ? (
                        <div className="mt-0.5 text-ink">
                          Force around{" "}
                          <strong>{formatDate(r.projectedForcing)}</strong>
                          {r.targetForcing !== null && r.forcingSlipDays !== null ? (
                            <>
                              {" — "}
                              <span
                                className={cx(
                                  "font-semibold",
                                  r.forcingSlipDays > 0 ? "text-money-down" : "text-money-up",
                                )}
                              >
                                {r.forcingSlipDays > 0
                                  ? `${r.forcingSlipDays} days later than planned`
                                  : r.forcingSlipDays < 0
                                    ? `${-r.forcingSlipDays} days earlier than planned`
                                    : "on target"}
                              </span>
                            </>
                          ) : (
                            <span className="text-ink-soft"> · no target set</span>
                          )}
                        </div>
                      ) : r.dleafReadings === 1 ? (
                        <div className="mt-0.5 text-ink-soft">
                          One reading — a second gives the rate.
                        </div>
                      ) : null}

                      {r.projectedHarvest !== null ? (
                        <div className="text-ink-soft">
                          Harvest ~{formatDateShort(r.projectedHarvest)}
                        </div>
                      ) : null}
                    </div>
                  </Link>
                </li>
              ))}
              </ul>
            </section>
            ))}
          </>
        )}
      </Section>

      {/* 3. What needs doing. */}
      <Section
        title="This week"
        defaultOpen
        summary={
          tasks.overdue.length > 0
            ? `${tasks.overdue.length} overdue · ${tasks.thisWeek.length} due`
            : `${tasks.thisWeek.length} due in the next seven days`
        }
        tone={tasks.overdue.length > 0 ? "danger" : undefined}
      >
        {tasks.overdue.length === 0 && tasks.thisWeek.length === 0 ? (
          <Empty>
            Nothing due this week. Tasks are added from each plot&apos;s page.
          </Empty>
        ) : (
          <>
            {tasks.overdue.length > 0 ? (
              <>
                <p className="mb-1 text-sm font-bold uppercase tracking-wide text-danger">
                  Overdue
                </p>
                <TaskList tasks={tasks.overdue} today={today} />
              </>
            ) : null}
            {tasks.thisWeek.length > 0 ? (
              <>
                <p className="mb-1 mt-3 text-sm font-bold uppercase tracking-wide text-ink-soft">
                  Next seven days
                </p>
                <TaskList tasks={tasks.thisWeek} today={today} />
              </>
            ) : null}
          </>
        )}
        {tasks.later.length > 0 ? (
          <p className="mt-3 text-sm text-ink-soft">
            {tasks.later.length} more after this week.
          </p>
        ) : null}
      </Section>

      {/* 4. What is left in his pocket. */}
      <Section
        title="Cash"
        summary={
          cash.startedOn === null
            ? "not tracked yet"
            : cash.onHandCentavos <= 0
              ? "spent — ask for more"
              : `${formatPeso(cash.onHandCentavos)} on hand${
                  cash.daysRemaining === null ? "" : ` · about ${cash.daysRemaining} days`
                }`
        }
        tone={lowOnCash ? (cash.onHandCentavos <= 0 ? "danger" : "warn") : undefined}
        defaultOpen={lowOnCash}
      >
        <CashCard
          onHandCentavos={cash.onHandCentavos}
          advancedCentavos={cash.advancedCentavos}
          spentCentavos={cash.spentCentavos}
          startedOn={cash.startedOn}
          lastAdvance={
            cash.lastAdvance === null
              ? null
              : { date: cash.lastAdvance.date, amountCentavos: cash.lastAdvance.amountCentavos }
          }
          sinceLastAdvanceCentavos={cash.sinceLastAdvanceCentavos}
          daysRemaining={cash.daysRemaining}
          isLow={lowOnCash}
          recent={[...ledger.cashAdvances]
            .sort((a, b) => b.date.localeCompare(a.date))
            .slice(0, 12)
            .map((a) => ({ id: a.id, date: a.date, amountCentavos: a.amountCentavos, note: a.note }))}
        />
        {/* Cash on hand is spend, counted backwards. If a figure here looks
            wrong the entry behind it is what needs fixing, so the list is one
            tap away rather than back through Today. */}
        <Link
          href="/expenses"
          className="mt-3 inline-block font-semibold text-brand underline underline-offset-4"
        >
          Every cost logged →
        </Link>
      </Section>

      <Card>
        <Link href="/owner" className="font-semibold text-brand underline underline-offset-4">
          ← The whole-farm view
        </Link>
      </Card>
    </Page>
  );
}

function TaskList({
  tasks, today,
}: {
  tasks: { id: string; title: string; dueDate: string; isCritical: boolean; plotLabel: string | null }[];
  today: string;
}) {
  return (
    <ul className="divide-y-2 divide-line">
      {tasks.map((t) => (
        <li key={t.id} className="flex items-start justify-between gap-3 py-2.5">
          <div className="min-w-0">
            <div className="font-semibold">
              {t.isCritical ? (
                <span className="mr-1.5 rounded bg-danger-tint px-1.5 py-0.5 text-xs font-bold uppercase text-danger">
                  Critical
                </span>
              ) : null}
              {t.title}
            </div>
            {t.plotLabel ? (
              <div className="text-sm text-ink-soft">{t.plotLabel}</div>
            ) : null}
          </div>
          <span
            className={
              t.dueDate < today
                ? "shrink-0 text-sm font-semibold text-danger"
                : "shrink-0 text-sm text-ink-soft"
            }
          >
            {formatDateShort(t.dueDate)}
          </span>
        </li>
      ))}
    </ul>
  );
}
