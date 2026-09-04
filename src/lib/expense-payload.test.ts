import { describe, expect, it } from "vitest";
import { ExpensePayload, humanise, isEntryFault } from "./expense-payload";
import { storedShares } from "@/components/expense-form";

const PLOT_A = "aaaaaaaa-0000-4000-8000-000000000001";
const PLOT_B = "aaaaaaaa-0000-4000-8000-000000000002";
const EXPENSE = "bbbbbbbb-0000-4000-8000-000000000001";
const REVISION = "cccccccc-0000-4000-8000-000000000001";

const base = {
  id: EXPENSE,
  date: "2026-08-01",
  category: "Labor" as const,
  activity: "deweed",
  attribution: "direct" as const,
  amount_centavos: 180000,
  allocations: [{ plot_id: PLOT_A, amount_centavos: 180000 }],
};

describe("the expense payload, shared by logging and correcting", () => {
  it("accepts an entry with no revision id — that is a new cost", () => {
    const parsed = ExpensePayload.safeParse(base);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.revision_id).toBeUndefined();
  });

  it("carries the revision id through, so a queued correction applies once", () => {
    const parsed = ExpensePayload.safeParse({ ...base, revision_id: REVISION });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.revision_id).toBe(REVISION);
  });

  it("refuses a revision id that is not an id at all", () => {
    expect(ExpensePayload.safeParse({ ...base, revision_id: "yes" }).success).toBe(false);
  });

  /**
   * The rule that matters most on a correction: he opens an entry to change the
   * amount, and the stored split no longer adds up to it. The form recomputes,
   * but if anything ever sent the two out of step this has to catch it, because
   * the alternative is a plot P&L that silently disagrees with the ledger.
   */
  it("refuses a corrected amount whose split still adds to the old one", () => {
    const parsed = ExpensePayload.safeParse({
      ...base,
      attribution: "split",
      amount_centavos: 225000,
      allocations: [
        { plot_id: PLOT_A, amount_centavos: 125000 },
        { plot_id: PLOT_B, amount_centavos: 55000 },
      ],
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0]?.message).toContain("off by ₱450.00");
    }
  });

  it("still holds every entry rule when correcting, not only when logging", () => {
    const missingReason = ExpensePayload.safeParse({
      ...base,
      revision_id: REVISION,
      attribution: "farm_wide",
      allocations: [],
    });
    expect(missingReason.success).toBe(false);
  });
});

describe("what the farm manager is told when a correction is refused", () => {
  it("explains a frozen cycle, and says where to unfreeze it", () => {
    const said = humanise("cycle 1111 is closed; its P&L is frozen");
    expect(said).toContain("frozen");
    expect(said).toContain("Reopen it");
  });

  it("explains that an entry he already deleted cannot be corrected", () => {
    expect(humanise("that cost was deleted, so it cannot be corrected"))
      .toBe("That entry was already deleted.");
  });

  it("explains why equipment cannot become an ordinary cost", () => {
    expect(humanise("an equipment purchase cannot be changed into an ordinary cost, or the other way round — delete this entry and log it again"))
      .toContain("Delete this entry and log it again");
  });

  it("passes an unrecognised message through rather than inventing one", () => {
    expect(humanise("relation \"expenses\" does not exist"))
      .toBe("relation \"expenses\" does not exist");
  });
});

describe("telling the entry's fault from the network's", () => {
  it("trusts the Postgres code: a rule this app raised is the entry's fault", () => {
    expect(isEntryFault({ code: "P0001", message: "cycle 1111 is closed" })).toBe(true);
  });

  it("trusts the Postgres code: a constraint the schema refused is too", () => {
    expect(isEntryFault({ code: "23514", message: "date_in_plausible_range" })).toBe(true);
  });

  /**
   * The bug this replaced: a split that does not add up carries none of the
   * words the old text match looked for, so it came back a 500 and the phone
   * queued it and retried it forever — the one failure the form exists to show
   * him, hidden.
   */
  it("calls a broken split the entry's fault", () => {
    expect(
      isEntryFault({
        code: "P0001",
        message: "allocations for expense x total 1 but the expense is 2",
      }),
    ).toBe(true);
    // And by its words alone, for an error that arrives without a code.
    expect(isEntryFault({ message: "The split does not add up to the amount." }))
      .toBe(true);
  });

  /**
   * A transport failure has to queue on the phone. He tapped Save standing in a
   * plot; if this misreads a dropped connection as a bad entry, the cost is
   * gone and he will not enter it twice.
   */
  it("does not mistake a dropped connection for a bad entry", () => {
    expect(isEntryFault({ code: "08006", message: "connection failure" })).toBe(false);
    expect(isEntryFault({ code: "53300", message: "too many connections" })).toBe(false);
    expect(isEntryFault({ message: "connection closed" })).toBe(false);
    expect(isEntryFault({ message: "fetch failed" })).toBe(false);
    expect(isEntryFault({ message: "upstream request timeout" })).toBe(false);
  });

  it("reads the code even when the words point the other way", () => {
    // A connection dropped mid-statement can still carry text about the row it
    // was writing. The code is the fact; the words are decoration.
    expect(isEntryFault({ code: "08003", message: "no such cost 1111" })).toBe(false);
  });
});

describe("the share boxes a correction opens on", () => {
  const existing = {
    id: EXPENSE, date: "2026-08-01", category: "Labor" as const, activity: "deweed",
    activityOtherNote: null, attribution: "split" as const, farmWideReason: null,
    labourMode: null, unitPriceCentavos: null, quantity: null,
    amountCentavos: 200000, paidTo: null, note: null, capitalAsset: null,
    revisedAt: null,
    allocations: [
      { plotId: PLOT_A, amountCentavos: 150000 },
      { plotId: PLOT_B, amountCentavos: 50000 },
    ],
  };

  /**
   * He overruled the area maths once, because he was standing in the plot and
   * the areas were not. Reopening the entry must show him the 75/25 he chose,
   * not the areas' answer.
   */
  it("shows the split that is in the books, not the one the areas suggest", () => {
    expect(storedShares(existing)).toEqual({ [PLOT_A]: "75", [PLOT_B]: "25" });
  });

  it("leaves a one-plot cost alone — there is no share to show", () => {
    expect(storedShares({ ...existing, allocations: [existing.allocations[0]!] }))
      .toEqual({});
  });

  it("leaves a new entry on the area suggestion", () => {
    expect(storedShares(null)).toEqual({});
  });

  it("does not divide by zero on a cost of nothing", () => {
    expect(
      storedShares({
        ...existing,
        amountCentavos: 0,
        allocations: [
          { plotId: PLOT_A, amountCentavos: 0 },
          { plotId: PLOT_B, amountCentavos: 0 },
        ],
      }),
    ).toEqual({});
  });
});
