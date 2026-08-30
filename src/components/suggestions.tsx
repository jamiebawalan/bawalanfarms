"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Card, Empty, Note } from "./ui";
import { newId } from "@/lib/queue";
import { formatDateShort } from "@/lib/domain/dates";

export type Suggestion = {
  title: string;
  dueDate: string;
  isCritical: boolean;
  reason: string;
  restsOn: { id: string; text: string } | null;
  isTrial: boolean;
};

/**
 * Claude reads the plot and says what to do about it.
 *
 * Nothing it says is saved on its own. Each suggestion sits here with its
 * reasoning until the manager taps "Add it", at which point it becomes an
 * ordinary task he owns — same as one he typed. He can also read exactly what
 * Claude was shown, because advice you cannot check is advice you should not
 * follow.
 */
export function Suggestions({
  cycleId,
  plotId,
}: {
  cycleId: string;
  plotId: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [asked, setAsked] = useState(false);
  const [items, setItems] = useState<Suggestion[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [briefing, setBriefing] = useState<string | null>(null);
  const [added, setAdded] = useState<string[]>([]);

  async function ask() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/suggest", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ cycle_id: cycleId }),
    }).catch(() => null);
    setBusy(false);

    if (res === null) {
      setError("Could not reach the farm office. Try again where there is signal.");
      return;
    }
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(body.error ?? "Could not get suggestions.");
      return;
    }
    setAsked(true);
    setAdded([]);
    setItems(body.suggestions ?? []);
    setNote(body.note ?? null);
    setBriefing(body.briefing ?? null);
  }

  async function accept(s: Suggestion) {
    const res = await fetch("/api/tasks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: newId(),
        plot_id: plotId,
        cycle_id: cycleId,
        title: s.title,
        due_date: s.dueDate,
        is_critical: s.isCritical,
        note: s.restsOn === null ? s.reason : `${s.reason} [${s.restsOn.id}]`,
      }),
    });
    if (res.ok) {
      setAdded((prev) => [...prev, s.title]);
      router.refresh();
    } else {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Could not add that task.");
    }
  }

  return (
    <Card
      title="Ask Claude"
      action={
        <Button variant="secondary" disabled={busy} onClick={ask}>
          {busy ? "Reading the plot…" : asked ? "Ask again" : "What should we do here?"}
        </Button>
      }
    >
      {error ? <Note tone="danger">{error}</Note> : null}

      {busy ? (
        <p className="text-sm text-ink-soft">
          Looking at the D-leaf readings, the costs and the work logged here. This takes
          a few seconds.
        </p>
      ) : null}

      {!busy && !asked && error === null ? (
        <Empty>
          Claude reads the D-leaf readings, costs and recent work on this plot
          against{" "}
          <Link href="/knowledge" className="font-semibold text-brand">
            what the farm knows
          </Link>
          , and suggests what to do next. Nothing is saved unless you add it.
        </Empty>
      ) : null}

      {!busy && asked && items.length === 0 ? (
        <Empty>Nothing to suggest — the plot looks to be on track.</Empty>
      ) : null}

      {!busy && items.length > 0 ? (
        <ul className="divide-y-2 divide-line">
          {items.map((s) => (
            <SuggestionRow
              key={s.title}
              suggestion={s}
              added={added.includes(s.title)}
              onAccept={() => accept(s)}
            />
          ))}
        </ul>
      ) : null}

      {note ? <Note tone="warn">{note}</Note> : null}

      {briefing ? (
        <details className="mt-4">
          <summary className="cursor-pointer text-sm font-semibold text-brand">
            What Claude was told
          </summary>
          <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded-lg bg-paper-sunk p-3 text-xs text-ink-soft">
            {briefing}
          </pre>
        </details>
      ) : null}
    </Card>
  );
}

/**
 * One suggestion, with the reasoning that produced it.
 *
 * The reason is not decoration. It is the only thing that lets him tell a
 * suggestion worth acting on from one built on a reading nobody took.
 */
export function SuggestionRow({
  suggestion,
  added,
  onAccept,
}: {
  suggestion: Suggestion;
  added: boolean;
  onAccept: () => void;
}) {
  return (
    <li className="py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="font-semibold">
            {suggestion.isCritical ? (
              <span className="mr-1.5 rounded bg-danger-tint px-1.5 py-0.5 text-xs font-bold uppercase text-danger">
                Critical
              </span>
            ) : null}
            {suggestion.isTrial ? (
              <span className="mr-1.5 rounded bg-warn-tint px-1.5 py-0.5 text-xs font-bold uppercase text-warn">
                Trial
              </span>
            ) : null}
            {suggestion.title}
          </div>
          <p className="mt-1 text-sm text-ink-soft">{suggestion.reason}</p>
          {suggestion.restsOn ? (
            <p className="mt-1 text-xs text-ink-soft">
              <span className="font-semibold">{suggestion.restsOn.id}</span>{" "}
              {suggestion.restsOn.text}
            </p>
          ) : null}
        </div>
        <span className="shrink-0 text-sm text-ink-soft">
          {formatDateShort(suggestion.dueDate)}
        </span>
      </div>
      <div className="mt-2">
        {added ? (
          <span className="text-sm font-semibold text-brand">Added to the list</span>
        ) : (
          <Button variant="secondary" onClick={onAccept}>
            Add it
          </Button>
        )}
      </div>
    </li>
  );
}
