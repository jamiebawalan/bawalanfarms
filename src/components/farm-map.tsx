"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CROP_COLOURS, OTHER_CROP } from "@/lib/domain/map";
import { Button, Field, Input, Note, cx } from "./ui";
import { newId } from "@/lib/queue";
import { formatDateShort, todayISO } from "@/lib/domain/dates";

export type MapShape = {
  plotId: string;
  part: string;
  d: string;
  labelX: number;
  labelY: number;
  label: string;
  code: string;
  crop: string | null;
  cycleId: string | null;
  colourKey: string;
  months: number | null;
  /** The traced size of this piece, which is what weights a shared label. */
  areaSqm: number;
  /** Open tasks on this plot, whether or not a cycle is running on it. */
  tasks: { id: string; title: string; dueDate: string; isCritical: boolean }[];
  /** The whole plot's surveyed area, not this piece's. Null if never surveyed. */
  surveyedSqm: number | null;
  plantedOn: string | null;
  plants: number | null;
};

/**
 * The farm as shapes you can tap.
 *
 * Colour carries the crop, but never alone: every plot wears its number, and
 * selecting one names the crop in words underneath. That is the rule for any
 * chart someone might read in sunlight or with colour-blindness, and it matters
 * more here than usual — the yellows and greens sit below 3:1 against the page,
 * which is fine for a filled shape carrying a label and would not be for a
 * shape carrying meaning on its own.
 */
export function FarmMap({
  shapes, width, height, metresPerUnit, legend,
}: {
  shapes: MapShape[];
  width: number;
  height: number;
  metresPerUnit: number;
  legend: { key: string; label: string }[];
}) {
  const router = useRouter();
  const today = todayISO();
  const [selected, setSelected] = useState<MapShape | null>(null);
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [due, setDue] = useState(today);
  const [critical, setCritical] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * A task on a plot, not on a cycle.
   *
   * Most of what needs doing on an empty plot is maintenance — clearing edges,
   * cutting weeds, mending a fence — and none of it waits for a crop to be in
   * the ground. The tasks table has always allowed a plot with no cycle; the map
   * is simply the first place it is easy to say so, because the plot he wants is
   * the one he is looking at.
   */
  async function addTask(shape: MapShape) {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/tasks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: newId(),
        plot_id: shape.plotId,
        cycle_id: shape.cycleId,
        title: title.trim(),
        due_date: due,
        is_critical: critical,
      }),
    });
    setBusy(false);
    if (res.ok) {
      setTitle("");
      setCritical(false);
      setAdding(false);
      router.refresh();
    } else {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Could not add that task.");
    }
  }

  // A round number of metres that comes out a sensible length on screen.
  const barMetres = 100;
  // The first piece of each plot, so a plot in two parcels is announced to a
  // screen reader once rather than twice.
  const firstPartOf = new Map<string, string>();
  for (const s of shapes) {
    if (!firstPartOf.has(s.plotId)) firstPartOf.set(s.plotId, s.part);
  }

  const barUnits = barMetres / metresPerUnit;

  return (
    <div className="viz-map">
      <style>{`
        .viz-map {
          --c-pineapple: ${CROP_COLOURS.pineapple!.light};
          --c-peanut: ${CROP_COLOURS.peanut!.light};
          --c-banana: ${CROP_COLOURS.banana!.light};
          --c-other: ${OTHER_CROP.light};
        }
        @media (prefers-color-scheme: dark) {
          :root:not([data-theme="light"]) .viz-map {
            --c-pineapple: ${CROP_COLOURS.pineapple!.dark};
            --c-peanut: ${CROP_COLOURS.peanut!.dark};
            --c-banana: ${CROP_COLOURS.banana!.dark};
            --c-other: ${OTHER_CROP.dark};
          }
        }
        :root[data-theme="dark"] .viz-map {
          --c-pineapple: ${CROP_COLOURS.pineapple!.dark};
          --c-peanut: ${CROP_COLOURS.peanut!.dark};
          --c-banana: ${CROP_COLOURS.banana!.dark};
          --c-other: ${OTHER_CROP.dark};
        }
      `}</style>

      <ul className="mb-3 flex flex-wrap gap-x-4 gap-y-1.5 text-sm">
        {legend.map((item) => (
          <li key={item.key} className="flex items-center gap-1.5">
            <span
              aria-hidden
              className={cx(
                "h-3 w-3 rounded-sm border-2",
                item.key === "idle" ? "border-line bg-transparent" : "border-transparent",
              )}
              style={item.key === "idle" ? undefined : { background: fillFor(item.key) }}
            />
            <span className="text-ink-soft">{item.label}</span>
          </li>
        ))}
        <li className="flex items-center gap-1.5">
          <span aria-hidden className="h-3 w-3 rounded-full border-2 border-paper bg-ink" />
          <span className="text-ink-soft">Has a task waiting</span>
        </li>
      </ul>

      {/* eslint-disable-next-line no-use-before-define */}
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        role="img"
        aria-label={`Map of the farm: ${shapes.length} plots. Tap one to open it.`}
      >
        {/* The paths are per piece of land; the label, the task dot and the
            selection are per plot. Plot 11 is traced as two parcels three and
            a half metres apart — a real gap, not a drawing error — so the map
            draws both pieces, but it is one plot and should read as one. */}
        {shapes.map((s) => {
          const isSelected = selected?.plotId === s.plotId;
          return (
            <g key={`${s.plotId}-${s.part}`}>
              <path
                d={s.d}
                fill={s.colourKey === "idle" ? "transparent" : fillFor(s.colourKey)}
                fillOpacity={s.colourKey === "idle" ? 0 : 0.75}
                stroke="var(--color-ink)"
                strokeWidth={isSelected ? 4 : 1.5}
                strokeDasharray={s.colourKey === "idle" ? "6 4" : undefined}
                className="cursor-pointer outline-none focus-visible:stroke-[5]"
                tabIndex={0}
                role="button"
                aria-label={
                  firstPartOf.get(s.plotId) === s.part
                    ? `${s.label}${s.crop ? `, ${s.crop}` : ", nothing planted"}`
                    : undefined
                }
                aria-hidden={firstPartOf.get(s.plotId) === s.part ? undefined : true}
                onClick={() => { setSelected(isSelected ? null : s); setAdding(false); }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setSelected(isSelected ? null : s);
                    setAdding(false);
                  }
                }}
              />
            </g>
          );
        })}

        {/* Labels last, so no neighbouring parcel is drawn over a number. */}
        {oneLabelPerPlot(shapes).map((p) => (
          <g key={`label-${p.plotId}`}>
            <text
              x={p.labelX}
              y={p.labelY}
              textAnchor="middle"
              dominantBaseline="central"
              className="pointer-events-none select-none fill-[var(--color-ink)] text-[15px] font-bold"
            >
              {p.code}
            </text>
            {/* A plot with work waiting says so without being tapped —
                otherwise finding it means opening all twenty-seven. */}
            {p.tasks.length > 0 ? (
              <circle
                cx={p.labelX}
                cy={p.labelY + 15}
                r={4.5}
                className="pointer-events-none"
                fill={
                  p.tasks.some((t) => t.isCritical)
                    ? "var(--color-danger)"
                    : "var(--color-ink)"
                }
                stroke="var(--color-paper)"
                strokeWidth="1.5"
              />
            ) : null}
          </g>
        ))}

        {/* A scale bar, so the shapes carry real size and not just proportion. */}
        <g transform={`translate(14, ${height - 18})`}>
          <line x1="0" y1="0" x2={barUnits} y2="0"
                stroke="var(--color-ink-soft)" strokeWidth="2" />
          <line x1="0" y1="-4" x2="0" y2="4"
                stroke="var(--color-ink-soft)" strokeWidth="2" />
          <line x1={barUnits} y1="-4" x2={barUnits} y2="4"
                stroke="var(--color-ink-soft)" strokeWidth="2" />
          <text x={barUnits / 2} y="-8" textAnchor="middle"
                className="fill-[var(--color-ink-soft)] text-[13px] font-semibold">
            {barMetres} m
          </text>
        </g>
      </svg>

      {selected === null ? (
        <p className="mt-3 text-sm text-ink-soft">
          Tap a plot to see what is on it.
        </p>
      ) : (
        /*
         * Over the map, not under it.
         *
         * The panel used to sit below the whole drawing, so acting on a plot
         * meant tapping it and then scrolling the map out of the way to find
         * out what you had tapped. A map you have to scroll past is a map
         * that costs you something to use.
         */
        <div
          className="fixed inset-0 z-40 flex items-end justify-center bg-ink/40 p-0 sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-label={`${selected.label} details`}
          onClick={(e) => {
            if (e.target === e.currentTarget) { setSelected(null); setAdding(false); }
          }}
        >
        <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-paper p-4 shadow-lg sm:rounded-2xl">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-lg font-semibold">{selected.label}</span>
            <button
              type="button"
              aria-label="Close"
              onClick={() => { setSelected(null); setAdding(false); }}
              className="-m-2 min-h-12 min-w-12 text-2xl leading-none text-ink-soft"
            >
              ×
            </button>
          </div>

          <PlotSummary shape={selected} />

          <p className="mt-2 text-sm text-ink-soft">
            {selected.crop === null
              ? "Nothing planted."
              : `${selected.crop}${selected.months === null ? "" : `, ${selected.months} months in`}`}
          </p>
          {selected.tasks.length > 0 ? (
            <ul className="mt-2 space-y-1">
              {selected.tasks.map((t) => (
                <li key={t.id} className="text-sm">
                  <span className={cx("font-semibold", t.isCritical && "text-danger")}>
                    {t.isCritical ? "Critical · " : ""}{t.title}
                  </span>
                  <span className="text-ink-soft"> — {formatDateShort(t.dueDate)}</span>
                </li>
              ))}
            </ul>
          ) : null}

          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
            {selected.cycleId === null ? (
              <span className="text-sm text-ink-soft">No cycle running.</span>
            ) : (
              <Link
                href={`/cycles/${selected.cycleId}`}
                className="inline-flex min-h-12 items-center font-semibold text-brand underline underline-offset-4"
              >
                Open {selected.label} →
              </Link>
            )}
            <button
              type="button"
              onClick={() => { setAdding(!adding); setError(null); }}
              className="inline-flex min-h-12 items-center font-semibold text-brand underline underline-offset-4"
            >
              {adding ? "Cancel" : "Add a task"}
            </button>
          </div>

          {adding ? (
            <div className="mt-2 border-t-2 border-line pt-3">
              <Field label="What needs doing?" htmlFor="map-task">
                <Input
                  id="map-task"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. clear the edges"
                />
              </Field>
              <Field label="By when" htmlFor="map-task-due">
                <Input
                  id="map-task-due"
                  type="date"
                  value={due}
                  onChange={(e) => setDue(e.target.value)}
                />
              </Field>
              <label className="mb-3 flex min-h-12 items-center gap-2 font-semibold">
                <input
                  type="checkbox"
                  checked={critical}
                  onChange={(e) => setCritical(e.target.checked)}
                  className="h-5 w-5"
                />
                Critical — it costs the crop if it slips
              </label>
              {error ? <Note tone="danger">{error}</Note> : null}
              <Button
                variant="secondary"
                disabled={busy || title.trim().length < 3}
                onClick={() => void addTask(selected)}
              >
                {busy ? "Saving…" : "Add it"}
              </Button>
            </div>
          ) : null}
        </div>
        </div>
      )}
    </div>
  );
}

function fillFor(key: string): string {
  if (key === "pineapple") return "var(--c-pineapple)";
  if (key === "peanut") return "var(--c-peanut)";
  if (key === "banana") return "var(--c-banana)";
  return "var(--c-other)";
}

/**
 * One label per plot, wherever its land actually is.
 *
 * A plot traced as two parcels used to get its number printed twice, which
 * read as two plots. The number now sits at the centre of area across all of
 * them — weighted, so a small outlying parcel does not drag the label into
 * the gap between them.
 */
export function oneLabelPerPlot(shapes: MapShape[]) {
  const byPlot = new Map<string, MapShape[]>();
  for (const s of shapes) {
    byPlot.set(s.plotId, [...(byPlot.get(s.plotId) ?? []), s]);
  }

  return [...byPlot.values()].map((parts) => {
    const biggest = parts.reduce((a, b) => (b.areaSqm > a.areaSqm ? b : a));
    const total = parts.reduce((a, p) => a + Math.max(0, p.areaSqm), 0);
    // With no areas to weight by, the largest parcel keeps the label rather
    // than the number drifting to the midpoint of two pieces of land.
    if (total <= 0) return biggest;
    return {
      ...biggest,
      labelX: parts.reduce((a, p) => a + p.labelX * Math.max(0, p.areaSqm), 0) / total,
      labelY: parts.reduce((a, p) => a + p.labelY * Math.max(0, p.areaSqm), 0) / total,
    };
  });
}

/**
 * The three things anybody asks of a plot while looking at the map.
 *
 * How big, how many plants, when it went in. They were all reachable before —
 * on the plot's own page, past the map and a scroll. Having to leave the map
 * to find out what you just tapped is the thing that made the map ornamental.
 */
export function PlotSummary({ shape }: { shape: MapShape }) {
  return (
    <dl className="mt-2 grid grid-cols-3 gap-2 rounded-xl bg-paper-sunk p-3">
      <div>
        <dt className="text-xs uppercase tracking-wide text-ink-soft">Size</dt>
        <dd className={shape.surveyedSqm === null ? "text-ink-soft" : "font-semibold tabular"}>
          {shape.surveyedSqm === null
            ? "not surveyed"
            : `${(shape.surveyedSqm / 10_000).toFixed(2)} ha`}
        </dd>
      </div>
      <div>
        <dt className="text-xs uppercase tracking-wide text-ink-soft">Plants</dt>
        <dd className={shape.plants === null ? "text-ink-soft" : "font-semibold tabular"}>
          {shape.plants === null
            ? "not counted"
            : shape.plants.toLocaleString("en-PH")}
        </dd>
      </div>
      <div>
        <dt className="text-xs uppercase tracking-wide text-ink-soft">Planted</dt>
        {/*
          * With the year. "14 Feb" on a plot summary is ambiguous by exactly
          * the amount that matters — a crop planted last February and one
          * planted the February before are different crops.
          */}
        <dd className={shape.plantedOn === null ? "text-ink-soft" : "font-semibold"}>
          {shape.plantedOn === null
            ? "not recorded"
            : `${formatDateShort(shape.plantedOn)} ${shape.plantedOn.slice(0, 4)}`}
        </dd>
      </div>
    </dl>
  );
}
