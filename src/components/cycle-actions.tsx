"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Field, Input, Note } from "./ui";
import { formatDate, todayISO } from "@/lib/domain/dates";
import type { CycleStatus } from "@/lib/domain/types";

const NEXT_STATUS: Record<string, CycleStatus | null> = {
  planned: "land_prep",
  land_prep: "planted",
  planted: "growing",
  growing: "harvesting",
  harvesting: null,
};

/**
 * Moving a cycle along, recording a plant count, and closing it.
 *
 * Closing is deliberately a two-step action behind a confirmation: it freezes
 * the cycle's profit and starts a fresh ledger on that plot, which is not
 * something to do by mis-tapping.
 */
export function CycleActions({
  cycleId, status, latestCount, countHistory,
}: {
  cycleId: string;
  status: CycleStatus;
  latestCount: { date: string; count: number } | null;
  countHistory: { date: string; count: number }[];
}) {
  const router = useRouter();
  const today = todayISO();

  const [count, setCount] = useState("");
  const [countDate, setCountDate] = useState(today);
  const [confirmClose, setConfirmClose] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const next = NEXT_STATUS[status] ?? null;

  async function call(body: unknown, endpoint = "/api/cycles", method = "PATCH") {
    setBusy(true);
    setError(null);
    const res = await fetch(endpoint, {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    setBusy(false);
    if (res.ok) {
      router.refresh();
      return true;
    }
    const detail = await res.json().catch(() => ({}));
    setError(detail.error ?? "That did not work.");
    return false;
  }

  return (
    <>
      <Card title="Plant count">
        {latestCount ? (
          <p className="mb-3 text-ink-soft">
            <span className="tabular text-xl font-bold text-ink">
              {latestCount.count.toLocaleString("en-PH")}
            </span>{" "}
            counted on {formatDate(latestCount.date)}
          </p>
        ) : (
          <p className="mb-3 text-ink-soft">
            No count yet. Without one there is no cost per plant, and no dose
            suggestion when you draw fertiliser.
          </p>
        )}

        {status !== "closed" ? (
          <div className="flex items-end gap-3">
            <Field label="New count" htmlFor="count">
              <Input
                id="count"
                inputMode="numeric"
                value={count}
                onChange={(e) => setCount(e.target.value)}
                placeholder="e.g. 11500"
              />
            </Field>
            <Field label="Counted on" htmlFor="count-date">
              <Input
                id="count-date"
                type="date"
                value={countDate}
                max={today}
                onChange={(e) => setCountDate(e.target.value)}
              />
            </Field>
          </div>
        ) : null}

        {status !== "closed" ? (
          <Button
            variant="secondary"
            disabled={busy || Number(count) <= 0}
            onClick={async () => {
              const ok = await call(
                { cycle_id: cycleId, date: countDate, count: Number(count) },
                "/api/plant-counts",
                "POST",
              );
              if (ok) setCount("");
            }}
          >
            Record this count
          </Button>
        ) : null}

        {countHistory.length > 1 ? (
          <details className="mt-3">
            <summary className="cursor-pointer font-semibold text-brand">
              Earlier counts ({countHistory.length - 1})
            </summary>
            <ul className="mt-2 space-y-1 text-sm text-ink-soft">
              {countHistory.slice(1).map((c) => (
                <li key={c.date} className="tabular">
                  {formatDate(c.date)} — {c.count.toLocaleString("en-PH")}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-sm text-ink-soft">
              Counts are never overwritten. A cost from March uses March's count,
              not this one.
            </p>
          </details>
        ) : null}
      </Card>

      <Card title="Move it along">
        {error ? <Note tone="danger">{error}</Note> : null}

        {status !== "closed" ? (
          <div className="flex flex-col gap-2">
            {next ? (
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => call({ id: cycleId, action: "update", status: next })}
              >
                Mark as {next.replace("_", " ")}
              </Button>
            ) : null}

            {confirmClose ? (
              <Note tone="warn">
                <p className="mb-3">
                  Closing freezes this cycle's profit. No new costs or sales can be
                  added to it, and the plot is free for the next crop.
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="danger"
                    size="md"
                    disabled={busy}
                    onClick={() => call({ id: cycleId, action: "close" })}
                  >
                    Yes, close it
                  </Button>
                  <Button size="md" variant="secondary" onClick={() => setConfirmClose(false)}>
                    Cancel
                  </Button>
                </div>
              </Note>
            ) : (
              <Button variant="secondary" onClick={() => setConfirmClose(true)}>
                Close this cycle
              </Button>
            )}
          </div>
        ) : (
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => call({ id: cycleId, action: "reopen" })}
          >
            Reopen it
          </Button>
        )}
      </Card>
    </>
  );
}
