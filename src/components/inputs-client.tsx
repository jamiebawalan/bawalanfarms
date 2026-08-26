"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AmountInput, Button, Card, Chip, ChipGroup, Field, Input, Note,
} from "./ui";
import { newId, send } from "@/lib/queue";
import { formatPeso, lineTotal, parsePeso } from "@/lib/domain/money";
import { formatDate, todayISO } from "@/lib/domain/dates";
import { suggestDrawQuantity } from "@/lib/domain/dosing";

type InputType = { code: string; label: string; unit: string; kgPerUnit: number | null };
type Lot = {
  id: string;
  label: string;
  unit: string;
  remaining: number;
  unitCostCentavos: number;
  kgPerUnit: number | null;
};
type CycleOption = {
  id: string;
  label: string;
  counts: { date: string; count: number }[];
};

export function InputsClient({
  inputTypes, lots, cycles,
}: {
  inputTypes: InputType[];
  lots: Lot[];
  cycles: CycleOption[];
}) {
  const [tab, setTab] = useState<"draw" | "buy">("draw");

  return (
    <Card>
      <ChipGroup>
        <Chip selected={tab === "draw"} onClick={() => setTab("draw")}>
          Take stock out
        </Chip>
        <Chip selected={tab === "buy"} onClick={() => setTab("buy")}>
          Record a purchase
        </Chip>
      </ChipGroup>
      <div className="mt-4">
        {tab === "draw" ? (
          <DrawForm lots={lots} cycles={cycles} />
        ) : (
          <PurchaseForm inputTypes={inputTypes} />
        )}
      </div>
    </Card>
  );
}

/**
 * Drawing stock. This is the moment a bulk purchase becomes a cost on a cycle.
 *
 * The quantity is suggested from the cycle's latest plant count at 40g a plant
 * and 50kg a sack — the arithmetic he was already doing by hand in the margin
 * of the old book. It is shown with its working, and it is always editable.
 */
function DrawForm({ lots, cycles }: { lots: Lot[]; cycles: CycleOption[] }) {
  const router = useRouter();
  const today = todayISO();

  const [lotId, setLotId] = useState<string | null>(lots[0]?.id ?? null);
  const [cycleId, setCycleId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState("");
  const [touched, setTouched] = useState(false);
  const [date, setDate] = useState(today);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const lot = lots.find((l) => l.id === lotId) ?? null;
  const cycle = cycles.find((c) => c.id === cycleId) ?? null;

  const suggestion = useMemo(() => {
    if (!lot || !cycle) return null;
    return suggestDrawQuantity({
      observations: cycle.counts,
      onDate: date,
      kgPerUnit: lot.kgPerUnit,
    });
  }, [lot?.id, cycle?.id, date]);

  const effective = touched ? Number(quantity) : (suggestion?.quantity ?? Number(quantity));
  const overDrawn = lot !== null && Number.isFinite(effective) && effective > lot.remaining;
  const cost = lot && Number.isFinite(effective) && effective > 0
    ? lineTotal(lot.unitCostCentavos, effective)
    : null;

  if (lots.length === 0) {
    return <Note tone="info">No stock on hand. Record a purchase first.</Note>;
  }

  async function save() {
    if (!lot || !cycleId || !Number.isFinite(effective) || effective <= 0) return;
    setSaving(true);
    setError(null);

    const id = newId();
    const result = await send({
      id,
      endpoint: "/api/inputs",
      body: {
        kind: "draw",
        id,
        purchase_id: lot.id,
        cycle_id: cycleId,
        date,
        quantity: effective,
        dose_note: note.trim() || suggestion?.workingNote,
      },
      describe: `${effective} ${lot.unit} ${lot.label} → ${cycle?.label ?? "cycle"}`,
    });

    setSaving(false);
    if (result.ok || result.queued) {
      setSaved(true);
      setQuantity("");
      setTouched(false);
      router.refresh();
    } else {
      setError(result.error);
    }
  }

  return (
    <>
      {saved ? <Note tone="good">Recorded. It is now a cost on that cycle.</Note> : null}

      <Field label="From which lot?">
        <ChipGroup>
          {lots.map((l) => (
            <Chip key={l.id} selected={lotId === l.id} onClick={() => setLotId(l.id)}>
              {l.label} ({l.remaining} {l.unit})
            </Chip>
          ))}
        </ChipGroup>
      </Field>

      <Field label="For which cycle?">
        {cycles.length === 0 ? (
          <Note tone="warn">No cycle is running, so there is nothing to draw against.</Note>
        ) : (
          <ChipGroup>
            {cycles.map((c) => (
              <Chip key={c.id} selected={cycleId === c.id} onClick={() => setCycleId(c.id)}>
                {c.label}
              </Chip>
            ))}
          </ChipGroup>
        )}
      </Field>

      <Field
        label={`How much? (${lot?.unit ?? "units"})`}
        htmlFor="draw-qty"
        hint={
          suggestion && !touched
            ? suggestion.workingNote
            : lot
              ? `${lot.remaining} ${lot.unit} left in this lot`
              : undefined
        }
        error={overDrawn ? `That lot only has ${lot?.remaining} ${lot?.unit} left.` : undefined}
      >
        <AmountInput
          id="draw-qty"
          value={touched ? quantity : (suggestion?.quantity ?? "").toString()}
          onChange={(e) => { setTouched(true); setQuantity(e.target.value); }}
          placeholder="0"
        />
      </Field>

      {suggestion && touched ? (
        <Button
          variant="quiet"
          size="md"
          className="mb-4 px-0"
          onClick={() => { setTouched(false); setQuantity(""); }}
        >
          Use the suggested {suggestion.quantity}
        </Button>
      ) : null}

      {cost !== null ? (
        <div className="mb-4 rounded-xl border-2 border-line bg-paper-sunk px-4 py-3">
          <span className="text-sm font-bold uppercase tracking-wide text-ink-soft">
            Cost to this cycle
          </span>
          <div className="tabular text-3xl font-bold">{formatPeso(cost)}</div>
        </div>
      ) : null}

      <details className="mb-4">
        <summary className="min-h-12 cursor-pointer list-none font-semibold text-brand">
          Date and note
        </summary>
        <div className="mt-3">
          <Field label="Date" htmlFor="draw-date" hint={formatDate(date)}>
            <Input id="draw-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Dose note" htmlFor="draw-note">
            <Input
              id="draw-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Optional"
            />
          </Field>
        </div>
      </details>

      {error ? <Note tone="danger">{error}</Note> : null}

      <Button
        className="w-full"
        disabled={saving || !lot || !cycleId || overDrawn || !(effective > 0)}
        onClick={save}
      >
        {saving ? "Saving…" : cost !== null ? `Take out ${formatPeso(cost)} worth` : "Take out"}
      </Button>
    </>
  );
}

/** Recording a purchase. Explicitly not a cost against any plot. */
function PurchaseForm({ inputTypes }: { inputTypes: InputType[] }) {
  const router = useRouter();
  const today = todayISO();

  const [type, setType] = useState<string | null>(null);
  const [quantity, setQuantity] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [supplier, setSupplier] = useState("");
  const [date, setDate] = useState(today);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const chosen = inputTypes.find((t) => t.code === type) ?? null;
  const qty = Number(quantity);
  const unit = parsePeso(unitCost);
  const total = unit !== null && qty > 0 ? lineTotal(unit, qty) : null;

  async function save() {
    if (!chosen || total === null) return;
    setSaving(true);
    setError(null);

    const id = newId();
    const result = await send({
      id,
      endpoint: "/api/inputs",
      body: {
        kind: "purchase",
        id,
        date,
        input_type: chosen.code,
        quantity: qty,
        unit: chosen.unit,
        unit_cost_centavos: unit,
        supplier: supplier.trim() || undefined,
      },
      describe: `${qty} ${chosen.unit} ${chosen.label} — ${formatPeso(total)}`,
    });

    setSaving(false);
    if (result.ok || result.queued) {
      setSaved(true);
      setQuantity("");
      setUnitCost("");
      router.refresh();
    } else {
      setError(result.error);
    }
  }

  return (
    <>
      {saved ? (
        <Note tone="good">
          Recorded as stock. It becomes a cost when it is drawn for a cycle.
        </Note>
      ) : null}

      <Field label="What was bought?">
        <ChipGroup>
          {inputTypes.map((t) => (
            <Chip key={t.code} selected={type === t.code} onClick={() => setType(t.code)}>
              {t.label}
            </Chip>
          ))}
        </ChipGroup>
      </Field>

      <div className="flex gap-3">
        <Field label={`How many ${chosen?.unit ?? "units"}?`} htmlFor="buy-qty">
          <AmountInput
            id="buy-qty"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            placeholder="250"
          />
        </Field>
        <Field label="Price each" htmlFor="buy-cost">
          <AmountInput
            id="buy-cost"
            value={unitCost}
            onChange={(e) => setUnitCost(e.target.value)}
            placeholder="1100"
          />
        </Field>
      </div>

      <div className="mb-4 rounded-xl border-2 border-line bg-paper-sunk px-4 py-3">
        <span className="text-sm font-bold uppercase tracking-wide text-ink-soft">Total</span>
        <div className="tabular text-3xl font-bold">
          {total === null ? "—" : formatPeso(total)}
        </div>
      </div>

      <Field label="Supplier" htmlFor="supplier">
        <Input
          id="supplier"
          value={supplier}
          onChange={(e) => setSupplier(e.target.value)}
          placeholder="Optional"
        />
      </Field>
      <Field label="Date" htmlFor="buy-date" hint={formatDate(date)}>
        <Input id="buy-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>

      {error ? <Note tone="danger">{error}</Note> : null}

      <Button className="w-full" disabled={saving || !chosen || total === null} onClick={save}>
        {saving ? "Saving…" : "Record the purchase"}
      </Button>
    </>
  );
}
