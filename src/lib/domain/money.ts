/**
 * Money is integer centavos everywhere. Never a float: 0.1 + 0.2 in binary
 * floating point is not 0.3, and a farm ledger that drifts by a centavo a row
 * is how you end up not trusting your own book.
 */

export type Centavos = number;

const PESO = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const PESO_EXACT = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Formats for the field: whole pesos, because the farm deals in whole pesos and
 * a screen full of ".00" is harder to read at arm's length in the sun.
 * Falls back to showing centavos when they are actually present.
 */
export function formatPeso(centavos: Centavos): string {
  if (!Number.isFinite(centavos)) return "—";
  return centavos % 100 === 0
    ? PESO.format(centavos / 100)
    : PESO_EXACT.format(centavos / 100);
}

/** Always two decimals. For exports and anywhere a column has to line up. */
export function formatPesoExact(centavos: Centavos): string {
  if (!Number.isFinite(centavos)) return "—";
  return PESO_EXACT.format(centavos / 100);
}

/** Compact form for chart axes and tight report cells: ₱27.5k, ₱1.2M. */
export function formatPesoCompact(centavos: Centavos): string {
  const pesos = centavos / 100;
  const abs = Math.abs(pesos);
  if (abs >= 1_000_000) return `₱${trimZero(pesos / 1_000_000)}M`;
  if (abs >= 1_000) return `₱${trimZero(pesos / 1_000)}k`;
  return formatPeso(centavos);
}

function trimZero(n: number): string {
  return n.toFixed(1).replace(/\.0$/, "");
}

/**
 * Parses what someone actually types on a phone: "450", "1,250.50", "₱ 400",
 * "1 200". Returns null rather than NaN so a bad value fails loudly at the
 * form boundary instead of quietly becoming zero in the ledger.
 */
export function parsePeso(input: string): Centavos | null {
  const cleaned = input.replace(/[₱,\s]/g, "").trim();
  if (cleaned === "" || !/^-?\d*\.?\d*$/.test(cleaned)) return null;
  const pesos = Number(cleaned);
  if (!Number.isFinite(pesos)) return null;
  return Math.round(pesos * 100);
}

/** Peso amount (possibly fractional) to centavos, rounded half away from zero. */
export function toCentavos(pesos: number): Centavos {
  return Math.sign(pesos) * Math.round(Math.abs(pesos) * 100);
}

/**
 * unit price x quantity, in centavos, rounded the same way Postgres rounds it.
 * The database enforces this equality, so the two must agree exactly or every
 * save fails.
 */
export function lineTotal(unitPriceCentavos: Centavos, quantity: number): Centavos {
  return Math.round(unitPriceCentavos * quantity);
}

export function sum(values: readonly Centavos[]): Centavos {
  return values.reduce((a, b) => a + b, 0);
}

/** Percentage as a display string; guards the empty-farm divide-by-zero. */
export function percent(part: number, whole: number, dp = 1): string {
  if (whole === 0) return "—";
  return `${((part / whole) * 100).toFixed(dp)}%`;
}
