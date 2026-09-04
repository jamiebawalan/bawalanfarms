"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AmountInput, Button, Card, Chip, ChipGroup, Field, Input, Money, Note, cx,
} from "./ui";
import { newId, send } from "@/lib/queue";
import { formatPeso, lineTotal, parsePeso } from "@/lib/domain/money";
import { formatDate, todayISO } from "@/lib/domain/dates";
import { areaPercentages, splitByPercent } from "@/lib/domain/split";
import {
  EXPENSE_CATEGORIES, FARM_WIDE_REASONS, LABOUR_MODES,
  type Activity, type Attribution, type ExpenseCategory, type FarmWideReason,
  type LabourMode,
} from "@/lib/domain/types";

export type FormPlot = {
  id: string;
  code: string;
  label: string;
  areaSqm: number | null;
  /** The cycle live on this plot today, for the "goes to" line under the chips. */
  openCycle: { id: string; crop: string } | null;
};

type Scope = "plots" | "farm_wide" | "capital";

/**
 * A cost already in the books, opened to be corrected.
 *
 * Everything the form asks for, as it was saved — so the screen he corrects on
 * is the screen he entered on, already filled in, and he changes the one thing
 * that was wrong rather than reconstructing the entry from memory.
 */
export type ExistingExpense = {
  id: string;
  date: string;
  category: ExpenseCategory;
  activity: string;
  activityOtherNote: string | null;
  attribution: Attribution;
  farmWideReason: FarmWideReason | null;
  labourMode: LabourMode | null;
  unitPriceCentavos: number | null;
  quantity: number | null;
  amountCentavos: number;
  paidTo: string | null;
  note: string | null;
  allocations: { plotId: string; amountCentavos: number }[];
  capitalAsset: { name: string; usefulLifeMonths: number } | null;
  /** When it was last corrected, if it has been. */
  revisedAt: string | null;
};

/**
 * The stored split, as percentages, so the share boxes open showing the split
 * that is actually in the books rather than what the areas would have
 * suggested. He overruled the areas once; the correction screen must not
 * quietly put them back.
 */
export function storedShares(existing: ExistingExpense | null | undefined): Record<string, string> {
  if (!existing || existing.allocations.length < 2) return {};
  const total = existing.allocations.reduce((a, l) => a + l.amountCentavos, 0);
  if (total <= 0) return {};
  const out: Record<string, string> = {};
  for (const a of existing.allocations) {
    out[a.plotId] = String(Math.round((a.amountCentavos / total) * 1000) / 10);
  }
  return out;
}

/**
 * Logging a cost, in four taps: activity, plots, amount, save.
 *
 * Everything else on this screen is either inferred or only appears once it is
 * relevant. The farm manager has no accounting background, is busy, and will
 * abandon anything long. So:
 *
 *  - the activity sets the category, and the category is shown rather than asked
 *  - the date is today unless he says otherwise
 *  - plots are chips, never text, because "24/2" typed into Excel became a date
 *    and quietly corrupted thirteen rows
 *  - picking two or more plots turns the entry into a split and shows the peso
 *    result before he saves, so he can see it and correct it
 *  - after a labour entry it offers to log the crew's food against the same
 *    plots, which is the single fix for the largest gap in the old data
 */
export function ExpenseForm({
  plots, activities, recentActivities, prefill, existing, returnTo,
}: {
  plots: FormPlot[];
  activities: Activity[];
  recentActivities: string[];
  prefill?: { activity?: string; plotIds?: string[]; note?: string } | null;
  /** Set when correcting a cost that is already in the books. */
  existing?: ExistingExpense | null;
  /**
   * Where he was before he came here. Logging a cost is something he does in
   * the middle of doing something else — looking at a plot — and dropping him
   * on Today afterwards makes him find his way back every time.
   */
  returnTo?: { href: string; label: string } | null;
}) {
  const router = useRouter();
  const today = todayISO();
  const correcting = existing != null;

  // Navigating away renders a whole dashboard on the server, which over farm
  // signal is a second or three of nothing happening. Without this the button
  // reads as dead and gets tapped again.
  const [leaving, startLeaving] = useTransition();
  const goHome = () => startLeaving(() => router.push("/"));
  const goBack = () =>
    startLeaving(() =>
      router.push((returnTo?.href ?? "/") as Parameters<typeof router.push>[0]),
    );

  const [date, setDate] = useState(existing?.date ?? today);
  const [confirmedFuture, setConfirmedFuture] = useState(false);
  const [activity, setActivity] = useState<string>(
    existing?.activity ?? prefill?.activity ?? "",
  );
  const [showAllActivities, setShowAllActivities] = useState(false);
  const [otherNote, setOtherNote] = useState(existing?.activityOtherNote ?? "");
  const [category, setCategory] = useState<ExpenseCategory | null>(
    existing?.category ?? null,
  );
  // A saved entry's category is a decision already taken, possibly against the
  // activity's default. It is shown as chosen, not re-derived.
  const [categoryTouched, setCategoryTouched] = useState(correcting);

  const [scope, setScope] = useState<Scope>(
    existing == null ? "plots"
    : existing.attribution === "farm_wide" ? "farm_wide"
    : existing.attribution === "capital" ? "capital"
    : "plots",
  );
  const [plotIds, setPlotIds] = useState<string[]>(
    existing ? existing.allocations.map((a) => a.plotId) : prefill?.plotIds ?? [],
  );
  const [reason, setReason] = useState<FarmWideReason | null>(
    existing?.farmWideReason ?? null,
  );
  const [assetName, setAssetName] = useState(existing?.capitalAsset?.name ?? "");
  const [assetLife, setAssetLife] = useState(
    String(existing?.capitalAsset?.usefulLifeMonths ?? 60),
  );

  const [labourMode, setLabourMode] = useState<LabourMode | null>(
    existing?.labourMode ?? null,
  );
  const [people, setPeople] = useState(
    existing?.quantity != null ? String(existing.quantity) : "",
  );
  const [rate, setRate] = useState(
    existing?.unitPriceCentavos != null ? String(existing.unitPriceCentavos / 100) : "",
  );
  const [lump, setLump] = useState(
    existing != null && existing.unitPriceCentavos == null
      ? String(existing.amountCentavos / 100)
      : "",
  );

  const [paidTo, setPaidTo] = useState(existing?.paidTo ?? "");
  const [note, setNote] = useState(existing?.note ?? prefill?.note ?? "");
  // Shares he has set himself, as percentages. On a correction these open on
  // the split that is in the books; on a new entry, empty means "use the area".
  const initialShares = useMemo(() => storedShares(existing), [existing]);
  const [shares, setShares] = useState<Record<string, string>>(initialShares);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<
    null | { amount: number; queued: boolean; deleted?: boolean }
  >(null);
  const [deleteReason, setDeleteReason] = useState("");

  const activityMap = useMemo(
    () => new Map(activities.map((a) => [a.code, a])), [activities],
  );
  const chosen = activity ? activityMap.get(activity) ?? null : null;
  const effectiveCategory: ExpenseCategory | null =
    categoryTouched ? category : (chosen?.defaultCategory ?? category);

  // --- the amount ----------------------------------------------------------
  // Daily labour is people x rate; everything else is one figure. Either way
  // the total is computed and shown live, never typed a second time.
  const isDailyLabour = effectiveCategory === "Labor" && labourMode === "daily";
  const unitPrice = parsePeso(rate);
  const headcount = Number(people);
  const amountCentavos = isDailyLabour
    ? unitPrice !== null && Number.isFinite(headcount) && headcount > 0
      ? lineTotal(unitPrice, headcount)
      : null
    : parsePeso(lump);

  // --- the split -----------------------------------------------------------
  const selected = plots.filter((p) => plotIds.includes(p.id));
  const isSplit = scope === "plots" && selected.length > 1;

  // The area split is where the form opens, not where it insists on ending.
  // He was standing in the plot and the areas were not: if the crew spent the
  // morning on 24 and an hour on 2, only he knows that.
  const suggested = useMemo(
    () =>
      new Map(
        areaPercentages(
          selected.map((p) => ({ plotId: p.id, label: p.label, areaSqm: p.areaSqm })),
        ).map((r) => [r.plotId, r.percent]),
      ),
    [selected.map((p) => `${p.id}:${p.areaSqm}`).join(",")],
  );

  const percentFor = (plotId: string) => {
    const typed = shares[plotId];
    if (typed === undefined || typed.trim() === "") return suggested.get(plotId) ?? 0;
    const n = Number(typed);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  };

  // Two different questions, and conflating them made the split card contradict
  // itself: the rows said "your share" while the heading still said "suggested
  // by area".
  //
  //   edited      — is a share set at all? Decides what the card is called.
  //   sharesMoved — has he changed one since this form opened? Only a
  //                 correction can answer no to this while edited is yes.
  const edited = Object.values(shares).some((v) => v.trim() !== "");
  const sharesMoved = [...new Set([...Object.keys(shares), ...Object.keys(initialShares)])]
    .some((k) => (shares[k] ?? "").trim() !== (initialShares[k] ?? "").trim());

  // Reopening a saved split and changing nothing must save back the same
  // centavos. Re-deriving them from rounded percentages could move one, and a
  // figure that shifts when you look at it is exactly what cost the family
  // their trust in the spreadsheet.
  const splitUnchanged =
    existing != null &&
    !sharesMoved &&
    scope === "plots" &&
    amountCentavos === existing.amountCentavos &&
    selected.length === existing.allocations.length &&
    existing.allocations.every((a) => plotIds.includes(a.plotId));

  const lines = useMemo(() => {
    if (scope !== "plots" || amountCentavos === null) return [];
    if (splitUnchanged && existing) {
      const stored = new Map(existing.allocations.map((a) => [a.plotId, a.amountCentavos]));
      return selected.map((p) => ({
        plotId: p.id,
        label: p.label,
        amountCentavos: stored.get(p.id) ?? 0,
        percent: Math.round(((stored.get(p.id) ?? 0) / amountCentavos) * 1000) / 10,
      }));
    }
    if (!isSplit) {
      const only = selected[0];
      return only
        ? [{ plotId: only.id, label: only.label, amountCentavos, percent: 100 }]
        : [];
    }
    const result = splitByPercent(
      amountCentavos,
      selected.map((p) => ({
        plotId: p.id,
        label: p.label,
        percent: percentFor(p.id),
      })),
    );
    return result.lines.map((l) => ({
      plotId: l.plotId,
      label: l.label,
      amountCentavos: l.amountCentavos,
      percent: Math.round(l.fraction * 1000) / 10,
    }));
  }, [scope, isSplit, amountCentavos, selected, shares, suggested, splitUnchanged, existing]);

  const unsurveyed = selected.filter((p) => p.areaSqm === null);

  const allocated = lines.reduce((a, l) => a + l.amountCentavos, 0);
  const outBy = amountCentavos === null ? 0 : amountCentavos - allocated;

  // --- what is still missing ----------------------------------------------
  const problems: string[] = [];
  if (!activity) problems.push("Pick what the work was");
  if (activity === "other" && otherNote.trim().length < 3) problems.push("Say what this was");
  if (!effectiveCategory) problems.push("Pick a category");
  if (amountCentavos === null || amountCentavos <= 0) problems.push("Enter the amount");
  if (scope === "plots" && selected.length === 0) problems.push("Pick the plots");
  if (scope === "farm_wide" && !reason) problems.push("Say why this is whole-farm");
  if (scope === "capital" && assetName.trim().length === 0) problems.push("Name the equipment");
  if (scope === "plots" && outBy !== 0) problems.push("Make the split add up");
  if (date > today && !confirmedFuture) problems.push("Confirm the future date");

  async function save() {
    if (problems.length > 0 || amountCentavos === null) return;
    setSaving(true);
    setError(null);

    // A correction keeps the entry's id — it is the same cost, restated — and
    // carries its own id for the change, so a correction queued on the phone
    // and sent twice is applied once.
    const id = existing?.id ?? newId();
    const revisionId = correcting ? newId() : undefined;
    const body = {
      id,
      revision_id: revisionId,
      date,
      category: effectiveCategory,
      activity,
      activity_other_note: activity === "other" ? otherNote.trim() : undefined,
      attribution:
        scope === "farm_wide" ? "farm_wide"
        : scope === "capital" ? "capital"
        : isSplit ? "split" : "direct",
      farm_wide_reason: scope === "farm_wide" ? reason ?? undefined : undefined,
      labour_mode: effectiveCategory === "Labor" ? labourMode ?? undefined : undefined,
      unit_price_centavos: isDailyLabour ? unitPrice : null,
      quantity: isDailyLabour ? headcount : null,
      amount_centavos: amountCentavos,
      paid_to: paidTo.trim() || undefined,
      note: note.trim() || undefined,
      new_capital_asset:
        scope === "capital"
          ? { name: assetName.trim(), useful_life_months: Number(assetLife) || 60 }
          : null,
      allocations:
        scope === "plots"
          ? lines.map((l) => ({ plot_id: l.plotId, amount_centavos: l.amountCentavos }))
          : [],
    };

    const label = `${formatPeso(amountCentavos)} ${chosen?.label ?? activity}`;
    const where =
      scope === "plots" ? selected.map((p) => p.label).join(", ") : "whole farm";
    const result = await send({
      id: revisionId ?? id,
      endpoint: correcting ? "/api/expenses/edit" : "/api/expenses",
      body,
      describe: `${correcting ? "Correction: " : ""}${label} — ${where}`,
    });

    setSaving(false);
    if (result.ok) {
      setDone({ amount: amountCentavos, queued: false });
      router.refresh();
    } else if (result.queued) {
      setDone({ amount: amountCentavos, queued: true });
    } else {
      setError(result.error);
    }
  }

  /**
   * Deleting an entry.
   *
   * It is marked void rather than removed, and the reason is required: "logged
   * twice" and "this was Plot 12" are different facts, and in six months the
   * difference is the whole story. To everyone using the app the entry is then
   * gone — it leaves every report and the cash-on-hand total with it.
   */
  async function remove() {
    if (!existing || deleteReason.trim().length < 3) return;
    setSaving(true);
    setError(null);

    const revisionId = newId();
    const result = await send({
      id: revisionId,
      endpoint: "/api/expenses/void",
      body: { id: existing.id, reason: deleteReason.trim(), revision_id: revisionId },
      describe: `Delete ${formatPeso(existing.amountCentavos)} ${chosen?.label ?? activity}`,
    });

    setSaving(false);
    if (result.ok || result.queued) {
      setDone({ amount: existing.amountCentavos, queued: !result.ok, deleted: true });
      if (result.ok) router.refresh();
    } else {
      setError(result.error);
    }
  }

  // --- saved ---------------------------------------------------------------
  // Rule 4: 171 of 664 rows in the old book were Food, and most were untagged.
  // Offering it here, already pointed at the crew's plots, is the one change
  // that fixes the largest single category of missing attribution.
  if (done && correcting) {
    return (
      <Card>
        <Note tone={done.queued ? "warn" : "good"}>
          {done.queued
            ? "Saved on this phone. It will send when the signal comes back."
            : done.deleted
              ? `Deleted. ${formatPeso(done.amount)} is off the books.`
              : `Corrected. It now reads ${formatPeso(done.amount)}.`}
        </Note>
        <div className="flex flex-col gap-2">
          <Button
            variant="secondary"
            disabled={leaving}
            onClick={() => startLeaving(() => router.push("/expenses"))}
          >
            {leaving ? "Going…" : "Back to costs"}
          </Button>
          <Button variant="quiet" disabled={leaving} onClick={goHome}>
            {leaving ? "Going…" : "Done for now"}
          </Button>
        </div>
      </Card>
    );
  }

  if (done) {
    const wasLabour = effectiveCategory === "Labor" && activity !== "food";
    return (
      <Card>
        <Note tone={done.queued ? "warn" : "good"}>
          {done.queued
            ? `Saved on this phone. ${formatPeso(done.amount)} will send when the signal comes back.`
            : `Saved. ${formatPeso(done.amount)} logged.`}
        </Note>

        {wasLabour && scope === "plots" ? (
          <div className="mb-4 rounded-xl border-2 border-brand bg-brand-tint p-4">
            <p className="mb-3 font-semibold text-brand-strong">
              Add food for this crew?
            </p>
            <p className="mb-3 text-sm text-ink">
              It will go to the same {selected.length === 1 ? "plot" : "plots"}:{" "}
              {selected.map((p) => p.label).join(", ")}
            </p>
            <Button
              onClick={() => {
                const keep = plotIds;
                resetForNext();
                setActivity("food");
                setCategoryTouched(false);
                setPlotIds(keep);
                setScope("plots");
              }}
            >
              Add food
            </Button>
          </div>
        ) : null}

        <div className="flex flex-col gap-2">
          <Button variant="secondary" onClick={() => { resetForNext(); setPlotIds([]); }}>
            Log another
          </Button>
          <Button variant="quiet" disabled={leaving} onClick={returnTo ? goBack : goHome}>
            {leaving
              ? "Going…"
              : returnTo
                ? `Back to ${returnTo.label}`
                : "Done for now"}
          </Button>
        </div>
      </Card>
    );
  }

  function resetForNext() {
    setDone(null);
    setError(null);
    setActivity("");
    setOtherNote("");
    setCategory(null);
    setCategoryTouched(false);
    setLabourMode(null);
    setPeople("");
    setRate("");
    setLump("");
    setPaidTo("");
    setNote("");
    setShares({});
    setReason(null);
    setAssetName("");
  }

  // --- the form ------------------------------------------------------------
  const quickActivities = showAllActivities
    ? activities
    : activities.filter((a) => recentActivities.includes(a.code) || a.code === "other");
  const grouped = groupBy(quickActivities, (a) => a.activityGroup);

  return (
    <>
      {correcting && existing ? (
        <Note tone="info">
          <p className="font-semibold">
            Correcting {formatPeso(existing.amountCentavos)}, logged{" "}
            {formatDate(existing.date)}.
          </p>
          <p className="mt-1 text-sm">
            Change what was wrong and save. The owners can still see what it said
            before.
            {existing.revisedAt
              ? " This entry has already been corrected once."
              : ""}
          </p>
        </Note>
      ) : null}

      {/* 1. What was the work? Picking it sets the category. */}
      <Card title="What was it?">
        {Object.entries(grouped).map(([group, items]) => (
          <div key={group} className="mb-3 last:mb-0">
            <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-ink-soft">
              {group}
            </p>
            <ChipGroup>
              {items.map((a) => (
                <Chip
                  key={a.code}
                  selected={activity === a.code}
                  onClick={() => {
                    setActivity(a.code);
                    setCategoryTouched(false);
                    if (a.defaultCategory === "Labor" && labourMode === null) {
                      setLabourMode("daily");
                    }
                  }}
                >
                  {a.label}
                </Chip>
              ))}
            </ChipGroup>
          </div>
        ))}
        <Button
          variant="quiet"
          size="md"
          className="mt-1 px-0"
          onClick={() => setShowAllActivities((v) => !v)}
        >
          {showAllActivities ? "Show fewer" : `Show all ${activities.length} activities`}
        </Button>

        {activity === "other" ? (
          <Field
            label="Say what this was"
            htmlFor="other-note"
            hint="Required. The owners review these and add the common ones to the list."
          >
            <Input
              id="other-note"
              value={otherNote}
              onChange={(e) => setOtherNote(e.target.value)}
              placeholder="e.g. fence repair by the gate"
            />
          </Field>
        ) : null}

        {chosen ? (
          <p className="mt-3 text-sm text-ink-soft">
            Category:{" "}
            <button
              type="button"
              onClick={() => { setCategoryTouched(true); setCategory(effectiveCategory); }}
              className="font-bold text-brand underline underline-offset-4"
            >
              {effectiveCategory ?? "pick one"}
            </button>
            {!categoryTouched ? " (tap to change)" : ""}
          </p>
        ) : null}

        {categoryTouched ? (
          <ChipGroup>
            {EXPENSE_CATEGORIES.map((c) => (
              <Chip key={c} selected={effectiveCategory === c} onClick={() => setCategory(c)}>
                {c}
              </Chip>
            ))}
          </ChipGroup>
        ) : null}
      </Card>

      {/* 2. Where? Chips only. Blank is not reachable. */}
      <Card title="Where?">
        <ChipGroup>
          <Chip selected={scope === "plots"} onClick={() => setScope("plots")}>
            Plots
          </Chip>
          <Chip selected={scope === "farm_wide"} onClick={() => setScope("farm_wide")}>
            Whole farm
          </Chip>
          <Chip selected={scope === "capital"} onClick={() => setScope("capital")}>
            Equipment
          </Chip>
        </ChipGroup>

        {scope === "plots" ? (
          <div className="mt-4">
            <ChipGroup>
              {plots.map((p) => (
                <Chip
                  key={p.id}
                  selected={plotIds.includes(p.id)}
                  onClick={() =>
                    setPlotIds((ids) =>
                      ids.includes(p.id) ? ids.filter((i) => i !== p.id) : [...ids, p.id],
                    )
                  }
                >
                  {p.code}
                </Chip>
              ))}
            </ChipGroup>
            {selected.length > 0 ? (
              <div className="mt-3 space-y-1 text-sm">
                {selected.map((p) => (
                  <p key={p.id} className="text-ink-soft">
                    <span className="font-semibold text-ink">{p.label}</span>{" "}
                    {p.openCycle
                      ? `→ ${p.openCycle.crop} cycle`
                      : "→ no cycle open, this will show as unattached"}
                  </p>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        {/* Rule 5: blank plot is not an accident state. ₱609,203 sat
            unattributed in the old book because blank was the easiest path. */}
        {scope === "farm_wide" ? (
          <div className="mt-4">
            <p className="mb-2 text-sm font-semibold text-ink">Why is this whole-farm?</p>
            <ChipGroup>
              {(Object.keys(FARM_WIDE_REASONS) as FarmWideReason[]).map((r) => (
                <Chip key={r} selected={reason === r} onClick={() => setReason(r)}>
                  {FARM_WIDE_REASONS[r].split(" — ")[0]}
                </Chip>
              ))}
            </ChipGroup>
            {reason ? (
              <p className="mt-2 text-sm text-ink-soft">{FARM_WIDE_REASONS[reason]}</p>
            ) : null}
          </div>
        ) : null}

        {scope === "capital" ? (
          <div className="mt-4">
            <Note tone="info">
              Equipment is kept out of plot and cycle profit, and written down over
              its life in the capital register.
            </Note>
            <Field label="What was bought?" htmlFor="asset-name">
              <Input
                id="asset-name"
                value={assetName}
                onChange={(e) => setAssetName(e.target.value)}
                placeholder="e.g. Knapsack sprayer"
              />
            </Field>
            <Field label="Useful life (months)" htmlFor="asset-life">
              <Input
                id="asset-life"
                inputMode="numeric"
                value={assetLife}
                onChange={(e) => setAssetLife(e.target.value)}
              />
            </Field>
          </div>
        ) : null}
      </Card>

      {/* 3. How much? Computed live, never typed twice. */}
      <Card title="How much?">
        {effectiveCategory === "Labor" ? (
          <div className="mb-4">
            <ChipGroup>
              {(Object.keys(LABOUR_MODES) as LabourMode[]).map((m) => (
                <Chip key={m} selected={labourMode === m} onClick={() => setLabourMode(m)}>
                  {LABOUR_MODES[m].split(" — ")[0]}
                </Chip>
              ))}
            </ChipGroup>
            {labourMode ? (
              <p className="mt-2 text-sm text-ink-soft">{LABOUR_MODES[labourMode]}</p>
            ) : null}
          </div>
        ) : null}

        {isDailyLabour ? (
          <>
            <div className="flex gap-3">
              <Field label="People" htmlFor="people">
                <AmountInput
                  id="people"
                  inputMode="numeric"
                  value={people}
                  onChange={(e) => setPeople(e.target.value)}
                  placeholder="4"
                />
              </Field>
              <Field label="Rate each" htmlFor="rate">
                <AmountInput
                  id="rate"
                  value={rate}
                  onChange={(e) => setRate(e.target.value)}
                  placeholder="450"
                />
              </Field>
            </div>
            <div className="rounded-xl border-2 border-line bg-paper-sunk px-4 py-3">
              <span className="text-sm font-bold uppercase tracking-wide text-ink-soft">
                Total
              </span>
              <div className="tabular text-3xl font-bold">
                {amountCentavos === null ? "—" : formatPeso(amountCentavos)}
              </div>
            </div>
          </>
        ) : (
          <Field label="Amount" htmlFor="amount">
            <AmountInput
              id="amount"
              value={lump}
              onChange={(e) => setLump(e.target.value)}
              placeholder="0"
            />
          </Field>
        )}
      </Card>

      {/* The split, in his shares and in pesos, before anything is saved. */}
      {isSplit && amountCentavos !== null ? (
        <Card title={edited ? "Split — your shares" : "Split — suggested by area"}>
          {unsurveyed.length > 0 ? (
            <Note tone="warn">
              {unsurveyed.map((p) => p.label).join(", ")} has no surveyed area, so
              it starts at 0%. Type a share if it should carry part of this.
            </Note>
          ) : null}

          <ul className="space-y-3">
            {selected.map((p) => {
              const line = lines.find((l) => l.plotId === p.id);
              const pct = percentFor(p.id);
              return (
                <li key={p.id} className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold">{p.label}</div>
                    <div className="text-sm text-ink-soft">
                      {line ? formatPeso(line.amountCentavos) : "—"}
                      {shares[p.id]?.trim()
                        ? "  ·  your share"
                        : `  ·  ${suggested.get(p.id) ?? 0}% by area`}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <input
                      inputMode="decimal"
                      aria-label={`Share of the cost for ${p.label}, in percent`}
                      value={shares[p.id] ?? String(suggested.get(p.id) ?? 0)}
                      onChange={(e) =>
                        setShares((prev) => ({ ...prev, [p.id]: e.target.value }))
                      }
                      className={cx(
                        "tabular min-h-12 w-20 rounded-xl border-2 px-3 text-right text-lg font-semibold",
                        shares[p.id]?.trim()
                          ? "border-brand bg-brand-tint"
                          : "border-line-strong bg-paper",
                      )}
                    />
                    <span className="text-lg font-semibold text-ink-soft">%</span>
                  </div>
                </li>
              );
            })}
          </ul>

          <p className="mt-3 text-sm text-ink-soft">
            Shares add to {selected.reduce((a, p) => a + percentFor(p.id), 0)}% and
            come to <Money centavos={allocated} />. They do not have to total 100 —
            2 and 1 means twice as much on the first.
          </p>

          {outBy !== 0 ? (
            <Note tone="danger">
              The lines come to {formatPeso(allocated)}, not{" "}
              {formatPeso(amountCentavos)}. Give at least one plot a share.
            </Note>
          ) : null}

          {edited ? (
            <Button variant="quiet" size="md" className="px-0" onClick={() => setShares({})}>
              Back to the area split
            </Button>
          ) : null}
        </Card>
      ) : null}

      {/* Everything optional lives behind one tap. */}
      <details className="mb-4">
        <summary className="min-h-14 cursor-pointer list-none rounded-xl border-2 border-line bg-paper px-4 py-4 font-semibold">
          Date, who was paid, note
        </summary>
        <div className="mt-3 rounded-(--radius-card) border-2 border-line p-4">
          <Field
            label="Date"
            htmlFor="date"
            hint={date === today ? "Today" : formatDate(date)}
          >
            <Input
              id="date"
              type="date"
              value={date}
              max="2100-12-31"
              onChange={(e) => { setDate(e.target.value); setConfirmedFuture(false); }}
            />
          </Field>

          {/* Rule 6: nine rows in the old book were dated a year late. */}
          {date > today ? (
            <Note tone="warn">
              <p className="mb-2">
                {formatDate(date)} is in the future. Is that right?
              </p>
              <div className="flex gap-2">
                <Button size="md" onClick={() => setConfirmedFuture(true)}>
                  {confirmedFuture ? "Confirmed" : "Yes, it's right"}
                </Button>
                <Button size="md" variant="secondary" onClick={() => setDate(today)}>
                  Use today
                </Button>
              </div>
            </Note>
          ) : null}

          <Field label="Paid to" htmlFor="paid-to">
            <Input
              id="paid-to"
              value={paidTo}
              onChange={(e) => setPaidTo(e.target.value)}
              placeholder="Optional"
            />
          </Field>
          <Field label="Note" htmlFor="note">
            <Input
              id="note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Optional"
            />
          </Field>
        </div>
      </details>

      {correcting && existing ? (
        <details className="mb-4">
          <summary className="min-h-14 cursor-pointer list-none rounded-xl border-2 border-line bg-paper px-4 py-4 font-semibold text-danger">
            Delete this entry
          </summary>
          <div className="mt-3 rounded-(--radius-card) border-2 border-line p-4">
            <p className="mb-3 text-sm text-ink-soft">
              Use this when the cost never happened, or when it went in twice.
              If the figure or the plot was simply wrong, correct it above
              instead — that keeps the cost in the books.
            </p>
            <Field label="Why are you deleting it?" htmlFor="delete-reason">
              <Input
                id="delete-reason"
                value={deleteReason}
                onChange={(e) => setDeleteReason(e.target.value)}
                placeholder="e.g. logged twice"
              />
            </Field>
            <Button
              variant="danger"
              disabled={saving || deleteReason.trim().length < 3}
              onClick={remove}
            >
              Delete {formatPeso(existing.amountCentavos)}
            </Button>
          </div>
        </details>
      ) : null}

      {error ? <Note tone="danger">{error}</Note> : null}

      <div className="sticky bottom-2 z-10">
        <Button
          className="w-full shadow-lg"
          disabled={saving || problems.length > 0}
          onClick={save}
        >
          {saving
            ? "Saving…"
            : amountCentavos !== null && problems.length === 0
              ? correcting
                ? `Save correction — ${formatPeso(amountCentavos)}`
                : `Save ${formatPeso(amountCentavos)}`
              : "Save"}
        </Button>
        {problems.length > 0 ? (
          <p className="mt-2 rounded-lg bg-paper px-3 py-2 text-center text-sm font-semibold text-ink-soft">
            {problems[0]}
          </p>
        ) : null}
      </div>
    </>
  );
}

function groupBy<T>(items: T[], key: (item: T) => string): Record<string, T[]> {
  const out: Record<string, T[]> = {};
  for (const item of items) {
    const k = key(item);
    (out[k] ??= []).push(item);
  }
  return out;
}
