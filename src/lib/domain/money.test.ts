import { describe, expect, it } from "vitest";
import {
  formatPeso, formatPesoCompact, formatPesoExact, formatPesoPrecise,
  lineTotal, parsePeso, percent, toCentavos,
} from "./money";
import { describeSpan, formatDate, isFuture, presetPeriods, addDays } from "./dates";

describe("formatting pesos", () => {
  it("shows whole pesos, because the farm deals in whole pesos", () => {
    expect(formatPeso(123_400)).toBe("₱1,234");
    expect(formatPeso(0)).toBe("₱0");
    expect(formatPeso(-45_000)).toBe("-₱450");
  });

  it("rounds away the centavos on an absolute amount", () => {
    // Centavos on a ₱154,196 figure tell nobody anything. Rounded, not
    // truncated, so a total never drifts below the parts it is made of.
    expect(formatPeso(123_450)).toBe("₱1,235");
    expect(formatPeso(123_449)).toBe("₱1,234");
    expect(formatPeso(15_419_612)).toBe("₱154,196");
  });

  it("keeps the centavos where they change a decision", () => {
    // Cost per plant, price per fruit. At ₱4.63 a plant the second decimal is
    // the difference between one plot and the next.
    expect(formatPesoPrecise(463)).toBe("₱4.63");
    expect(formatPesoPrecise(6_667)).toBe("₱66.67");
    expect(formatPesoExact(123_400)).toBe("₱1,234.00");
  });

  it("compacts large amounts for chart axes and tight cells", () => {
    expect(formatPesoCompact(27_500_000)).toBe("₱275k");
    expect(formatPesoCompact(60_920_300)).toBe("₱609.2k");
    expect(formatPesoCompact(150_000_000)).toBe("₱1.5M");
    expect(formatPesoCompact(45_000)).toBe("₱450");
  });
});

describe("parsing what someone types on a phone", () => {
  it("accepts pesos with symbols, commas and stray spaces", () => {
    expect(parsePeso("450")).toBe(45_000);
    expect(parsePeso("₱ 1,250.50")).toBe(125_050);
    expect(parsePeso("1 200")).toBe(120_000);
  });

  it("returns null on nonsense rather than a silent zero", () => {
    // A bad value has to fail at the form, not become 0 in the ledger.
    expect(parsePeso("abc")).toBeNull();
    expect(parsePeso("")).toBeNull();
    expect(parsePeso("1.2.3")).toBeNull();
  });
});

describe("line arithmetic", () => {
  it("multiplies unit price by quantity the way Postgres does", () => {
    // The database enforces this equality, so the two must agree exactly.
    expect(lineTotal(45_000, 4)).toBe(180_000);
    expect(lineTotal(6_500, 200)).toBe(1_300_000);
    expect(lineTotal(333, 0.5)).toBe(167);
  });

  it("does not drift on amounts that float would mangle", () => {
    expect(toCentavos(0.1) + toCentavos(0.2)).toBe(toCentavos(0.3));
    expect(toCentavos(1234.56)).toBe(123_456);
  });

  it("guards the divide-by-zero on an empty farm", () => {
    expect(percent(5, 0)).toBe("—");
    expect(percent(1, 4)).toBe("25.0%");
  });
});

describe("dates", () => {
  it("reads DD MMM YYYY, never an ambiguous slash format", () => {
    expect(formatDate("2024-03-04")).toBe("04 Mar 2024");
    expect(formatDate(null)).toBe("—");
  });

  it("knows a future date when it sees one", () => {
    expect(isFuture("2025-01-01", "2024-12-31")).toBe(true);
    expect(isFuture("2024-12-31", "2024-12-31")).toBe(false);
  });

  it("describes how long a cycle has run, including the 18-month ones", () => {
    expect(describeSpan("2024-01-01", "2024-01-05")).toBe("4 days");
    expect(describeSpan("2024-01-01", "2024-02-01")).toBe("4 weeks");
    expect(describeSpan("2024-01-01", "2025-07-01")).toBe("18 months");
  });

  it("offers month, quarter and year without a date picker", () => {
    const p = presetPeriods("2024-08-26");
    expect(p[0]).toEqual({ from: "2024-08-01", to: "2024-08-26", label: "This month" });
    expect(p[1]!.from).toBe("2024-07-01");
    expect(p[2]!.from).toBe("2024-01-01");
    expect(p[3]!.label).toBe("2023");
  });

  it("adds days across month and year boundaries", () => {
    expect(addDays("2024-02-28", 1)).toBe("2024-02-29"); // leap year
    expect(addDays("2024-12-31", 1)).toBe("2025-01-01");
  });
});
