import type { ReactNode } from "react";
import { cx } from "./ui";

/**
 * The few chart forms these dashboards need, in plain SVG and CSS.
 *
 * Colour is assigned by the job it does, not by taste:
 *
 *  - cost drivers are three categorical series, so they take the first three
 *    validated categorical slots in fixed order. Labour is always blue, inputs
 *    always orange, whatever else is on screen — colour follows the thing, not
 *    its rank.
 *  - pineapple grades are an ordered quality scale, not identities, so they get
 *    one hue light to dark. Using five categorical hues there would imply the
 *    grades are unrelated, and no five-hue set clears the colourblind floors
 *    anyway.
 *
 * Aqua sits below 3:1 on white, so every segment carries a visible label and
 * the numbers are written out beside the bar. Identity is never colour alone.
 */

export const SERIES = {
  labour: { light: "#2a78d6", dark: "#3987e5", label: "Labour" },
  inputs: { light: "#eb6834", dark: "#d95926", label: "Inputs" },
  other: { light: "#1baf7a", dark: "#199e70", label: "Everything else" },
} as const;

/** One hue, dark to light: Primera is the best grade and reads heaviest. */
export const GRADE_RAMP = ["#0b3d24", "#15613a", "#2f8b5a", "#6fb894", "#b9dcc9"];

export function ChartStyles() {
  return (
    <style>{`
      .viz { --s-labour:${SERIES.labour.light}; --s-inputs:${SERIES.inputs.light};
             --s-other:${SERIES.other.light}; }
      @media (prefers-color-scheme: dark) {
        :root:where(:not([data-theme="light"])) .viz {
          --s-labour:${SERIES.labour.dark}; --s-inputs:${SERIES.inputs.dark};
          --s-other:${SERIES.other.dark}; }
      }
      :root[data-theme="dark"] .viz {
        --s-labour:${SERIES.labour.dark}; --s-inputs:${SERIES.inputs.dark};
        --s-other:${SERIES.other.dark}; }
    `}</style>
  );
}

export function Legend({ items }: { items: { color: string; label: string }[] }) {
  return (
    <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5 text-sm text-ink-soft">
          <span
            aria-hidden="true"
            className="inline-block size-3 shrink-0 rounded-sm"
            style={{ background: i.color }}
          />
          {i.label}
        </li>
      ))}
    </ul>
  );
}

/**
 * A stacked proportion bar. Segments are separated by a 2px surface gap so
 * adjacent fills never touch, which is what keeps them apart for a colourblind
 * reader as much as the hues do.
 */
export function StackedBar({
  segments, title, of,
}: {
  segments: { value: number; color: string; label: string }[];
  title?: string;
  /**
   * The value that fills the full width. Without it every bar stretches to
   * 100% and only the split inside it can be read — which is fine for one row
   * and useless down a list, because two bars of equal length can be ten times
   * apart. Pass the largest value in the list and length becomes comparable.
   */
  of?: number;
}) {
  const total = segments.reduce((a, s) => a + s.value, 0);
  if (total <= 0) {
    return <div className="h-3 w-full rounded-full bg-paper-sunk" role="presentation" />;
  }
  const share = of === undefined || of <= 0 ? 1 : Math.min(1, total / of);
  return (
    <div className="w-full rounded-full bg-paper-sunk">
    <div
      className="flex h-3 gap-[2px] overflow-hidden rounded-full"
      style={{ width: `${share * 100}%` }}
      role="img"
      aria-label={
        title ??
        segments
          .map((s) => `${s.label} ${Math.round((s.value / total) * 100)}%`)
          .join(", ")
      }
    >
      {segments
        .filter((s) => s.value > 0)
        .map((s) => (
          <span
            key={s.label}
            className="h-full first:rounded-l-full last:rounded-r-full"
            style={{ width: `${(s.value / total) * 100}%`, background: s.color }}
          />
        ))}
    </div>
    </div>
  );
}

/**
 * A single-series line over time. No legend: the title names the one thing
 * being drawn, and a legend box for one series is noise.
 */
export function Sparkline({
  points, ariaLabel, target,
}: {
  points: { x: number; y: number }[];
  ariaLabel: string;
  /** A horizontal reference, e.g. the D-leaf length that means ready. */
  target?: number;
}) {
  if (points.length < 2) return null;
  const W = 300;
  const H = 64;
  const P = 6;
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const lo = Math.min(...ys, target ?? Infinity);
  const hi = Math.max(...ys, target ?? -Infinity);
  const spanY = hi - lo || 1;
  const spanX = Math.max(...xs) - Math.min(...xs) || 1;
  const minX = Math.min(...xs);

  const at = (p: { x: number; y: number }) => ({
    cx: P + ((p.x - minX) / spanX) * (W - P * 2),
    cy: H - P - ((p.y - lo) / spanY) * (H - P * 2),
  });
  const d = points.map((p, i) => {
    const { cx, cy } = at(p);
    return `${i === 0 ? "M" : "L"}${cx.toFixed(1)} ${cy.toFixed(1)}`;
  }).join(" ");
  const last = at(points[points.length - 1]!);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-16 w-full" role="img" aria-label={ariaLabel}>
      {target !== undefined ? (
        <line
          x1={P} x2={W - P}
          y1={H - P - ((target - lo) / spanY) * (H - P * 2)}
          y2={H - P - ((target - lo) / spanY) * (H - P * 2)}
          stroke="currentColor" strokeWidth={1} strokeDasharray="4 4"
          className="text-line-strong"
        />
      ) : null}
      <path d={d} fill="none" stroke="var(--color-brand)" strokeWidth={2}
            strokeLinecap="round" strokeLinejoin="round" />
      {/* A 2px surface ring keeps the marker legible wherever the line lands. */}
      <circle cx={last.cx} cy={last.cy} r={5} fill="var(--color-brand)"
              stroke="var(--color-paper)" strokeWidth={2} />
    </svg>
  );
}

/**
 * A figure with its comparison. The headline is the recent window and the
 * longer one sits beneath it, because on an eighteen-month crop a single
 * number is either stale or noise — the pair is what can be read.
 */
export function PairStat({
  label, recent, recentLabel, prior, priorLabel, hint, tone,
}: {
  label: string;
  recent: ReactNode;
  recentLabel: string;
  prior: ReactNode;
  priorLabel: string;
  hint?: ReactNode;
  tone?: "up" | "down";
}) {
  return (
    <div className="rounded-xl border-2 border-line bg-paper-sunk px-3 py-2.5">
      <div className="text-xs font-bold uppercase tracking-wide text-ink-soft">{label}</div>
      <div
        className={cx(
          "tabular mt-0.5 text-2xl font-bold",
          tone === "up" && "text-money-up",
          tone === "down" && "text-money-down",
        )}
      >
        {recent}
      </div>
      <div className="text-xs text-ink-soft">{recentLabel}</div>
      <div className="tabular mt-1.5 border-t-2 border-line pt-1.5 text-base font-semibold">
        {prior}
      </div>
      <div className="text-xs text-ink-soft">{priorLabel}</div>
      {hint ? <div className="mt-1 text-xs text-ink-soft">{hint}</div> : null}
    </div>
  );
}
