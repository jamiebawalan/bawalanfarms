"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  AmountInput, Button, Card, Chip, ChipGroup, Empty, Field, Input, Note,
} from "./ui";
import { newId, send } from "@/lib/queue";
import { addDays, formatDateShort, todayISO } from "@/lib/domain/dates";

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
  /** How to load the knapsack, for anything sprayed. Null for granules. */
  tank: TankPlanView | null;
};

export type TankPlanView = {
  tankLitres: number;
  waterLitres: number;
  mlPerPlant: number;
  plantsPerTank: number;
  fullTanks: number;
  lastTankPlants: number;
  warning: string | null;
  lines: {
    name: string;
    display: string;
    premix: { totalDisplay: string; dissolveInMl: number; perTankMl: number } | null;
  }[];
};

export type DrawLineView = {
  materialName: string;
  /** What the protocol asked for, as the field reads it: "6.68 kg". */
  wanted: string;
  unit: string | null;
  draws: { purchaseId: string; quantity: number; lotDate: string }[];
  shortfall: number;
  untracked: boolean;
};

export type PlanAnswered = {
  code: string;
  title: string;
  mapMonth: number;
  state: "scheduled" | "done" | "skipped";
  skipReason: string | null;
  dueOn: string | null;
  doneOn: string | null;
  /** What finishing this would take out of stock. Proposed, never applied. */
  proposal: DrawLineView[];
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
  const [planning, setPlanning] = useState<string | null>(null);
  const [when, setWhen] = useState("");
  const [chosen, setChosen] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);
  const [settingStage, setSettingStage] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [drawAmounts, setDrawAmounts] = useState<Record<string, string>>({});
  const [takeStock, setTakeStock] = useState(true);
  const [stage, setStage] = useState(mapMonth === null ? "" : String(mapMonth));

  if (!loaded) {
    return (
      <Card title="What the protocol says">
        <Note tone="warn">
          The protocol is not loaded on this farm yet.
        </Note>
      </Card>
    );
  }

  const saveStage = async (months: number | null) => {
    setBusy("stage");
    setError(null);
    const res = await fetch("/api/protocol", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        cycle_id: cycleId,
        sub_plot_id: subPlotId,
        map_month: months,
      }),
    });
    setBusy(null);
    if (res.ok) {
      setSettingStage(false);
      router.refresh();
      return;
    }
    const detail = await res.json().catch(() => ({ error: "Could not save" }));
    setError(detail.error ?? "Could not save");
  };

  const stageField = (
    <div className="max-w-md">
      <Field
        label={`What month is this ${blockName === null ? "plot" : "block"} at?`}
        htmlFor={`stage-${subPlotId ?? "cycle"}`}
        hint={
          "The stage the plants have reached, not how long since planting. " +
          "A plot put in last December can be at month 8. Land prep is a " +
          "negative number: -4 is four months before planting."
        }
      >
        <AmountInput
          id={`stage-${subPlotId ?? "cycle"}`}
          inputMode="decimal"
          value={stage}
          onChange={(e) => setStage(e.target.value)}
          /*
           * No placeholder. A greyed "5" next to a disabled Save reads as a
           * filled field that will not save, and the question is already in
           * the label above it.
           */
        />
      </Field>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button
          size="md"
          disabled={busy !== null || stage.trim() === "" || Number.isNaN(Number(stage))}
          onClick={() => void saveStage(Number(stage))}
        >
          {busy === "stage" ? "Saving…" : "Set the stage"}
        </Button>
        {mapMonth === null ? null : (
          <Button
            variant="secondary"
            size="md"
            disabled={busy !== null}
            onClick={() => setSettingStage(false)}
          >
            Cancel
          </Button>
        )}
      </div>
    </div>
  );

  if (mapMonth === null) {
    return (
      <Card title={blockName ?? "What the protocol says"}>
        {error === null ? null : <Note tone="danger">{error}</Note>}
        <p className="mb-3 text-ink-soft">
          Set this {blockName === null ? "plot" : "block"}&rsquo;s growth stage and the
          protocol can say what is due.
        </p>
        {stageField}
      </Card>
    );
  }

  const answer = async (
    code: string,
    state: "scheduled" | "done" | "skipped",
    extra: {
      skipReason?: string;
      dueOn?: string;
      draws?: { purchase_id: string; quantity: number }[];
    } = {},
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
        ...(extra.skipReason === undefined ? {} : { skip_reason: extra.skipReason }),
        ...(extra.dueOn === undefined ? {} : { due_on: extra.dueOn }),
        ...(extra.draws === undefined ? {} : { draws: extra.draws }),
      },
      describe:
        state === "scheduled"
          ? `Planned ${code}`
          : `${state === "done" ? "Did" : "Skipped"} ${code}`,
    });
    setBusy(null);
    setAsking(null);
    setPlanning(null);
    setConfirming(null);
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

  /*
   * Planned work is not "answered" — it is the farm's commitment, and it is
   * the only list with a date on it. It sits open above the settled items,
   * which are history and stay folded away.
   */
  const planned = answered
    .filter((a) => a.state === "scheduled")
    .sort((a, b) => (a.dueOn ?? "9999").localeCompare(b.dueOn ?? "9999"));
  const settled = answered.filter((a) => a.state !== "scheduled");
  const today = todayISO();

  const visible = expanded ? suggestions : suggestions.slice(0, SHOWN);
  const hidden = suggestions.length - visible.length;

  const stageLabel = `Month ${round1(mapMonth)}`;

  return (
    <Card
      title={blockName ?? "What the protocol says"}
      action={
        <button
          type="button"
          onClick={() => {
            setStage(String(round1(mapMonth)));
            setSettingStage((v) => !v);
          }}
          className="whitespace-nowrap rounded-lg bg-paper-sunk px-2 py-1 text-sm font-semibold tabular text-ink-soft underline decoration-dotted underline-offset-4"
        >
          {stageLabel}
        </button>
      }
    >
      {error === null ? null : <Note tone="danger">{error}</Note>}

      {!settingStage ? null : <div className="mb-4">{stageField}</div>}

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

                {s.tank === null ? null : <TankPlanDetails tank={s.tank} />}

                {closed ? null : asking === s.code ? (
                  <div className="mt-3">
                    <p className="mb-2 text-sm text-ink-soft">Why not?</p>
                    <ChipGroup>
                      {SKIP_REASONS.map((r) => (
                        <Chip
                          key={r.value}
                          disabled={busy !== null}
                          onClick={() =>
                            void answer(pick, "skipped", { skipReason: r.value })
                          }
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
                ) : planning === s.code ? (
                  <div className="mt-3">
                    <Field label="When will you do it?" htmlFor={`when-${s.code}`}>
                      <Input
                        id={`when-${s.code}`}
                        type="date"
                        value={when}
                        onChange={(e) => setWhen(e.target.value)}
                      />
                    </Field>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button
                        size="md"
                        disabled={busy !== null || when === ""}
                        onClick={() => void answer(pick, "scheduled", { dueOn: when })}
                      >
                        {busy === pick ? "Saving…" : "Add to the plan"}
                      </Button>
                      <Button
                        variant="secondary"
                        size="md"
                        disabled={busy !== null}
                        onClick={() => setPlanning(null)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      size="md"
                      disabled={busy !== null}
                      onClick={() => {
                        /*
                         * A week out by default, not today. Nothing here can
                         * be done the moment it is agreed — the material has
                         * to be bought and the crew booked — and defaulting
                         * to today would fill the calendar with dates nobody
                         * meant.
                         */
                        setWhen(addDays(todayISO(), 7));
                        setAsking(null);
                        setPlanning(s.code);
                      }}
                    >
                      Plan to do it
                    </Button>
                    <Button
                      variant="secondary"
                      size="md"
                      disabled={busy !== null}
                      onClick={() => {
                        setPlanning(null);
                        setAsking(s.code);
                      }}
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

      {planned.length === 0 ? null : (
        <div className="mt-4 border-t border-line pt-3">
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-soft">
            Planned
          </h3>
          <ul className="divide-y divide-line">
            {planned.map((a) => {
              const late = a.dueOn !== null && a.dueOn < today;
              return (
                <li key={a.code} className="py-3">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-semibold text-ink">{a.title}</span>
                    <span
                      className={
                        late
                          ? "text-sm font-semibold text-danger"
                          : "text-sm text-ink-soft"
                      }
                    >
                      {a.dueOn === null
                        ? "no date"
                        : `by ${formatDateShort(a.dueOn)}${late ? " · overdue" : ""}`}
                    </span>
                  </div>
                  {closed ? null : confirming === a.code ? (
                    <DrawConfirm
                      lines={a.proposal}
                      amounts={drawAmounts}
                      setAmounts={setDrawAmounts}
                      takeStock={takeStock}
                      setTakeStock={setTakeStock}
                      busy={busy !== null}
                      onCancel={() => setConfirming(null)}
                      onConfirm={() =>
                        void answer(a.code, "done", {
                          draws: takeStock ? collectDraws(a.proposal, drawAmounts) : [],
                        })
                      }
                    />
                  ) : (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button
                        size="md"
                        disabled={busy !== null}
                        onClick={() => {
                          if (a.proposal.length === 0) {
                            void answer(a.code, "done");
                            return;
                          }
                          setDrawAmounts(seedAmounts(a.proposal));
                          setTakeStock(true);
                          setConfirming(a.code);
                        }}
                      >
                        {busy === a.code ? "Saving…" : "Did it"}
                      </Button>
                      <Button
                        variant="quiet"
                        size="md"
                        disabled={busy !== null}
                        onClick={() => void undo(a.code)}
                      >
                        Take off the plan
                      </Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {settled.length === 0 ? null : (
        <div className="mt-4 border-t border-line pt-3">
          <Button variant="quiet" onClick={() => setShowDone((v) => !v)}>
            {showDone ? "Hide" : "Show"} {settled.length} already answered
          </Button>
          {!showDone ? null : (
            <ul className="mt-3 divide-y divide-line">
              {settled.map((a) => (
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
  if (a.state === "scheduled") return "planned";
  if (a.state === "done") {
    return a.dueOn !== null && a.doneOn !== null && a.doneOn > a.dueOn
      ? `did it, ${formatDateShort(a.doneOn)} — planned for ${formatDateShort(a.dueOn)}`
      : "did it";
  }
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

/**
 * How to load the knapsack, folded away until he asks.
 *
 * The plot total above answers "how much do I buy". This answers "what goes
 * in the tank", which is a different question asked at a different moment —
 * at the store versus standing over the sprayer — and showing both at once
 * on a phone buries the one he came for.
 */
function TankPlanDetails({ tank }: { tank: TankPlanView }) {
  const tanks = tank.fullTanks + (tank.lastTankPlants > 0 ? 1 : 0);
  const premixed = tank.lines.filter((l) => l.premix !== null);

  return (
    <details className="mt-3">
      <summary className="cursor-pointer text-sm font-semibold text-brand">
        How to mix it — {tanks} {tanks === 1 ? "tank" : "tanks"} of{" "}
        {tank.tankLitres} L
      </summary>

      <div className="mt-2 max-w-md">
        {tank.warning === null ? null : <Note tone="warn">{tank.warning}</Note>}

        <p className="text-sm text-ink-soft">
          {tank.waterLitres} L of water over the whole block, which is{" "}
          {tank.mlPerPlant} ml a plant. One {tank.tankLitres} L tank covers{" "}
          <strong className="text-ink">{tank.plantsPerTank} plants</strong> — spray
          exactly that many and the tank should run out as you finish them.
        </p>

        <dl className="mt-2 rounded-xl bg-paper-sunk p-3">
          {tank.lines.map((l) => (
            <div key={l.name} className="flex justify-between gap-3 py-0.5">
              <dt className="text-sm text-ink-soft">{l.name}</dt>
              <dd className="text-sm font-semibold tabular text-ink">
                {l.premix === null ? l.display : `${l.premix.perTankMl} ml of premix`}
              </dd>
            </div>
          ))}
        </dl>
        <p className="mt-1 text-sm text-ink-soft">
          Per tank, in this order, each dissolved before the next. Urea last.
        </p>

        {premixed.length === 0 ? null : (
          <div className="mt-3">
            <h4 className="text-sm font-semibold text-ink">Premix first</h4>
            <p className="text-sm text-ink-soft">
              Too little to weigh at the sprayer. Weigh each one once for the whole
              block, dissolve it, and pour the same measure into every tank.
            </p>
            <ul className="mt-1 list-disc pl-5">
              {premixed.map((l) => (
                <li key={l.name} className="text-sm text-ink-soft">
                  <strong className="text-ink">{l.name}</strong>:{" "}
                  {l.premix!.totalDisplay} in {l.premix!.dissolveInMl / 1000} L of
                  water, then {l.premix!.perTankMl} ml per tank.
                </li>
              ))}
            </ul>
          </div>
        )}

        {tank.lastTankPlants === 0 ? null : (
          <p className="mt-2 text-sm text-ink-soft">
            The last tank covers {tank.lastTankPlants} plants, not{" "}
            {tank.plantsPerTank} — mix it at about{" "}
            {Math.round((tank.lastTankPlants / tank.plantsPerTank) * 100)}% of the
            amounts above.
          </p>
        )}
      </div>
    </details>
  );
}

/** The proposed quantities, as strings he can correct. */
function seedAmounts(lines: DrawLineView[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of lines) {
    for (const d of line.draws) out[d.purchaseId] = String(d.quantity);
  }
  return out;
}

/** What he confirmed, dropping anything he zeroed out. */
function collectDraws(
  lines: DrawLineView[],
  amounts: Record<string, string>,
): { purchase_id: string; quantity: number }[] {
  return lines.flatMap((line) =>
    line.draws.flatMap((d) => {
      const n = Number(amounts[d.purchaseId] ?? d.quantity);
      return Number.isFinite(n) && n > 0
        ? [{ purchase_id: d.purchaseId, quantity: n }]
        : [];
    }),
  );
}

/**
 * What finishing this would take out of the shed.
 *
 * Proposed, never applied. The arithmetic is worth doing for him — 6.68 kg
 * of urea out of a 50 kg sack is 0.134 of a sack, split across two lots at
 * different prices — but the figures in the shed are only as good as the
 * last count, and silently deducting would turn a counting error into a
 * costing error on a plot's P&L. He is the one who knows what actually came
 * out, so every number here is editable and the whole thing can be waved
 * off without stopping the work being recorded.
 */
export function DrawConfirm({
  lines, amounts, setAmounts, takeStock, setTakeStock, busy, onCancel, onConfirm,
}: {
  lines: DrawLineView[];
  amounts: Record<string, string>;
  setAmounts: (next: Record<string, string>) => void;
  takeStock: boolean;
  setTakeStock: (next: boolean) => void;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const short = lines.filter((l) => l.shortfall > 0);
  const untracked = lines.filter((l) => l.untracked);

  return (
    <div className="mt-3 max-w-md rounded-xl border-2 border-line p-3">
      <h4 className="text-sm font-semibold text-ink">Take this out of stock?</h4>
      <p className="mt-1 text-sm text-ink-soft">
        Worked out from the protocol and this block&rsquo;s plant count. Change
        anything that is not what actually came out.
      </p>

      <ul className="mt-3 space-y-3">
        {lines.map((line) => (
          <li key={line.materialName}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="font-semibold text-ink">{line.materialName}</span>
              <span className="text-sm text-ink-soft tabular">{line.wanted}</span>
            </div>
            {line.untracked ? (
              <p className="text-sm text-ink-soft">Not tracked in stock.</p>
            ) : (
              line.draws.map((d) => (
                <div key={d.purchaseId} className="mt-1 flex items-center gap-2">
                  <Input
                    aria-label={`${line.materialName} from the lot of ${formatDateShort(d.lotDate)}`}
                    inputMode="decimal"
                    className="max-w-28 tabular"
                    value={amounts[d.purchaseId] ?? String(d.quantity)}
                    onChange={(e) =>
                      setAmounts({ ...amounts, [d.purchaseId]: e.target.value })
                    }
                    disabled={!takeStock}
                  />
                  <span className="text-sm text-ink-soft">
                    {line.unit} from {formatDateShort(d.lotDate)}
                  </span>
                </div>
              ))
            )}
          </li>
        ))}
      </ul>

      {short.length === 0 ? null : (
        <Note tone="warn">
          Not enough in stock for{" "}
          {short.map((l) => l.materialName).join(", ")}. Either the shed is
          emptier than the app thinks, or a purchase was never entered. The work
          still gets recorded.
        </Note>
      )}
      {untracked.length === 0 ? null : (
        <p className="mt-2 text-sm text-ink-soft">
          {untracked.map((l) => l.materialName).join(", ")} is not tracked in
          stock, so nothing is taken for it.
        </p>
      )}

      <label className="mt-3 flex items-center gap-2 text-sm text-ink">
        <input
          type="checkbox"
          checked={takeStock}
          onChange={(e) => setTakeStock(e.target.checked)}
          className="h-5 w-5"
        />
        Take it out of stock
      </label>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="md" disabled={busy} onClick={onConfirm}>
          {busy ? "Saving…" : takeStock ? "Done, take the stock" : "Done, leave stock alone"}
        </Button>
        <Button variant="secondary" size="md" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
