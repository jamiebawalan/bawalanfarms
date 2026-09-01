"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AmountInput, Button, Field, Input, Note } from "./ui";
import { newId } from "@/lib/queue";
import { formatDate, todayISO } from "@/lib/domain/dates";
import { formatPeso } from "@/lib/domain/money";

/**
 * Cash on hand, and the one thing left to type.
 *
 * He logs what he spends already, so the only entry left is the money handed
 * over. Everything else on this card is worked out from what is already there.
 */
export function CashCard({
  onHandCentavos, advancedCentavos, spentCentavos, startedOn,
  lastAdvance, sinceLastAdvanceCentavos, daysRemaining, isLow, recent,
}: {
  onHandCentavos: number;
  advancedCentavos: number;
  spentCentavos: number;
  startedOn: string | null;
  lastAdvance: { date: string; amountCentavos: number } | null;
  sinceLastAdvanceCentavos: number;
  daysRemaining: number | null;
  isLow: boolean;
  recent: { id: string; date: string; amountCentavos: number; note?: string | null }[];
}) {
  const router = useRouter();
  const today = todayISO();
  const [adding, setAdding] = useState(false);
  const [amount, setAmount] = useState("30000");
  const [date, setDate] = useState(today);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pesos = Number(amount.replace(/,/g, ""));

  async function save() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/cash", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: newId(),
        date,
        amount_centavos: Math.round(pesos * 100),
        note: note.trim() || undefined,
      }),
    });
    setBusy(false);
    if (res.ok) {
      setAdding(false);
      setAmount("30000");
      setNote("");
      router.refresh();
    } else {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Could not record that.");
    }
  }

  return (
    <>
      {startedOn === null ? (
        <p className="mb-3 text-ink-soft">
          No cash recorded yet. Add the first amount you were given and the app
          will keep track from there — everything logged after that date counts
          against it.
        </p>
      ) : (
        <>
          <div className="flex items-baseline gap-2">
            <span
              className={
                onHandCentavos < 0
                  ? "tabular text-3xl font-bold text-danger"
                  : "tabular text-3xl font-bold"
              }
            >
              {formatPeso(onHandCentavos)}
            </span>
            <span className="text-ink-soft">on hand</span>
          </div>

          {isLow ? (
            <Note tone="warn">
              {onHandCentavos <= 0
                ? "The cash is spent. Ask for the next amount."
                : `About ${daysRemaining} days left at the recent rate. Worth asking now.`}
            </Note>
          ) : daysRemaining !== null ? (
            <p className="mt-0.5 text-sm text-ink-soft">
              About {daysRemaining} days left at the recent rate.
            </p>
          ) : null}

          <dl className="mt-3 space-y-1 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-ink-soft">Given since {formatDate(startedOn)}</dt>
              <dd className="tabular font-semibold">{formatPeso(advancedCentavos)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-ink-soft">Spent</dt>
              <dd className="tabular font-semibold">{formatPeso(spentCentavos)}</dd>
            </div>
            {lastAdvance !== null ? (
              <div className="flex justify-between gap-3">
                <dt className="text-ink-soft">
                  Since {formatDate(lastAdvance.date)}
                </dt>
                <dd className="tabular font-semibold">
                  {formatPeso(sinceLastAdvanceCentavos)} of{" "}
                  {formatPeso(lastAdvance.amountCentavos)}
                </dd>
              </div>
            ) : null}
          </dl>

          {recent.length > 0 ? (
            <details className="mt-3">
              <summary className="cursor-pointer text-sm font-semibold text-brand">
                Cash received ({recent.length})
              </summary>
              <ul className="mt-2 space-y-1 text-sm tabular text-ink-soft">
                {recent.map((a) => (
                  <li key={a.id} className="flex justify-between gap-3">
                    <span>
                      {formatDate(a.date)}
                      {a.note ? <span className="text-ink-soft"> · {a.note}</span> : null}
                    </span>
                    <span className="font-semibold">{formatPeso(a.amountCentavos)}</span>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </>
      )}

      {error ? <Note tone="danger">{error}</Note> : null}

      {adding ? (
        <div className="mt-3 border-t-2 border-line pt-3">
          <Field label="How much was given?" htmlFor="cash-amount">
            <AmountInput
              id="cash-amount"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </Field>
          <Field label="On what day?" htmlFor="cash-date">
            <Input
              id="cash-date"
              type="date"
              value={date}
              max={today}
              onChange={(e) => setDate(e.target.value)}
            />
          </Field>
          {/* The first entry is usually not a handover at all — it is the cash
              he counted in his pocket the day tracking started. Saying so keeps
              the record honest a year from now. */}
          <Field
            label="Note (optional)"
            hint={startedOn === null ? "e.g. cash counted on hand at the start" : undefined}
            htmlFor="cash-note"
          >
            <Input
              id="cash-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={startedOn === null ? "cash counted on hand" : ""}
            />
          </Field>
          <div className="flex gap-2">
            <Button variant="secondary" disabled={busy || !(pesos > 0)} onClick={save}>
              {busy ? "Saving…" : "Record it"}
            </Button>
            <Button variant="secondary" disabled={busy} onClick={() => setAdding(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="secondary" onClick={() => setAdding(true)}>
          Record cash received
        </Button>
      )}
    </>
  );
}
