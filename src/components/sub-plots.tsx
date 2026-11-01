"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AmountInput, Button, Empty, Field, Input, Money, Note, Panel } from "./ui";
import { formatDate, todayISO } from "@/lib/domain/dates";
import { formatPeso, formatPesoPrecise } from "@/lib/domain/money";
import type { SubPlotLedger } from "@/lib/domain/subplots";

/**
 * Blocking out a plot that was planted over two months.
 *
 * The suwe arrives when it arrives and the rain comes when it comes, so a
 * plot is rarely one crop of one age. Until he cuts it into blocks, every
 * figure the app gives for this plot — cost per plant, D-leaf, when to force —
 * is an average of two crops that have nothing to do with each other.
 *
 * He does this standing in the field with the planting half done, so the form
 * asks only what he knows at that moment: what he calls the block, the day he
 * planted it, and roughly how much of the plot it is. The count comes later,
 * when it has been counted.
 */
export function SubPlots({
  cycleId, ledger, blockedPct, closed, bare = false,
}: {
  cycleId: string;
  ledger: SubPlotLedger;
  blockedPct: number;
  closed: boolean;
  /** Rendered inside the setup section at the foot of the plot page. */
  bare?: boolean;
}) {
  const router = useRouter();
  const today = todayISO();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [plantedOn, setPlantedOn] = useState(today);
  const [landPct, setLandPct] = useState("");
  const [plantCount, setPlantCount] = useState("");

  const remaining = Math.round((100 - blockedPct) * 10) / 10;

  function reset() {
    setName(""); setPlantedOn(today); setLandPct(""); setPlantCount("");
    setAdding(false); setEditing(null); setError(null);
  }

  async function send(method: "POST" | "PATCH", body: unknown) {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/subplots", {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    setBusy(false);
    if (res.ok) {
      reset();
      router.refresh();
    } else {
      const detail = await res.json().catch(() => ({}));
      setError(detail.error ?? "Could not save that block.");
    }
  }

  async function remove(id: string) {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/subplots?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    setBusy(false);
    if (res.ok) {
      setRemoving(null);
      router.refresh();
    } else {
      const detail = await res.json().catch(() => ({}));
      setError(detail.error ?? "Could not remove that block.");
    }
  }

  const form = (onSave: () => void, saveLabel: string) => (
    <div className="mt-3 rounded-(--radius-card) border-2 border-line p-4">
      <div className="flex gap-3">
        <Field label="Call it" htmlFor="block-name">
          <Input
            id="block-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="A"
          />
        </Field>
        <Field label="Planted on" htmlFor="block-date">
          <Input
            id="block-date"
            type="date"
            value={plantedOn}
            max={today}
            onChange={(e) => setPlantedOn(e.target.value)}
          />
        </Field>
      </div>
      <Field
        label="How much of the plot?"
        htmlFor="block-pct"
        hint={
          remaining > 0
            ? `About ${remaining}% of this plot is not blocked out yet.`
            : "The whole plot is blocked out."
        }
      >
        <AmountInput
          id="block-pct"
          inputMode="decimal"
          value={landPct}
          onChange={(e) => setLandPct(e.target.value)}
          placeholder="40"
        />
      </Field>
      <Field
        label="Plant count (leave blank until counted)"
        htmlFor="block-count"
      >
        <AmountInput
          id="block-count"
          inputMode="numeric"
          value={plantCount}
          onChange={(e) => setPlantCount(e.target.value)}
          placeholder=""
        />
      </Field>
      <div className="flex gap-2">
        <Button
          disabled={busy || name.trim() === "" || !(Number(landPct) > 0)}
          onClick={onSave}
        >
          {busy ? "Saving…" : saveLabel}
        </Button>
        <Button variant="secondary" disabled={busy} onClick={reset}>
          Cancel
        </Button>
      </div>
    </div>
  );

  const payload = () => ({
    name: name.trim(),
    planted_on: plantedOn,
    land_pct: Number(landPct),
    plant_count: plantCount.trim() === "" ? null : Number(plantCount),
  });

  return (
    <Panel title="Blocks" bare={bare}>
      {error ? <Note tone="danger">{error}</Note> : null}

      {ledger.blocks.length === 0 ? (
        <Empty>
          Not blocked out. If this plot was planted over several weeks, cut it
          into blocks by planting date — otherwise its cost per plant and its
          forcing date are averages of crops at different ages.
        </Empty>
      ) : (
        <>
          <ul className="divide-y-2 divide-line">
            {ledger.blocks.map((b) => (
              <li key={b.subPlot.id} className="py-3">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-semibold">
                    {b.subPlot.name}
                    <span className="ml-2 font-normal text-ink-soft">
                      {b.subPlot.landPct}% · planted {formatDate(b.subPlot.plantedOn)}
                    </span>
                  </span>
                  <Money centavos={b.totalCentavos} />
                </div>
                <div className="mt-0.5 text-sm text-ink-soft">
                  {b.subPlot.plantCount === null
                    ? "Not counted yet"
                    : `${b.subPlot.plantCount.toLocaleString("en-PH")} plants`}
                  {b.costPerPlantCentavos === null
                    ? ""
                    : ` · ${formatPesoPrecise(b.costPerPlantCentavos)} a plant`}
                  {b.directCentavos > 0
                    ? ` · ${formatPeso(b.directCentavos)} tagged to it directly`
                    : ""}
                </div>

                {closed ? null : removing === b.subPlot.id ? (
                  <div className="mt-2 rounded-xl border-2 border-danger bg-danger-tint p-3">
                    <p className="mb-1 font-semibold text-danger">Remove this block?</p>
                    <p className="mb-3 text-sm text-ink">
                      Its costs are not removed with it — they go back to being
                      the plot&rsquo;s, shared across whatever blocks remain.
                    </p>
                    <div className="flex gap-2">
                      <Button size="md" variant="danger" disabled={busy}
                              onClick={() => remove(b.subPlot.id)}>
                        {busy ? "Removing…" : "Remove it"}
                      </Button>
                      <Button size="md" variant="secondary" disabled={busy}
                              onClick={() => setRemoving(null)}>
                        Keep it
                      </Button>
                    </div>
                  </div>
                ) : editing === b.subPlot.id ? (
                  form(
                    () => send("PATCH", { id: b.subPlot.id, ...payload() }),
                    "Save changes",
                  )
                ) : (
                  <div className="mt-1 flex gap-3">
                    <button
                      type="button"
                      className="min-h-11 text-sm font-semibold text-brand"
                      onClick={() => {
                        setAdding(false);
                        setRemoving(null);
                        setEditing(b.subPlot.id);
                        setName(b.subPlot.name);
                        setPlantedOn(b.subPlot.plantedOn);
                        setLandPct(String(b.subPlot.landPct));
                        setPlantCount(
                          b.subPlot.plantCount === null ? "" : String(b.subPlot.plantCount),
                        );
                      }}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="min-h-11 text-sm font-semibold text-danger"
                      onClick={() => { setEditing(null); setRemoving(b.subPlot.id); }}
                    >
                      Remove
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>

          {/* Shown rather than hidden: it is how he knows the plot is not
              fully blocked out yet, and it is real money. */}
          {ledger.unassignedCentavos > 0 ? (
            <Note tone="warn">
              <strong>{formatPeso(ledger.unassignedCentavos)}</strong> of this
              plot&rsquo;s costs belong to land that is not in any block
              {remaining > 0 ? ` — about ${remaining}% of it` : ""}. Add the
              missing block, or widen the ones that are here, and it will
              divide itself.
            </Note>
          ) : null}
        </>
      )}

      {closed ? (
        ledger.blocks.length > 0 ? (
          <Note tone="info">
            This cycle is closed, so its blocks are fixed. The next planting
            blocks the plot out again from scratch.
          </Note>
        ) : null
      ) : adding ? (
        form(() => send("POST", { cycle_id: cycleId, ...payload() }), "Add this block")
      ) : editing === null ? (
        <Button
          variant="secondary"
          onClick={() => { setAdding(true); setRemoving(null); setError(null); }}
        >
          {ledger.blocks.length === 0 ? "Block out this plot" : "Add another block"}
        </Button>
      ) : null}
    </Panel>
  );
}
