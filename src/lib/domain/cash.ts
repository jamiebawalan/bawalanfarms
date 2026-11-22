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

  /*
   * Stock bought out of the float is money gone, even though it is not a cost.
   *
   * Buying is not a cost and drawing is — that is the whole stock ledger and
   * it does not change here. But this figure is not about cost. It is about
   * what is in his pocket, and a sack he paid for with the float left it the
   * moment he paid. Leaving purchases out made the app tell him he still had
   * money he had already spent.
   *
   * Only purchases he paid for: an owner settling with the supplier directly
   * is still stock, and never touched his float.
   */
  const outOfPocket = (from: ISODate) =>
    ledger.expenses
      .filter((e) => e.date >= from && e.date <= today)
      .reduce((sum, e) => sum + e.amountCentavos, 0) +
    ledger.purchases
      .filter((p) => p.paidFromFloat === true && p.date >= from && p.date <= today)
      .reduce((sum, p) => sum + p.totalCentavos, 0);

  const advanced = advances.reduce((sum, a) => sum + a.amountCentavos, 0);
  const spent = outOfPocket(first.date);
  const onHand = advanced - spent;

  const last = advances[advances.length - 1]!;
  const sinceLast = outOfPocket(last.date);

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
