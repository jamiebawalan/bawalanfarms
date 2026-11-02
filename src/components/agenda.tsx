"use client";

import { useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { Button, Card, Empty, cx } from "./ui";
import {
  WEEKDAYS, bucketAgenda, monthGrid, monthOf, shiftMonth,
  type AgendaItem,
} from "@/lib/domain/agenda";
import { formatDateShort } from "@/lib/domain/dates";

/**
 * The farm's week, and the farm's month.
 *
 * Two shapes of the same data, chosen by screen rather than by preference.
 * Anthony reads this on a phone standing somewhere, and wants to know what is
 * late and what is today — a list. The owners read it on a laptop and want to
 * see the shape of the month, where the work bunches and where the gaps are —
 * a grid. A 7x5 grid on a 390px screen is neither.
 */
export function Agenda({
  items,
  today,
}: {
  items: AgendaItem[];
  today: string;
}) {
  const [month, setMonth] = useState(() => monthOf(today));
  const buckets = bucketAgenda(items, today);
  const grid = monthGrid(month, items, today);

  const nothing = items.length === 0;

  return (
    <>
      {/* The phone: what is late, what is today, what is next. */}
      <div className="lg:hidden">
        <Card title="What is planned">
          {nothing ? (
            <Empty>
              Nothing planned. Work lands here when it is accepted from a
              plot&apos;s page, or added as a task.
            </Empty>
          ) : (
            <>
              <Group
                label="Overdue"
                tone="danger"
                items={buckets.overdue}
                today={today}
              />
              <Group label="Today" tone="brand" items={buckets.today} today={today} />
              <Group label="Next seven days" items={buckets.thisWeek} today={today} />
              <Group label="Later" items={buckets.later} today={today} collapsed />
            </>
          )}
        </Card>
      </div>

      {/* The laptop: the shape of the month. */}
      <div className="hidden lg:block">
        <Card
          title={grid.label}
          action={
            <div className="flex items-center gap-2">
              <span className="text-sm text-ink-soft tabular">
                {grid.count} {grid.count === 1 ? "job" : "jobs"}
              </span>
              <Button
                variant="secondary"
                size="md"
                aria-label="Previous month"
                onClick={() => setMonth(shiftMonth(month, -1))}
              >
                ‹
              </Button>
              <Button
                variant="secondary"
                size="md"
                aria-label="This month"
                onClick={() => setMonth(monthOf(today))}
              >
                Today
              </Button>
              <Button
                variant="secondary"
                size="md"
                aria-label="Next month"
                onClick={() => setMonth(shiftMonth(month, 1))}
              >
                ›
              </Button>
            </div>
          }
        >
          <div className="grid grid-cols-7 gap-px rounded-xl bg-line">
            {WEEKDAYS.map((d) => (
              <div
                key={d}
                className="bg-paper px-2 py-1 text-center text-xs font-semibold uppercase tracking-wide text-ink-soft"
              >
                {d}
              </div>
            ))}
            {grid.weeks.flat().map((day) => (
              <div
                key={day.date}
                className={cx(
                  "min-h-24 bg-paper p-1.5",
                  !day.inMonth && "bg-paper-sunk",
                  day.isToday && "ring-2 ring-inset ring-brand",
                )}
              >
                <div
                  className={cx(
                    "mb-1 text-right text-xs tabular",
                    day.isToday
                      ? "font-bold text-brand"
                      : day.inMonth
                        ? "text-ink-soft"
                        : "text-ink-soft opacity-50",
                  )}
                >
                  {Number(day.date.slice(8, 10))}
                </div>
                <ul className="space-y-1">
                  {day.items.map((i) => (
                    <li key={i.id}>
                      <Link
                        href={i.href as Route}
                        className={cx(
                          "block rounded-md px-1.5 py-1 text-xs leading-tight",
                          /*
                           * Overdue is red wherever it sits, including on a
                           * day already behind us — that is the whole reason
                           * to look at a past day at all.
                           */
                          day.isPast
                            ? "bg-danger-tint text-danger"
                            : i.isCritical
                              ? "bg-brand text-white"
                              : "bg-paper-sunk text-ink",
                        )}
                      >
                        <span className="font-semibold">{i.title}</span>
                        {i.plotLabel === null ? null : (
                          <span className="block opacity-80">
                            {i.plotLabel}
                            {i.blockName === null ? "" : ` · ${i.blockName}`}
                          </span>
                        )}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {nothing ? (
            <p className="mt-3 text-sm text-ink-soft">
              Nothing planned yet. Work lands here when it is accepted from a
              plot&apos;s page, or added as a task.
            </p>
          ) : null}
        </Card>
      </div>
    </>
  );
}

function Group({
  label, items, today, tone, collapsed = false,
}: {
  label: string;
  items: AgendaItem[];
  today: string;
  tone?: "danger" | "brand";
  collapsed?: boolean;
}) {
  const [open, setOpen] = useState(!collapsed);
  if (items.length === 0) return null;

  return (
    <div className="mb-3 last:mb-0">
      <p
        className={cx(
          "mb-1 text-sm font-bold uppercase tracking-wide",
          tone === "danger" ? "text-danger" : tone === "brand" ? "text-brand" : "text-ink-soft",
        )}
      >
        {label} · {items.length}
      </p>
      {!open ? (
        <Button variant="quiet" size="md" onClick={() => setOpen(true)}>
          Show {items.length} more
        </Button>
      ) : (
        <ul className="divide-y divide-line">
          {items.map((i) => (
            <li key={i.id}>
              <Link href={i.href as Route} className="flex items-baseline gap-2 py-3">
                {/*
                  * Critical is filled green in the grid and would be nothing
                  * at all here without this — the one piece of information on
                  * the row that says drop the others and do this.
                  */}
                {i.isCritical ? (
                  <span
                    aria-hidden
                    className="h-2 w-2 shrink-0 self-center rounded-full bg-brand"
                  />
                ) : null}
                <span className="flex-1 font-semibold text-ink">
                  {i.title}
                  {i.isCritical ? <span className="sr-only"> (critical)</span> : null}
                </span>
                <span className="text-sm text-ink-soft">
                  {i.plotLabel}
                  {i.blockName === null ? "" : ` · ${i.blockName}`}
                </span>
                {i.dueOn === today ? null : (
                  <span className="whitespace-nowrap text-sm tabular text-ink-soft">
                    {formatDateShort(i.dueOn)}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
