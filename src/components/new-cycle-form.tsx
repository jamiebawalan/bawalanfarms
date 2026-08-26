"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Chip, ChipGroup, Field, Input, Note } from "./ui";
import { newId } from "@/lib/queue";
import { todayISO } from "@/lib/domain/dates";
import type { Crop } from "@/lib/domain/types";

type PlotOption = {
  id: string;
  code: string;
  label: string;
  /** The crop already running here, if any. */
  busyWith: string | null;
  hasPlanned: boolean;
};

/**
 * Starting a cycle.
 *
 * A busy plot is shown, not hidden: seeing that plot 12 is running peanuts is
 * how he remembers to close it. Choosing one offers to queue the new cycle as
 * planned instead, which is exactly what the family is doing right now with
 * peanuts coming out and pineapple going straight back in.
 */
export function NewCycleForm({ plots, crops }: { plots: PlotOption[]; crops: Crop[] }) {
  const router = useRouter();
  const today = todayISO();

  const [plotId, setPlotId] = useState<string | null>(null);
  const [crop, setCrop] = useState<string>("pineapple");
  const [dateStarted, setDateStarted] = useState(today);
  const [source, setSource] = useState("");
  const [kasama, setKasama] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const plot = plots.find((p) => p.id === plotId) ?? null;
  const busy = plot?.busyWith != null;
  const [queueIt, setQueueIt] = useState(false);

  async function save() {
    if (!plotId) return;
    setSaving(true);
    setError(null);

    const res = await fetch("/api/cycles", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: newId(),
        plot_id: plotId,
        crop,
        status: busy || queueIt ? "planned" : "land_prep",
        date_started: busy || queueIt ? null : dateStarted,
        planting_material_source: source.trim() || undefined,
        kasama_share_pct: kasama.trim() === "" ? null : Number(kasama),
      }),
    });

    setSaving(false);
    if (res.ok) {
      router.push("/cycles");
      router.refresh();
    } else {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Could not start the cycle.");
    }
  }

  return (
    <>
      <Card title="Which plot?">
        <ChipGroup>
          {plots.map((p) => (
            <Chip key={p.id} selected={plotId === p.id} onClick={() => setPlotId(p.id)}>
              {p.code}
            </Chip>
          ))}
        </ChipGroup>
        {plot ? (
          <p className="mt-3 text-sm text-ink-soft">
            <span className="font-semibold text-ink">{plot.label}</span>
            {plot.busyWith ? ` — running ${plot.busyWith} now` : " — free"}
          </p>
        ) : null}
        {busy ? (
          <Note tone="warn">
            {plot?.label} is still running {plot?.busyWith}. This will be queued as
            planned, and starts when you close the current cycle.
            {plot?.hasPlanned ? (
              <strong className="mt-1 block">
                A cycle is already queued on this plot, so this one cannot be added.
              </strong>
            ) : null}
          </Note>
        ) : null}
      </Card>

      <Card title="Which crop?">
        <ChipGroup>
          {crops.map((c) => (
            <Chip key={c.code} selected={crop === c.code} onClick={() => setCrop(c.code)}>
              {c.label}
            </Chip>
          ))}
        </ChipGroup>
      </Card>

      {!busy ? (
        <Card title="When did land prep start?">
          <Field label="Date started" htmlFor="date-started">
            <Input
              id="date-started"
              type="date"
              value={dateStarted}
              onChange={(e) => setDateStarted(e.target.value)}
            />
          </Field>
          <label className="flex min-h-14 items-center gap-3 font-semibold">
            <input
              type="checkbox"
              checked={queueIt}
              onChange={(e) => setQueueIt(e.target.checked)}
              className="size-6"
            />
            Not started yet — just plan it
          </label>
        </Card>
      ) : null}

      <details className="mb-4">
        <summary className="min-h-14 cursor-pointer list-none rounded-xl border-2 border-line bg-paper px-4 py-4 font-semibold">
          Planting material, sharecropper
        </summary>
        <div className="mt-3 rounded-(--radius-card) border-2 border-line p-4">
          <Field
            label="Planting material came from"
            htmlFor="source"
            hint="A plot, a purchase, or a note — whatever you know"
          >
            <Input
              id="source"
              value={source}
              onChange={(e) => setSource(e.target.value)}
              placeholder="e.g. suwe from plot 8"
            />
          </Field>
          <Field
            label="Kasama share (%)"
            htmlFor="kasama"
            hint="Only for a tenant-worked plot. Their share of the crop is carried as a cost on this cycle."
          >
            <Input
              id="kasama"
              inputMode="decimal"
              value={kasama}
              onChange={(e) => setKasama(e.target.value)}
              placeholder="e.g. 25"
            />
          </Field>
        </div>
      </details>

      {error ? <Note tone="danger">{error}</Note> : null}

      <Button
        className="w-full"
        disabled={saving || !plotId || (busy && Boolean(plot?.hasPlanned))}
        onClick={save}
      >
        {saving ? "Starting…" : busy || queueIt ? "Queue this cycle" : "Start the cycle"}
      </Button>
    </>
  );
}
