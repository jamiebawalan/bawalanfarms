"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Chip, ChipGroup, Empty, Field, Input, Note, cx } from "./ui";
import { Sparkline } from "./charts";
import { newId } from "@/lib/queue";
import { formatDate, formatDateShort, todayISO } from "@/lib/domain/dates";

export type Reading = { date: string; avgLengthCm: number; sampleSize: number | null };
export type PlotTask = {
  id: string;
  title: string;
  dueDate: string;
  isCritical: boolean;
  doneAt: string | null;
};

/**
 * D-leaf readings and the growth they show.
 *
 * Anthony picks ten plants at random every few weeks and measures the tallest
 * mature leaf on each. On its own a reading says how big the plants are; it is
 * the second one that matters, because the rate between them is what says when
 * the crop will be big enough to force.
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
  const [length, setLength] = useState("");
  const [count, setCount] = useState(String(sampleSize));
  const [date, setDate] = useState(today);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sorted = [...readings].sort((a, b) => a.date.localeCompare(b.date));
  const latest = sorted[sorted.length - 1] ?? null;

  async function save() {
    const cm = Number(length);
    if (!Number.isFinite(cm) || cm <= 0) return;
    setBusy(true);
    setError(null);
    const res = await fetch("/api/leaf", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        cycle_id: cycleId,
        date,
        avg_length_cm: cm,
        sample_size: Number(count) || sampleSize,
      }),
    });
    setBusy(false);
    if (res.ok) {
      setLength("");
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
          No reading yet. Measure {sampleSize} plants picked at random and record
          the average — that is what starts the clock on forcing.
        </p>
      ) : (
        <>
          <div className="flex items-baseline gap-2">
            <span className="tabular text-3xl font-bold">{latest.avgLengthCm} cm</span>
            <span className="text-ink-soft">
              on {formatDate(latest.date)}
              {latest.sampleSize ? `, ${latest.sampleSize} plants` : ""}
            </span>
          </div>
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

      {sorted.length > 1 ? (
        <details className="mb-3">
          <summary className="cursor-pointer text-sm font-semibold text-brand">
            All {sorted.length} readings
          </summary>
          <ul className="mt-2 space-y-1 text-sm text-ink-soft">
            {[...sorted].reverse().map((r) => (
              <li key={r.date} className="tabular">
                {formatDateShort(r.date)} — {r.avgLengthCm} cm
                {r.sampleSize ? ` (${r.sampleSize} plants)` : ""}
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {closed ? null : (
        <>
          <div className="flex gap-3">
            <Field label="Average D-leaf (cm)" htmlFor="dleaf">
              <Input
                id="dleaf"
                inputMode="decimal"
                value={length}
                onChange={(e) => setLength(e.target.value)}
                placeholder="e.g. 78"
              />
            </Field>
            <Field label="Plants measured" htmlFor="dleaf-n">
              <Input
                id="dleaf-n"
                inputMode="numeric"
                value={count}
                onChange={(e) => setCount(e.target.value)}
              />
            </Field>
          </div>
          <Field label="Measured on" htmlFor="dleaf-date">
            <Input
              id="dleaf-date"
              type="date"
              value={date}
              max={today}
              onChange={(e) => setDate(e.target.value)}
            />
          </Field>
          {error ? <Note tone="danger">{error}</Note> : null}
          <Button variant="secondary" disabled={busy || Number(length) <= 0} onClick={save}>
            {busy ? "Saving…" : "Record this reading"}
          </Button>
        </>
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
