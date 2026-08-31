"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CROP_COLOURS, OTHER_CROP } from "@/lib/domain/map";
import { Button, Field, Input, Note, cx } from "./ui";
import { newId } from "@/lib/queue";
import { formatDateShort, todayISO } from "@/lib/domain/dates";

type MapShape = {
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
  /** Open tasks on this plot, whether or not a cycle is running on it. */
  tasks: { id: string; title: string; dueDate: string; isCritical: boolean }[];
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

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        role="img"
        aria-label={`Map of the farm: ${shapes.length} plots. Tap one to open it.`}
      >
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
                aria-label={`${s.label}${s.crop ? `, ${s.crop}` : ", nothing planted"}`}
                onClick={() => { setSelected(isSelected ? null : s); setAdding(false); }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setSelected(isSelected ? null : s);
                    setAdding(false);
                  }
                }}
              />
              <text
                x={s.labelX}
                y={s.labelY}
                textAnchor="middle"
                dominantBaseline="central"
                className="pointer-events-none select-none fill-[var(--color-ink)] text-[15px] font-bold"
              >
                {s.code}
              </text>
              {/* A plot with work waiting says so without being tapped —
                  otherwise finding it means opening all twenty-seven. */}
              {s.tasks.length > 0 ? (
                <circle
                  cx={s.labelX}
                  cy={s.labelY + 15}
                  r={4.5}
                  className="pointer-events-none"
                  fill={
                    s.tasks.some((t) => t.isCritical)
                      ? "var(--color-danger)"
                      : "var(--color-ink)"
                  }
                  stroke="var(--color-paper)"
                  strokeWidth="1.5"
                />
              ) : null}
            </g>
          );
        })}

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
        <div className="mt-3 rounded-xl border-2 border-line bg-paper-sunk p-3">
          <div className="flex items-baseline justify-between gap-3">
            <span className="font-semibold">{selected.label}</span>
            <span className="text-sm text-ink-soft">
              {selected.crop === null
                ? "nothing planted"
                : `${selected.crop}${selected.months === null ? "" : `, ${selected.months} months in`}`}
            </span>
          </div>
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
