/**
 * What is left in the manager's pocket.
 *
 * He holds cash. The owner tops it up in lumps, and everything he logs comes
 * out of that. The old workbook made him write down both sides; now that the
 * spending is already recorded as it happens, only the money handed over needs
 * entering and the balance is arithmetic.
 *
 * The ledger starts at the first advance. Everything before that belongs to the
 * old workbook, and counting those hundreds of historical rows against a cash
 * float that did not exist yet would show him tens of thousands in the red on
 * his first look — a figure so wrong he would never trust the screen again.
 */

import { daysBetween, todayISO } from "./dates";
import type { Centavos } from "./money";
import type { ISODate, Ledger } from "./types";

export type CashAdvance = {
  id: string;
  date: ISODate;
  amountCentavos: Centavos;
  note?: string | null;
};

export type CashPosition = {
  /** Null until the first advance: before that there is no cash ledger. */
  startedOn: ISODate | null;
  advancedCentavos: Centavos;
  spentCentavos: Centavos;
  onHandCentavos: Centavos;
  lastAdvance: CashAdvance | null;
  /** Spent since the last top-up — how much of that lump is gone. */
  sinceLastAdvanceCentavos: Centavos;
  /** Average daily spend over the tracked period. Null with too little to go on. */
  dailyBurnCentavos: Centavos | null;
  /** Roughly how long the cash lasts at that rate. Null when it cannot be said. */
  daysRemaining: number | null;
};

export function cashPosition(ledger: Ledger, today: ISODate = todayISO()): CashPosition {
  const advances = [...ledger.cashAdvances].sort((a, b) => a.date.localeCompare(b.date));
  const first = advances[0] ?? null;

  if (first === null) {
    return {
      startedOn: null, advancedCentavos: 0, spentCentavos: 0, onHandCentavos: 0,
      lastAdvance: null, sinceLastAdvanceCentavos: 0,
      dailyBurnCentavos: null, daysRemaining: null,
    };
  }

  const advanced = advances.reduce((sum, a) => sum + a.amountCentavos, 0);
  const spent = ledger.expenses
    .filter((e) => e.date >= first.date && e.date <= today)
    .reduce((sum, e) => sum + e.amountCentavos, 0);
  const onHand = advanced - spent;

  const last = advances[advances.length - 1]!;
  const sinceLast = ledger.expenses
    .filter((e) => e.date >= last.date && e.date <= today)
    .reduce((sum, e) => sum + e.amountCentavos, 0);

  // A rate needs a stretch of days to average over. One day of spending says
  // nothing about the next thirty.
  const days = Math.max(1, daysBetween(first.date, today));
  const burn = days >= 7 && spent > 0 ? Math.round(spent / days) : null;

  return {
    startedOn: first.date,
    advancedCentavos: advanced,
    spentCentavos: spent,
    onHandCentavos: onHand,
    lastAdvance: last,
    sinceLastAdvanceCentavos: sinceLast,
    dailyBurnCentavos: burn,
    daysRemaining:
      burn === null || burn <= 0 || onHand <= 0 ? null : Math.floor(onHand / burn),
  };
}

/**
 * Whether the float is running low enough to say something about it.
 *
 * A week's warning is what makes the number useful: long enough to ask for the
 * next top-up and receive it before anyone is spending their own money.
 */
export function cashIsLow(position: CashPosition): boolean {
  if (position.onHandCentavos <= 0) return true;
  return position.daysRemaining !== null && position.daysRemaining <= 7;
}
