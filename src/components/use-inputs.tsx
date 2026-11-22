"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AmountInput, Button, Card, Field, Input, Note } from "./ui";
import { newId, send } from "@/lib/queue";
import { drawUnits, type StockLot } from "@/lib/domain/draws";
import { formatPeso } from "@/lib/domain/money";
import { formatDate, todayISO } from "@/lib/domain/dates";

export type ShelfItem = {
  inputType: string;
  label: string;
  unit: string;
  category: "care" | "protection" | "forcing";
  onHand: number;
};

const SHELVES: { key: ShelfItem["category"]; label: string }[] = [
  { key: "care", label: "Crop care" },
  { key: "protection", label: "Crop protection" },
  { key: "forcing", label: "Forcing" },
];

/**
 * What came out of the shed for this plot.
 *
 * The Stock screen asks for one lot at a time, which is right at the shed
 * door and wrong here: a round of work uses four things at once, and the man
 * doing it is standing in the field it happened in. So this asks the whole
 * question on one screen — every input that has stock, a box each, one
 * confirm — and works out the lots itself, oldest first, because which sack
 * it came off is bookkeeping and not his job.
 *
 * It stays shut until tapped. An open form full of empty boxes on every plot
 * page would be noise on the screen he reads most.
 */
export function UseInputs({
  cycleId, items, stock, closed,
}: {
  cycleId: string;
  items: ShelfItem[];
  stock: StockLot[];
  closed: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<number | null>(null);

  /**
   * Everything he typed, priced against the shed oldest-lot-first.
   *
   * Computed over a copy of the shed so nothing on the screen can move real
   * stock, and over the whole set at once so the total is the total — the
   * number he is about to agree to, not a column of parts.
   */
  const plan = useMemo(() => {
    const lots: StockLot[] = stock.map((l) => ({ ...l }));
    const rows = [];
    let total = 0;
    let short = false;
    for (const item of items) {
      const typed = Number(amounts[item.inputType] ?? "");
      if (!Number.isFinite(typed) || typed <= 0) continue;
      const got = drawUnits(item.inputType, typed, lots, item.unit);
      for (const d of got.draws) {
        const lot = lots.find((l) => l.purchaseId === d.purchaseId);
        if (lot !== undefined) lot.remaining -= d.quantity;
      }
      if (got.shortfall > 0) short = true;
      total += got.costCentavos;
      rows.push({ item, wanted: typed, ...got });
    }
    return { rows, total, short };
  }, [amounts, items, stock]);

  if (closed) return null;
  if (items.length === 0) {
    return (
      <Card title="Inputs used here">
        <Note tone="info">
          Nothing in the shed to use. Record a purchase on the Stock screen first.
        </Note>
      </Card>
    );
  }

  async function save() {
    const lines = plan.rows.flatMap((r) =>
      r.draws.map((d) => ({
        id: newId(),
        purchase_id: d.purchaseId,
        quantity: d.quantity,
      })),
    );
    if (lines.length === 0) return;

    setSaving(true);
    setError(null);
    const result = await send({
      id: newId(),
      endpoint: "/api/draws",
      body: { cycle_id: cycleId, date, note: note.trim() || undefined, lines },
      describe: `${plan.rows.length} input${plan.rows.length === 1 ? "" : "s"} used — ${formatPeso(plan.total)}`,
    });
    setSaving(false);

    if (result.ok || result.queued) {
      setSaved(plan.rows.length);
      setAmounts({});
      setNote("");
      setOpen(false);
      router.refresh();
    } else {
      setError(result.error);
    }
  }

  if (!open) {
    return (
      <Card title="Inputs used here">
        {saved !== null ? (
          <Note tone="good">
            {saved} recorded against this plot and taken out of the shed.
          </Note>
        ) : null}
        <Button className="w-full" onClick={() => { setSaved(null); setOpen(true); }}>
          Record inputs used
        </Button>
      </Card>
    );
  }

  return (
    <Card title="Inputs used here">
      <Note tone="info">
        Put in how much of each thing went onto this plot. Leave the rest blank.
      </Note>

      {SHELVES.map((shelf) => {
        const onThisShelf = items.filter((i) => i.category === shelf.key);
        if (onThisShelf.length === 0) return null;
        return (
          <div key={shelf.key} className="mb-5">
            <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-ink-soft">
              {shelf.label}
            </h3>
            <ul className="divide-y-2 divide-line">
              {onThisShelf.map((item) => {
                const row = plan.rows.find((r) => r.item.inputType === item.inputType);
                return (
                  <li key={item.inputType} className="flex items-center gap-3 py-2">
                    <div className="min-w-0 flex-1">
                      <label
                        htmlFor={`use-${item.inputType}`}
                        className="block truncate font-semibold"
                      >
                        {item.label}
                      </label>
                      <span className="text-sm text-ink-soft">
                        {row !== undefined && row.shortfall > 0
                          ? `only ${item.onHand} ${item.unit} in the shed`
                          : `${item.onHand} ${item.unit} on hand`}
                      </span>
                    </div>
                    <div className="w-28 shrink-0">
                      <AmountInput
                        id={`use-${item.inputType}`}
                        value={amounts[item.inputType] ?? ""}
                        onChange={(e) =>
                          setAmounts((a) => ({ ...a, [item.inputType]: e.target.value }))
                        }
                        placeholder={item.unit}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}

      {plan.short ? (
        <Note tone="warn">
          One of these is more than the shed has left. Either the count is stale
          or a purchase was never entered — nothing will be taken out until the
          amounts fit.
        </Note>
      ) : null}

      {plan.total > 0 && !plan.short ? (
        <div className="mb-4 rounded-xl border-2 border-line bg-paper-sunk px-4 py-3">
          <span className="text-sm font-bold uppercase tracking-wide text-ink-soft">
            Cost to this plot
          </span>
          <div className="tabular text-3xl font-bold">{formatPeso(plan.total)}</div>
        </div>
      ) : null}

      <details className="mb-4">
        <summary className="min-h-12 cursor-pointer list-none font-semibold text-brand">
          Date and note
        </summary>
        <div className="mt-3">
          <Field label="Date" htmlFor="use-date" hint={formatDate(date)}>
            <Input id="use-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="What was it for?" htmlFor="use-note">
            <Input
              id="use-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Optional"
            />
          </Field>
        </div>
      </details>

      {error ? <Note tone="danger">{error}</Note> : null}

      <div className="flex gap-3">
        <Button
          className="flex-1"
          disabled={saving || plan.short || plan.rows.length === 0}
          onClick={save}
        >
          {saving
            ? "Saving…"
            : plan.total > 0 && !plan.short
              ? `Take out ${formatPeso(plan.total)} worth`
              : "Take it out"}
        </Button>
        <Button variant="quiet" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </Card>
  );
}
