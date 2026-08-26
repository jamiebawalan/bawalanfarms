"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  AmountInput, Button, Card, Chip, ChipGroup, Field, Input, Money, Note,
} from "./ui";
import { newId, send } from "@/lib/queue";
import { formatPeso, lineTotal, parsePeso } from "@/lib/domain/money";
import { formatDate, todayISO } from "@/lib/domain/dates";

export type ProductOption = { code: string; label: string; isGrade: boolean };
export type CycleOption = { id: string; label: string; crop: string };
export type BuyerOption = { id: string; name: string };

/**
 * Harvest: what came off the plot, by grade. Recorded separately from the sale
 * because fruit is picked first and sold later, sometimes days later and
 * sometimes to several buyers. The gap between the two is spoilage, and the
 * cycle page shows it rather than hiding it.
 */
export function HarvestForm({
  cycles, products, defaultCycleId,
}: {
  cycles: CycleOption[];
  products: ProductOption[];
  defaultCycleId?: string;
}) {
  const router = useRouter();
  const today = todayISO();

  const [cycleId, setCycleId] = useState(defaultCycleId ?? cycles[0]?.id ?? "");
  const [date, setDate] = useState(today);
  const [note, setNote] = useState("");
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const cycle = cycles.find((c) => c.id === cycleId) ?? null;
  const shown = relevantProducts(products, cycle?.crop);

  const lines = Object.entries(quantities)
    .map(([product, raw]) => ({ product, quantity: Number(raw) }))
    .filter((l) => Number.isFinite(l.quantity) && l.quantity > 0);
  const total = lines.reduce((a, l) => a + l.quantity, 0);

  async function save() {
    if (!cycleId || lines.length === 0) return;
    setSaving(true);
    setError(null);

    const id = newId();
    const result = await send({
      id,
      endpoint: "/api/harvests",
      body: { id, cycle_id: cycleId, date, note: note.trim() || undefined, lines },
      describe: `Harvest ${total} — ${cycle?.label ?? ""}`,
    });

    setSaving(false);
    if (result.ok || result.queued) {
      setSaved(true);
      setQuantities({});
      router.refresh();
    } else {
      setError(result.error);
    }
  }

  if (cycles.length === 0) {
    return <Note tone="warn">No cycle is running, so there is nothing to harvest.</Note>;
  }

  return (
    <>
      {saved ? <Note tone="good">Harvest recorded.</Note> : null}

      <Card title="From which cycle?">
        <ChipGroup>
          {cycles.map((c) => (
            <Chip key={c.id} selected={cycleId === c.id} onClick={() => setCycleId(c.id)}>
              {c.label}
            </Chip>
          ))}
        </ChipGroup>
      </Card>

      <Card title="How much came off?">
        <ul className="space-y-3">
          {shown.map((p) => (
            <li key={p.code} className="flex items-center justify-between gap-3">
              <label htmlFor={`h-${p.code}`} className="font-semibold">
                {p.label}
              </label>
              <input
                id={`h-${p.code}`}
                inputMode="decimal"
                value={quantities[p.code] ?? ""}
                onChange={(e) =>
                  setQuantities((q) => ({ ...q, [p.code]: e.target.value }))
                }
                placeholder="0"
                className="tabular min-h-12 w-32 rounded-xl border-2 border-line-strong bg-paper px-3 text-right text-lg font-semibold"
              />
            </li>
          ))}
        </ul>
        {total > 0 ? (
          <p className="mt-4 tabular text-xl font-bold">
            {total.toLocaleString("en-PH")} in total
          </p>
        ) : null}
      </Card>

      <details className="mb-4">
        <summary className="min-h-14 cursor-pointer list-none rounded-xl border-2 border-line px-4 py-4 font-semibold">
          Date and note
        </summary>
        <div className="mt-3 rounded-(--radius-card) border-2 border-line p-4">
          <Field label="Date" htmlFor="h-date" hint={formatDate(date)}>
            <Input id="h-date" type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Note" htmlFor="h-note">
            <Input id="h-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" />
          </Field>
        </div>
      </details>

      {error ? <Note tone="danger">{error}</Note> : null}

      <Button className="w-full" disabled={saving || lines.length === 0} onClick={save}>
        {saving ? "Saving…" : "Record the harvest"}
      </Button>
    </>
  );
}

/**
 * Sale.
 *
 * Price is captured per line, every time. There is no price tier to look up:
 * Primera fetched ₱70, ₱65 and ₱60 within eleven days at different markets. The
 * last price this buyer paid for this grade is offered as a starting point and
 * nothing more.
 */
export function SaleForm({
  cycles, products, buyers, lastPrices, defaultCycleId,
}: {
  cycles: CycleOption[];
  products: ProductOption[];
  buyers: BuyerOption[];
  /** buyerId -> product -> { centavos, date } */
  lastPrices: Record<string, Record<string, { centavos: number; date: string }>>;
  defaultCycleId?: string;
}) {
  const router = useRouter();
  const today = todayISO();

  const [cycleId, setCycleId] = useState(defaultCycleId ?? cycles[0]?.id ?? "");
  const [buyerId, setBuyerId] = useState<string>("");
  const [date, setDate] = useState(today);
  const [note, setNote] = useState("");
  const [rows, setRows] = useState<Record<string, { qty: string; price: string; bulk: boolean }>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const cycle = cycles.find((c) => c.id === cycleId) ?? null;
  const shown = relevantProducts(products, cycle?.crop);
  const priceBook = lastPrices[buyerId] ?? {};

  const lines = shown
    .map((p) => {
      const row = rows[p.code];
      if (!row) return null;
      const qty = Number(row.qty);
      const price = row.price === "" ? priceBook[p.code]?.centavos ?? null : parsePeso(row.price);
      if (!Number.isFinite(qty) || qty <= 0 || price === null) return null;
      return {
        product: p.code,
        quantity: qty,
        unit_price_centavos: price,
        is_bulk: row.bulk,
        total: lineTotal(price, qty),
      };
    })
    .filter((l): l is NonNullable<typeof l> => l !== null);

  const total = lines.reduce((a, l) => a + l.total, 0);

  async function save() {
    if (!cycleId || !buyerId || lines.length === 0) return;
    setSaving(true);
    setError(null);

    const id = newId();
    const result = await send({
      id,
      endpoint: "/api/sales",
      body: {
        id,
        cycle_id: cycleId,
        buyer_id: buyerId,
        date,
        note: note.trim() || undefined,
        lines: lines.map(({ total: _t, ...l }) => l),
      },
      describe: `Sale ${formatPeso(total)} — ${buyers.find((b) => b.id === buyerId)?.name ?? ""}`,
    });

    setSaving(false);
    if (result.ok || result.queued) {
      setSaved(true);
      setRows({});
      router.refresh();
    } else {
      setError(result.error);
    }
  }

  if (cycles.length === 0) {
    return <Note tone="warn">No cycle is running, so there is nothing to sell.</Note>;
  }

  return (
    <>
      {saved ? <Note tone="good">Sale recorded.</Note> : null}

      <Card title="From which cycle?">
        <ChipGroup>
          {cycles.map((c) => (
            <Chip key={c.id} selected={cycleId === c.id} onClick={() => setCycleId(c.id)}>
              {c.label}
            </Chip>
          ))}
        </ChipGroup>
      </Card>

      <Card title="Who bought it?">
        <ChipGroup>
          {buyers.map((b) => (
            <Chip key={b.id} selected={buyerId === b.id} onClick={() => setBuyerId(b.id)}>
              {b.name}
            </Chip>
          ))}
        </ChipGroup>
      </Card>

      <Card title="What went, and for how much?">
        <ul className="space-y-4">
          {shown.map((p) => {
            const row = rows[p.code] ?? { qty: "", price: "", bulk: false };
            const last = priceBook[p.code];
            const set = (patch: Partial<typeof row>) =>
              setRows((r) => ({ ...r, [p.code]: { ...row, ...patch } }));
            const line = lines.find((l) => l.product === p.code);

            return (
              <li key={p.code} className="border-b-2 border-line pb-3 last:border-0">
                <div className="mb-1.5 flex items-baseline justify-between gap-2">
                  <span className="font-semibold">{p.label}</span>
                  {line ? <Money centavos={line.total} /> : null}
                </div>
                <div className="flex gap-2">
                  <input
                    inputMode="decimal"
                    aria-label={`${p.label} quantity`}
                    value={row.qty}
                    onChange={(e) => set({ qty: e.target.value })}
                    placeholder="Qty"
                    className="tabular min-h-12 w-full rounded-xl border-2 border-line-strong bg-paper px-3 text-lg font-semibold"
                  />
                  <input
                    inputMode="decimal"
                    aria-label={`${p.label} price each`}
                    value={row.price}
                    onChange={(e) => set({ price: e.target.value })}
                    placeholder={last ? String(last.centavos / 100) : "Price"}
                    className="tabular min-h-12 w-full rounded-xl border-2 border-line-strong bg-paper px-3 text-lg font-semibold"
                  />
                </div>
                {last && row.price === "" ? (
                  <p className="mt-1 text-sm text-ink-soft">
                    Last time: {formatPeso(last.centavos)} on {formatDate(last.date)}. Change
                    it if today is different.
                  </p>
                ) : null}
                {row.qty !== "" ? (
                  <label className="mt-1.5 flex min-h-11 items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={row.bulk}
                      onChange={(e) => set({ bulk: e.target.checked })}
                      className="size-5"
                    />
                    Bulk dump, not a graded sale
                  </label>
                ) : null}
              </li>
            );
          })}
        </ul>

        <div className="mt-4 rounded-xl border-2 border-line bg-paper-sunk px-4 py-3">
          <span className="text-sm font-bold uppercase tracking-wide text-ink-soft">Total</span>
          <div className="tabular text-3xl font-bold">{formatPeso(total)}</div>
        </div>
      </Card>

      <details className="mb-4">
        <summary className="min-h-14 cursor-pointer list-none rounded-xl border-2 border-line px-4 py-4 font-semibold">
          Date and note
        </summary>
        <div className="mt-3 rounded-(--radius-card) border-2 border-line p-4">
          <Field label="Date" htmlFor="s-date" hint={formatDate(date)}>
            <Input id="s-date" type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Note" htmlFor="s-note">
            <Input id="s-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" />
          </Field>
        </div>
      </details>

      {error ? <Note tone="danger">{error}</Note> : null}

      <Button
        className="w-full"
        disabled={saving || !buyerId || lines.length === 0}
        onClick={save}
      >
        {saving ? "Saving…" : total > 0 ? `Record ${formatPeso(total)}` : "Record the sale"}
      </Button>
    </>
  );
}

/**
 * Pineapple sells by grade; everything else sells by product name. Showing a
 * banana cycle five pineapple grades is how a form starts getting ignored.
 */
function relevantProducts(products: ProductOption[], crop: string | undefined): ProductOption[] {
  if (crop === "pineapple") return products.filter((p) => p.isGrade);
  if (crop === undefined) return products;
  const byCrop: Record<string, string[]> = {
    banana: ["lakatan", "tundan", "small_tundan", "diaz"],
    peanut: ["peanut"],
    mane: ["mane"],
    corn: ["corn"],
    coffee: ["coffee"],
    mango: ["mango"],
    papaya: ["papaya"],
  };
  const codes = byCrop[crop];
  const matched = codes ? products.filter((p) => codes.includes(p.code)) : [];
  return matched.length > 0 ? matched : products.filter((p) => !p.isGrade);
}
