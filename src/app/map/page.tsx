import Link from "next/link";
import { Card, Empty, Note, Page } from "@/components/ui";
import { FarmMap } from "@/components/farm-map";
import { loadLedger } from "@/lib/db/ledger";
import { plotIsOccupiedOn } from "@/lib/domain/allocation";
import { cycleAgeMonths } from "@/lib/domain/age";
import { areaOn } from "@/lib/domain/plots";
import { colourKeyFor, legendFor, project } from "@/lib/domain/map";
import { todayISO } from "@/lib/domain/dates";

export const dynamic = "force-dynamic";

/**
 * The farm, drawn.
 *
 * Twenty-seven parcels spread over a kilometre, and until now the only way to
 * know which was which was to already know. Every plot is a shape you can tap
 * to reach its cycle, coloured by what is growing on it, with the empty ones
 * left unfilled so idle land reads at a glance.
 *
 * Drawn from the traced boundaries rather than over satellite imagery: the
 * shapes are the information, and vector shapes load on field signal where
 * tiles would not.
 */
export default async function MapPage() {
  const ledger = await loadLedger();
  const today = todayISO();
  const plotById = new Map(ledger.plots.map((p) => [p.id, p]));

  const projected = project(ledger.boundaries);
  const shapes = projected.shapes.flatMap((shape) => {
    const plot = plotById.get(shape.plotId);
    if (plot === undefined) return [];
    const cycle = ledger.cycles.find(
      (c) => c.plotId === plot.id && plotIsOccupiedOn(c, today),
    );
    const crop = cycle?.crop ?? null;
    return [{
      ...shape,
      plot,
      crop,
      cycleId: cycle?.id ?? null,
      colourKey: colourKeyFor(crop),
      months: cycle === undefined ? null : cycleAgeMonths(cycle, today),
      // Tasks follow the plot, not the cycle: most of what needs doing on empty
      // land — clearing, cutting, mending — has no crop attached to it.
      tasks: ledger.tasks
        .filter((t) => t.doneAt === null && t.plotId === plot.id)
        .sort((a, b) =>
          Number(b.isCritical) - Number(a.isCritical) ||
          a.dueDate.localeCompare(b.dueDate))
        .map((t) => ({
          id: t.id, title: t.title, dueDate: t.dueDate, isCritical: t.isCritical,
        })),
      surveyedSqm: areaOn(ledger.plotAreas, plot.id, today),
    }];
  });

  const legend = legendFor(shapes.map((s) => s.crop));

  // Where the traced shape and the surveyed figure disagree. Surfaced rather
  // than reconciled: which number is right is the owners' call, not the app's.
  const drawn = new Map<string, number>();
  for (const s of shapes) {
    drawn.set(s.plotId, (drawn.get(s.plotId) ?? 0) + s.areaSqm);
  }
  const disagreements = [...drawn.entries()]
    .flatMap(([plotId, mapped]) => {
      const plot = plotById.get(plotId);
      const surveyed = plot === undefined ? null : areaOn(ledger.plotAreas, plotId, today);
      if (plot === undefined || surveyed === null) return [];
      if (Math.abs(mapped - surveyed) <= surveyed * 0.02) return [];
      return [{ label: plot.label, surveyed, mapped: Math.round(mapped) }];
    })
    .sort((a, b) => Math.abs(b.mapped - b.surveyed) - Math.abs(a.mapped - a.surveyed));

  return (
    <Page title="The farm" subtitle="Tap a plot to open it">
      {ledger.boundaries.length === 0 ? (
        <Card>
          <Empty>
            No boundaries loaded yet. Run the boundary loader and the farm will
            draw itself here.
          </Empty>
        </Card>
      ) : (
        <>
          <Card>
            <FarmMap
              shapes={shapes.map((s) => ({
                plotId: s.plotId,
                part: s.part,
                d: s.d,
                labelX: s.labelX,
                labelY: s.labelY,
                label: s.plot.label,
                code: s.plot.code,
                crop: s.crop,
                cycleId: s.cycleId,
                colourKey: s.colourKey,
                months: s.months,
                tasks: s.tasks,
              }))}
              width={projected.width}
              height={projected.height}
              metresPerUnit={projected.metresPerUnit}
              legend={legend}
            />
          </Card>

          {disagreements.length > 0 ? (
            <Card title="Where the map and the survey disagree">
              <p className="mb-3 text-sm text-ink-soft">
                The shape traced on the map works out to a different area than
                the figure on file. More than 2% apart, biggest first. Which one
                is right is your call — nothing here has been changed.
              </p>
              <ul className="divide-y-2 divide-line">
                {disagreements.map((d) => (
                  <li key={d.label} className="flex justify-between gap-3 py-2">
                    <span className="font-semibold">{d.label}</span>
                    <span className="tabular text-sm text-ink-soft">
                      {d.surveyed.toLocaleString("en-PH")} on file ·{" "}
                      {d.mapped.toLocaleString("en-PH")} drawn
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          <Note tone="info">
            Plot 11 is drawn as the two parcels it is on the ground, but the app
            still holds it as one plot. Both shapes open the same cycle until it
            is split.
          </Note>
        </>
      )}

      <p className="mt-4 text-center text-sm">
        <Link href="/cycles" className="font-semibold text-brand">
          See the plots as a list
        </Link>
      </p>
    </Page>
  );
}
