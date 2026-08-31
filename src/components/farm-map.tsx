"use client";

import { useState } from "react";
import Link from "next/link";
import { CROP_COLOURS, OTHER_CROP } from "@/lib/domain/map";
import { cx } from "./ui";

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
  const [selected, setSelected] = useState<MapShape | null>(null);

  // A round number of metres that comes out a sensible length on screen.
  const barMetres = 100;
  const barUnits = barMetres / metresPerUnit;

  return (
    <div className="viz-map">
      <style>{`
        .viz-map {
          --c-pineapple: ${CROP_COLOURS.pineapple!.light};
          --c-peanut: ${CROP_COLOURS.peanut!.light};
          --c-mane: ${CROP_COLOURS.mane!.light};
          --c-other: ${OTHER_CROP.light};
        }
        @media (prefers-color-scheme: dark) {
          :root:not([data-theme="light"]) .viz-map {
            --c-pineapple: ${CROP_COLOURS.pineapple!.dark};
            --c-peanut: ${CROP_COLOURS.peanut!.dark};
            --c-mane: ${CROP_COLOURS.mane!.dark};
            --c-other: ${OTHER_CROP.dark};
          }
        }
        :root[data-theme="dark"] .viz-map {
          --c-pineapple: ${CROP_COLOURS.pineapple!.dark};
          --c-peanut: ${CROP_COLOURS.peanut!.dark};
          --c-mane: ${CROP_COLOURS.mane!.dark};
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
                onClick={() => setSelected(isSelected ? null : s)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setSelected(isSelected ? null : s);
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
          {selected.cycleId === null ? (
            <p className="mt-1 text-sm text-ink-soft">
              No cycle running. Start one from the Plots tab.
            </p>
          ) : (
            <Link
              href={`/cycles/${selected.cycleId}`}
              className="mt-2 inline-flex min-h-12 items-center font-semibold text-brand underline underline-offset-4"
            >
              Open {selected.label} →
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

function fillFor(key: string): string {
  if (key === "pineapple") return "var(--c-pineapple)";
  if (key === "peanut") return "var(--c-peanut)";
  if (key === "mane") return "var(--c-mane)";
  return "var(--c-other)";
}
