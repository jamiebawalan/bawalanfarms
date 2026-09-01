/**
 * Cash on hand.
 *
 * The failure worth guarding against is the first one he would have seen: this
 * farm carries hundreds of imported rows from before the app existed, and
 * counting those against a float that did not exist yet would have opened his
 * first look at the screen with tens of thousands of pesos missing.
 */
import { describe, expect, it } from "vitest";
import { cashIsLow, cashPosition } from "./cash";
import { makeLedger } from "./fixture";
import type { Expense, Ledger } from "./types";

const TODAY = "2026-09-01";

const spend = (date: string, pesos: number): Expense => ({
  id: `e-${date}-${pesos}`, date, category: "Labor", activity: "deweed",
  attribution: "farm_wide", farmWideReason: "general", capitalAssetId: null,
  labourMode: null, unitPriceCentavos: null, quantity: null,
  amountCentavos: pesos * 100,
});

const ledger = (
  advances: { date: string; pesos: number }[],
  expenses: Expense[],
): Ledger => ({
  ...makeLedger(),
  expenses,
  cashAdvances: advances.map((a, i) => ({
    id: `a${i}`, date: a.date, amountCentavos: a.pesos * 100,
  })),
});

describe("before any cash has been handed over", () => {
  const empty = cashPosition(ledger([], [spend("2024-05-01", 9_000)]), TODAY);

  it("shows nothing rather than a balance built on nothing", () => {
    expect(empty.startedOn).toBeNull();
    expect(empty.onHandCentavos).toBe(0);
    expect(empty.lastAdvance).toBeNull();
  });
});

describe("the ledger starts at the first advance", () => {
  // The farm imported 675 rows of history. None of it was paid from this float.
  const l = ledger(
    [{ date: "2026-08-01", pesos: 30_000 }],
    [spend("2024-05-01", 120_000), spend("2026-08-10", 4_000)],
  );
  const cash = cashPosition(l, TODAY);

  it("ignores everything spent before the first peso arrived", () => {
    expect(cash.startedOn).toBe("2026-08-01");
    expect(cash.spentCentavos).toBe(4_000 * 100);
  });

  it("leaves him in credit rather than a hundred thousand in the red", () => {
    expect(cash.onHandCentavos).toBe(26_000 * 100);
  });
});

describe("with several top-ups", () => {
  const l = ledger(
    [
      { date: "2026-07-01", pesos: 30_000 },
      { date: "2026-08-15", pesos: 30_000 },
    ],
    [
      spend("2026-07-10", 12_000),
      spend("2026-08-01", 15_000),
      spend("2026-08-20", 9_000),
    ],
  );
  const cash = cashPosition(l, TODAY);

  it("adds up everything given and everything spent", () => {
    expect(cash.advancedCentavos).toBe(60_000 * 100);
    expect(cash.spentCentavos).toBe(36_000 * 100);
    expect(cash.onHandCentavos).toBe(24_000 * 100);
  });

  it("says how much of the latest lump is already gone", () => {
    expect(cash.lastAdvance?.date).toBe("2026-08-15");
    expect(cash.sinceLastAdvanceCentavos).toBe(9_000 * 100);
  });

  it("works out a daily rate and how long the cash lasts", () => {
    // 36,000 over 62 days is about 580 a day; 24,000 left is about 41 days.
    expect(cash.dailyBurnCentavos).toBe(Math.round(36_000 * 100 / 62));
    expect(cash.daysRemaining).toBe(41);
  });
});

describe("what it refuses to estimate", () => {
  it("gives no rate from a few days of spending", () => {
    // One busy day says nothing about the next thirty.
    const l = ledger(
      [{ date: "2026-08-30", pesos: 30_000 }],
      [spend("2026-08-30", 5_000)],
    );
    expect(cashPosition(l, TODAY).dailyBurnCentavos).toBeNull();
    expect(cashPosition(l, TODAY).daysRemaining).toBeNull();
  });

  it("gives no rate when nothing has been spent at all", () => {
    const l = ledger([{ date: "2026-07-01", pesos: 30_000 }], []);
    expect(cashPosition(l, TODAY).dailyBurnCentavos).toBeNull();
  });

  it("counts no days remaining once the cash is gone", () => {
    const l = ledger(
      [{ date: "2026-07-01", pesos: 30_000 }],
      [spend("2026-07-05", 31_000)],
    );
    const cash = cashPosition(l, TODAY);
    expect(cash.onHandCentavos).toBeLessThan(0);
    expect(cash.daysRemaining).toBeNull();
  });
});

describe("when to say something", () => {
  it("warns once the cash is spent past zero", () => {
    const l = ledger(
      [{ date: "2026-07-01", pesos: 30_000 }],
      [spend("2026-07-05", 31_000)],
    );
    expect(cashIsLow(cashPosition(l, TODAY))).toBe(true);
  });

  it("warns with about a week left — time to ask and be paid", () => {
    const l = ledger(
      [{ date: "2026-07-01", pesos: 30_000 }],
      [spend("2026-07-10", 28_000)],
    );
    const cash = cashPosition(l, TODAY);
    expect(cash.daysRemaining).toBeLessThanOrEqual(7);
    expect(cashIsLow(cash)).toBe(true);
  });

  it("stays quiet while there is plenty", () => {
    const l = ledger(
      [{ date: "2026-07-01", pesos: 30_000 }],
      [spend("2026-07-10", 3_000)],
    );
    expect(cashIsLow(cashPosition(l, TODAY))).toBe(false);
  });

  it("stays quiet when it has no rate to judge by", () => {
    const l = ledger([{ date: "2026-08-30", pesos: 30_000 }], []);
    expect(cashIsLow(cashPosition(l, TODAY))).toBe(false);
  });
});
