"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Chip, ChipGroup, Empty, Field, Input, Note, cx } from "./ui";
import { Sparkline } from "./charts";
import { newId } from "@/lib/queue";
import { formatDate, formatDateShort, todayISO } from "@/lib/domain/dates";
import { BIOMASS_BASES, type BiomassBasis } from "@/lib/domain/types";

export type Reading = {
  date: string;
  avgLengthCm: number;
  sampleSize: number | null;
  plants: number[];
  shortestCm: number | null;
  tallestCm: number | null;
  spreadCm: number | null;
  evenness: { label: string; tone: "good" | "warn" | "danger" } | null;
  avgWeightGrams: number | null;
  biomassBasis: BiomassBasis | null;
  weighedCount: number;
};
export type PlotTask = {
  id: string;
  title: string;
  dueDate: string;
  isCritical: boolean;
  doneAt: string | null;
};

/**
 * D-leaf readings, plant by plant.
 *
 * Anthony picks plants at random and measures each one. He used to have to work
 * out the average in the field and type that; now he types what he measured and
 * the app does the arithmetic — which removes a step, removes a place to make a
 * mistake, and keeps the individual numbers.
 *
 * Keeping them matters. Twenty plants averaging 57 cm can be a tidy row between
 * 54 and 60 or a mess between 27 and 79, and only one of those is a block that
 * will force together. The average alone cannot tell you which you have.
 */
export function LeafTracker({
  cycleId, readings, sampleSize, forcingCm, projected, target, closed,
}: {
  cycleId: string;
  readings: Reading[];
  sampleSize: number;
  forcingCm: number;
  projected: { date: string; cmPerDay: number } | null;
  target: string | null;
  closed: boolean;
}) {
  const router = useRouter();
  const today = todayISO();
  const [plants, setPlants] = useState<string[]>(() => Array(sampleSize).fill(""));
  const [grams, setGrams] = useState<string[]>(() => Array(sampleSize).fill(""));
  const [date, setDate] = useState(today);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sorted = [...readings].sort((a, b) => a.date.localeCompare(b.date));
  const latest = sorted[sorted.length - 1] ?? null;

  /**
   * What is going on the scale, if anything.
   *
   * Carried over from the last reading, because a farm that starts weighing
   * keeps weighing — and because a column of grams is only comparable with
   * the ones above it if the same thing was weighed each time.
   */
  const [basis, setBasis] = useState<BiomassBasis | null>(
    () => latest?.biomassBasis ?? null,
  );

  const entered = plants
    .map((value, i) => {
      const g = Number(grams[i]);
      return {
        no: i + 1,
        cm: Number(value),
        g: basis !== null && g > 0 && Number.isFinite(g) ? g : null,
      };
    })
    .filter((p) => p.cm > 0 && Number.isFinite(p.cm));
  const runningAverage =
    entered.length === 0
      ? null
      : Math.round((entered.reduce((a, p) => a + p.cm, 0) / entered.length) * 10) / 10;

  const weighed = entered.filter((p) => p.g !== null);
  const runningWeight =
    weighed.length === 0
      ? null
      : Math.round((weighed.reduce((a, p) => a + (p.g ?? 0), 0) / weighed.length) * 10) / 10;

  async function save() {
    if (entered.length === 0) return;
    setBusy(true);
    setError(null);
    const res = await fetch("/api/leaf", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        cycle_id: cycleId, date, plants: entered,
        biomass_basis: weighed.length > 0 ? basis : null,
      }),
    });
    setBusy(false);
    if (res.ok) {
      setPlants(Array(sampleSize).fill(""));
      setGrams(Array(sampleSize).fill(""));
      setOpen(false);
      router.refresh();
    } else {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Could not save that reading.");
    }
  }

  return (
    <Card title="D-leaf">
      {latest === null ? (
        <p className="mb-3 text-ink-soft">
          No reading yet. Measure {sampleSize} plants picked at random — that is
          what starts the clock on forcing.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="tabular text-3xl font-bold">{latest.avgLengthCm} cm</span>
            {latest.avgWeightGrams !== null ? (
              <span className="tabular text-3xl font-bold">
                · {latest.avgWeightGrams} g
              </span>
            ) : null}
            <span className="text-ink-soft">
              on {formatDate(latest.date)}
              {latest.sampleSize ? `, ${latest.sampleSize} plants` : ""}
              {latest.avgWeightGrams !== null && latest.biomassBasis !== null
                ? ` · ${latest.weighedCount} weighed (${
                    latest.biomassBasis === "d_leaf" ? "D-leaf" : "whole plant"
                  })`
                : ""}
            </span>
          </div>

          {latest.shortestCm !== null && latest.evenness !== null ? (
            <p className="mt-0.5 text-sm text-ink-soft">
              Shortest {latest.shortestCm} cm, tallest {latest.tallestCm} cm —{" "}
              <span
                className={cx(
                  "font-semibold",
                  latest.evenness.tone === "good" && "text-brand",
                  latest.evenness.tone === "warn" && "text-warn",
                  latest.evenness.tone === "danger" && "text-danger",
                )}
              >
                {latest.evenness.label}
              </span>{" "}
              (spread {latest.spreadCm} cm)
            </p>
          ) : null}

          {sorted.length >= 2 ? (
            <>
              <Sparkline
                points={sorted.map((r) => ({
                  x: Date.parse(`${r.date}T00:00:00Z`),
                  y: r.avgLengthCm,
                }))}
                target={forcingCm}
                ariaLabel={`D-leaf from ${sorted[0]!.avgLengthCm}cm on ${sorted[0]!.date} to ${latest.avgLengthCm}cm on ${latest.date}. Forcing length ${forcingCm}cm.`}
              />
              <p className="text-sm text-ink-soft">
                Dashed line is {forcingCm} cm, the length to force at.
              </p>
            </>
          ) : (
            <Note tone="info">
              One reading so far. A second gives the growth rate, which is what
              says when to put the liquid on.
            </Note>
          )}
        </>
      )}

      {projected !== null ? (
        <Note tone={target !== null && projected.date > target ? "warn" : "good"}>
          Growing {projected.cmPerDay} cm a day — big enough to force around{" "}
          <strong>{formatDate(projected.date)}</strong>
          {target !== null ? (
            <> against a target of {formatDate(target)}.</>
          ) : (
            <>. No target set for this cycle yet.</>
          )}
        </Note>
      ) : null}

      {sorted.length > 0 ? (
        <details className="mb-3">
          <summary className="cursor-pointer text-sm font-semibold text-brand">
            Every reading{sorted.length > 1 ? ` (${sorted.length})` : ""}
          </summary>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-sm tabular">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-ink-soft">
                  <th className="py-1 pr-3 font-bold">Date</th>
                  <th className="py-1 pr-3 font-bold">Average</th>
                  <th className="py-1 pr-3 font-bold">Weight</th>
                  <th className="py-1 pr-3 font-bold">Range</th>
                  <th className="py-1 font-bold">Plants</th>
                </tr>
              </thead>
              <tbody>
                {[...sorted].reverse().map((r) => (
                  <tr key={r.date} className="border-t border-line">
                    <td className="py-1 pr-3">{formatDateShort(r.date)}</td>
                    <td className="py-1 pr-3 font-semibold">{r.avgLengthCm} cm</td>
                    <td className="py-1 pr-3 text-ink-soft">
                      {r.avgWeightGrams === null ? "—" : `${r.avgWeightGrams} g`}
                    </td>
                    <td className="py-1 pr-3 text-ink-soft">
                      {r.shortestCm === null ? "—" : `${r.shortestCm}–${r.tallestCm}`}
                    </td>
                    <td className="py-1 text-ink-soft">{r.sampleSize ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      ) : null}

      {closed ? null : open ? (
        <>
          <Field label="Measured on" htmlFor="dleaf-date">
            <Input
              id="dleaf-date"
              type="date"
              value={date}
              max={today}
              onChange={(e) => setDate(e.target.value)}
            />
          </Field>

          {/* One decision, not two: whether anything goes on the scale, and
              what. Grams with no record of what was weighed are unreadable a
              year later, so the question cannot be skipped. */}
          <p className="mb-1.5 text-sm font-semibold text-ink">Weighing as well?</p>
          <ChipGroup>
            <Chip selected={basis === null} onClick={() => setBasis(null)}>
              Length only
            </Chip>
            <Chip selected={basis === "d_leaf"} onClick={() => setBasis("d_leaf")}>
              D-leaf weight
            </Chip>
            <Chip
              selected={basis === "whole_plant"}
              onClick={() => setBasis("whole_plant")}
            >
              Whole plant
            </Chip>
          </ChipGroup>
          {basis !== null ? (
            <p className="mb-2 mt-1 text-sm text-ink-soft">{BIOMASS_BASES[basis]}</p>
          ) : null}

          <p className="mb-2 mt-3 text-sm text-ink-soft">
            One row per plant, in the order you measured them. Leave a row blank
            if you measured fewer than {sampleSize}.
            {basis !== null ? " The weight can be left blank on its own." : ""}
          </p>
          <ul
            className={cx(
              "mb-3 grid gap-2",
              basis === null ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-1 sm:grid-cols-2",
            )}
          >
            {plants.map((value, i) => (
              <li key={i} className="flex items-center gap-1.5">
                <span className="w-5 shrink-0 text-right text-sm tabular text-ink-soft">
                  {i + 1}
                </span>
                <Input
                  aria-label={`Plant ${i + 1}, centimetres`}
                  inputMode="decimal"
                  value={value}
                  onChange={(e) => {
                    const next = [...plants];
                    next[i] = e.target.value;
                    setPlants(next);
                  }}
                />
                {basis === null ? null : (
                  <>
                    <span className="shrink-0 text-xs text-ink-soft">cm</span>
                    <Input
                      aria-label={`Plant ${i + 1}, grams`}
                      inputMode="decimal"
                      value={grams[i] ?? ""}
                      onChange={(e) => {
                        const next = [...grams];
                        next[i] = e.target.value;
                        setGrams(next);
                      }}
                    />
                    <span className="shrink-0 text-xs text-ink-soft">g</span>
                  </>
                )}
              </li>
            ))}
          </ul>

          <p className="mb-3 text-sm">
            {runningAverage === null ? (
              <span className="text-ink-soft">Nothing entered yet.</span>
            ) : (
              <>
                <strong className="tabular">{runningAverage} cm</strong>{" "}
                <span className="text-ink-soft">
                  average across {entered.length}{" "}
                  {entered.length === 1 ? "plant" : "plants"}
                </span>
                {runningWeight !== null ? (
                  <>
                    {" · "}
                    <strong className="tabular">{runningWeight} g</strong>{" "}
                    <span className="text-ink-soft">
                      across {weighed.length} weighed
                    </span>
                  </>
                ) : null}
              </>
            )}
          </p>

          {error ? <Note tone="danger">{error}</Note> : null}
          <div className="flex gap-2">
            <Button variant="secondary" disabled={busy || entered.length === 0} onClick={save}>
              {busy ? "Saving…" : "Save this reading"}
            </Button>
            <Button variant="secondary" disabled={busy} onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </>
      ) : (
        <Button variant="secondary" onClick={() => setOpen(true)}>
          Record a reading
        </Button>
      )}
    </Card>
  );
}

/**
 * The plot's own task list. Deliberately thin: what needs doing, by when, and
 * whether it matters more than the rest.
 */
export function PlotTasks({
  plotId, cycleId, tasks, closed,
}: {
  plotId: string;
  cycleId: string;
  tasks: PlotTask[];
  closed: boolean;
}) {
  const router = useRouter();
  const today = todayISO();
  const [title, setTitle] = useState("");
  const [due, setDue] = useState(today);
  const [critical, setCritical] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = tasks
    .filter((t) => t.doneAt === null)
    .sort(
      (a, b) =>
        Number(b.isCritical) - Number(a.isCritical) || a.dueDate.localeCompare(b.dueDate),
    );
  const done = tasks.filter((t) => t.doneAt !== null);

  async function add() {
    if (title.trim().length < 3) return;
    setBusy(true);
    setError(null);
    const res = await fetch("/api/tasks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: newId(),
        plot_id: plotId,
        cycle_id: cycleId,
        title: title.trim(),
        due_date: due,
        is_critical: critical,
      }),
    });
    setBusy(false);
    if (res.ok) {
      setTitle("");
      setCritical(false);
      router.refresh();
    } else {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Could not add that.");
    }
  }

  async function toggle(id: string, isDone: boolean) {
    await fetch("/api/tasks", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, done: !isDone }),
    });
    router.refresh();
  }

  return (
    <Card title="To do here" action={<span className="text-sm text-ink-soft">{open.length} open</span>}>
      {open.length === 0 ? (
        <Empty>Nothing outstanding on this plot.</Empty>
      ) : (
        <ul className="divide-y-2 divide-line">
          {open.map((t) => (
            <li key={t.id} className="flex items-start gap-3 py-2.5">
              <button
                type="button"
                aria-label={`Mark "${t.title}" done`}
                onClick={() => toggle(t.id, false)}
                className="mt-0.5 size-7 shrink-0 rounded-md border-2 border-line-strong"
              />
              <div className="min-w-0 flex-1">
                <div className="font-semibold">
                  {t.isCritical ? (
                    <span className="mr-1.5 rounded bg-danger-tint px-1.5 py-0.5 text-xs font-bold uppercase text-danger">
                      Critical
                    </span>
                  ) : null}
                  {t.title}
                </div>
              </div>
              <span
                className={cx(
                  "shrink-0 text-sm",
                  t.dueDate < today ? "font-semibold text-danger" : "text-ink-soft",
                )}
              >
                {formatDateShort(t.dueDate)}
              </span>
            </li>
          ))}
        </ul>
      )}

      {done.length > 0 ? (
        <details className="mt-3">
          <summary className="cursor-pointer text-sm font-semibold text-brand">
            {done.length} done
          </summary>
          <ul className="mt-2 space-y-1">
            {done.map((t) => (
              <li key={t.id} className="flex items-center gap-2 text-sm text-ink-soft">
                <button
                  type="button"
                  aria-label={`Reopen "${t.title}"`}
                  onClick={() => toggle(t.id, true)}
                  className="text-brand underline underline-offset-4"
                >
                  undo
                </button>
                <span className="line-through">{t.title}</span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {closed ? null : (
        <div className="mt-4 border-t-2 border-line pt-4">
          <Field label="Add a task" htmlFor="task-title">
            <Input
              id="task-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Apply liquid to force"
            />
          </Field>
          <div className="flex gap-3">
            <Field label="By when" htmlFor="task-due">
              <Input
                id="task-due"
                type="date"
                value={due}
                onChange={(e) => setDue(e.target.value)}
              />
            </Field>
            <Field label="How urgent">
              <ChipGroup>
                <Chip selected={!critical} onClick={() => setCritical(false)}>
                  Normal
                </Chip>
                <Chip selected={critical} onClick={() => setCritical(true)}>
                  Critical
                </Chip>
              </ChipGroup>
            </Field>
          </div>
          {error ? <Note tone="danger">{error}</Note> : null}
          <Button variant="secondary" disabled={busy || title.trim().length < 3} onClick={add}>
            {busy ? "Adding…" : "Add it"}
          </Button>
        </div>
      )}
    </Card>
  );
}
