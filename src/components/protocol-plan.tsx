"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Chip, ChipGroup, Empty, Note } from "./ui";
import { newId, send } from "@/lib/queue";

export type PlanSuggestion = {
  code: string;
  title: string;
  instruction: string;
  category: string;
  /** The protocol's month for this round. */
  mapMonth: number;
  /** How it sits against where the block actually is. */
  timing: string;
  tone: "late" | "due" | "ahead";
  condition: string | null;
  /** The alternatives, when this is one decision with options. */
  options: { code: string; title: string; condition: string | null }[];
  doses: { name: string; display: string; note: string | null }[];
  /** What the doses could not be worked out from. */
  missing: "plants" | "area" | null;
};

export type PlanAnswered = {
  code: string;
  title: string;
  mapMonth: number;
  state: "done" | "skipped";
  skipReason: string | null;
  doneOn: string | null;
};

const SKIP_REASONS = [
  { value: "already_done", label: "Already did it" },
  { value: "not_needed", label: "Not needed here" },
  { value: "no_material", label: "No material" },
  { value: "too_late", label: "Too late now" },
] as const;

/** How many sit open before he has to ask for the rest. */
const SHOWN = 2;

/**
 * What the protocol says to do on this block, and what he did about it.
 *
 * Deliberately short. The protocol has sixty-six activities and a plot in
 * month five is arguably behind on a dozen; a list of twelve is a list nobody
 * reads, and a list nobody reads is worse than no list because it looks like
 * the farm has a plan. Two are open, the rest are one tap away, and anything
 * overtaken by a later round of its own programme is gone entirely.
 *
 * Nothing here schedules itself. Every row is a question with three honest
 * answers, including the one the farm needs most: that the work was done
 * months ago and the app simply did not know.
 */
export function ProtocolPlan({
  cycleId,
  subPlotId,
  blockName,
  mapMonth,
  suggestions,
  answered,
  closed,
  loaded,
}: {
  cycleId: string;
  subPlotId: string | null;
  blockName: string | null;
  mapMonth: number | null;
  suggestions: PlanSuggestion[];
  answered: PlanAnswered[];
  closed: boolean;
  loaded: boolean;
}) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [asking, setAsking] = useState<string | null>(null);
  const [chosen, setChosen] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);

  if (!loaded) {
    return (
      <Card title="What the protocol says">
        <Note tone="warn">
          The protocol is not loaded on this farm yet.
        </Note>
      </Card>
    );
  }

  if (mapMonth === null) {
    return (
      <Card title="What the protocol says">
        <Empty>
          Set this {blockName === null ? "plot" : "block"}&rsquo;s growth stage and the
          protocol can say what is due. The stage is what the plants have reached, not
          how long they have been in the ground.
        </Empty>
      </Card>
    );
  }

  const answer = async (
    code: string,
    state: "done" | "skipped",
    skipReason?: string,
  ) => {
    setBusy(code);
    setError(null);
    const result = await send({
      id: newId(),
      endpoint: "/api/protocol",
      body: {
        cycle_id: cycleId,
        sub_plot_id: subPlotId,
        activity_code: code,
        state,
        ...(skipReason === undefined ? {} : { skip_reason: skipReason }),
      },
      describe: `${state === "done" ? "Did" : "Skipped"} ${code}`,
    });
    setBusy(null);
    setAsking(null);
    if (result.ok || ("queued" in result && result.queued)) {
      router.refresh();
      return;
    }
    if ("error" in result) setError(result.error);
  };

  const undo = async (code: string) => {
    setBusy(code);
    setError(null);
    const params = new URLSearchParams({ cycle_id: cycleId, activity_code: code });
    if (subPlotId !== null) params.set("sub_plot_id", subPlotId);
    const res = await fetch(`/api/protocol?${params.toString()}`, { method: "DELETE" });
    setBusy(null);
    if (res.ok) {
      router.refresh();
      return;
    }
    const detail = await res.json().catch(() => ({ error: "Could not undo" }));
    setError(detail.error ?? "Could not undo");
  };

  const visible = expanded ? suggestions : suggestions.slice(0, SHOWN);
  const hidden = suggestions.length - visible.length;

  const stage = `Month ${round1(mapMonth)}`;

  return (
    <Card
      title={blockName ?? "What the protocol says"}
      action={
        <span className="whitespace-nowrap rounded-lg bg-paper-sunk px-2 py-1 text-sm font-semibold tabular text-ink-soft">
          {stage}
        </span>
      }
    >
      {error === null ? null : <Note tone="danger">{error}</Note>}

      {suggestions.length === 0 ? (
        <Empty>Nothing due on the protocol at month {round1(mapMonth)}.</Empty>
      ) : (
        <ul className="divide-y divide-line">
          {visible.map((s) => {
            const pick = chosen[s.code] ?? s.code;
            const option = s.options.find((o) => o.code === pick) ?? null;
            return (
              <li key={s.code} className="py-4 first:pt-0">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span className="font-semibold text-ink">
                    {option === null ? s.title : option.title}
                  </span>
                  <Timing tone={s.tone} timing={s.timing} mapMonth={s.mapMonth} />
                </div>
                <p className="mt-1 text-sm text-ink-soft">{s.category}</p>

                {/*
                  * The condition goes above the options, not below them. Below,
                  * it reads as a caption on whichever chip it happens to sit
                  * under — which is the one he did not pick.
                  */}
                {(option?.condition ?? s.condition) === null ? null : (
                  <Note tone="info">{option?.condition ?? s.condition}</Note>
                )}

                {s.options.length > 1 ? (
                  <div className="mt-3">
                    <p className="mb-2 text-sm text-ink-soft">
                      One of these, not both:
                    </p>
                    <ChipGroup>
                      {s.options.map((o) => (
                        <Chip
                          key={o.code}
                          selected={pick === o.code}
                          onClick={() =>
                            setChosen((c) => ({ ...c, [s.code]: o.code }))
                          }
                        >
                          {o.title}
                        </Chip>
                      ))}
                    </ChipGroup>
                  </div>
                ) : null}

                <p className="mt-2 text-sm text-ink-soft">{s.instruction}</p>

                {s.missing !== null ? (
                  <Note tone="warn">
                    {s.missing === "plants"
                      ? "Needs a plant count before the app can say how much to mix."
                      : "Needs the plot area before the app can say how much to mix."}
                  </Note>
                ) : s.doses.length === 0 ? null : (
                  /* Capped: on a laptop an uncapped row strands the figure a
                     hand's width from the name it belongs to. */
                  <dl className="mt-3 max-w-md rounded-xl bg-paper-sunk p-3">
                    {s.doses.map((d) => (
                      <div key={d.name} className="flex justify-between gap-3 py-0.5">
                        <dt className="text-sm text-ink-soft">{d.name}</dt>
                        <dd className="text-sm font-semibold tabular text-ink">
                          {d.display}
                        </dd>
                      </div>
                    ))}
                  </dl>
                )}

                {closed ? null : asking === s.code ? (
                  <div className="mt-3">
                    <p className="mb-2 text-sm text-ink-soft">Why not?</p>
                    <ChipGroup>
                      {SKIP_REASONS.map((r) => (
                        <Chip
                          key={r.value}
                          disabled={busy !== null}
                          onClick={() => void answer(pick, "skipped", r.value)}
                        >
                          {r.label}
                        </Chip>
                      ))}
                    </ChipGroup>
                    <Button
                      variant="quiet"
                      size="md"
                      className="mt-2"
                      onClick={() => setAsking(null)}
                    >
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      size="md"
                      disabled={busy !== null}
                      onClick={() => void answer(pick, "done")}
                    >
                      {busy === pick ? "Saving…" : "Did it"}
                    </Button>
                    <Button
                      variant="secondary"
                      size="md"
                      disabled={busy !== null}
                      onClick={() => setAsking(s.code)}
                    >
                      Not this one
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {hidden > 0 ? (
        <Button variant="quiet" className="mt-3" onClick={() => setExpanded(true)}>
          Show {hidden} more {hidden === 1 ? "thing" : "things"} the protocol lists
        </Button>
      ) : expanded && suggestions.length > SHOWN ? (
        <Button variant="quiet" className="mt-3" onClick={() => setExpanded(false)}>
          Show fewer
        </Button>
      ) : null}

      {answered.length === 0 ? null : (
        <div className="mt-4 border-t border-line pt-3">
          <Button variant="quiet" onClick={() => setShowDone((v) => !v)}>
            {showDone ? "Hide" : "Show"} {answered.length} already answered
          </Button>
          {!showDone ? null : (
            <ul className="mt-3 divide-y divide-line">
              {answered.map((a) => (
                <li key={a.code} className="flex flex-wrap items-baseline gap-x-2 py-2">
                  <span className="text-sm text-ink">{a.title}</span>
                  <span className="text-xs text-ink-soft tabular">
                    month {round1(a.mapMonth)}
                  </span>
                  <span className="text-xs font-semibold text-ink-soft">
                    {describeAnswer(a)}
                  </span>
                  {closed || a.skipReason === "superseded" ? null : (
                    <Button
                      variant="quiet"
                      size="md"
                      className="ml-auto"
                      disabled={busy !== null}
                      onClick={() => void undo(a.code)}
                    >
                      Undo
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Card>
  );
}

/**
 * The protocol's month, and how the block sits against it.
 *
 * Both, always. "Month 5" alone means nothing to someone standing in a field,
 * and "a month late" alone hides which round is late. Together they say the
 * whole thing in four words.
 */
function Timing({
  tone, timing, mapMonth,
}: {
  tone: "late" | "due" | "ahead";
  timing: string;
  mapMonth: number;
}) {
  return (
    <span className="inline-flex items-baseline gap-1.5 text-sm">
      <span className="text-ink-soft tabular">month {round1(mapMonth)}</span>
      <span
        className={
          tone === "late"
            ? "font-semibold text-danger"
            : tone === "due"
              ? "font-semibold text-brand"
              : "text-ink-soft"
        }
      >
        · {timing}
      </span>
    </span>
  );
}

function describeAnswer(a: PlanAnswered): string {
  if (a.state === "done") return "did it";
  switch (a.skipReason) {
    case "already_done":
      return "already done";
    case "no_material":
      return "no material";
    case "too_late":
      return "too late";
    case "superseded":
      return "overtaken by a later round";
    default:
      return "not needed";
  }
}

/** Months read as 5 and 12.5, never 5.0 or 12.50. */
function round1(n: number): string {
  return String(Math.round(n * 10) / 10);
}
