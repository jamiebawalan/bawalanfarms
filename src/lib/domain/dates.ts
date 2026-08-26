import type { ISODate } from "./types";

/** Dates read DD MMM YYYY throughout — 04 Mar 2024 — never 03/04/2024. */
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"] as const;

export function formatDate(iso: ISODate | null | undefined): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  const month = MONTHS[Number(m) - 1];
  if (!y || !d || !month) return iso;
  return `${d} ${month} ${y}`;
}

/** "04 Mar" for tight rows where the year is already obvious from context. */
export function formatDateShort(iso: ISODate | null | undefined): string {
  if (!iso) return "—";
  const [, m, d] = iso.split("-");
  const month = MONTHS[Number(m) - 1];
  if (!d || !month) return iso;
  return `${d} ${month}`;
}

export function formatMonth(yyyymm: string): string {
  const [y, m] = yyyymm.split("-");
  const month = MONTHS[Number(m) - 1];
  return month && y ? `${month} ${y}` : yyyymm;
}

export function todayISO(): ISODate {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
}

export function addDays(iso: ISODate, days: number): ISODate {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Rule 6: nine rows in the old book were dated a year late. */
export function isFuture(iso: ISODate, today = todayISO()): boolean {
  return iso > today;
}

export function daysBetween(from: ISODate, to: ISODate): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

/** "18 months" / "3 weeks" — how long a cycle has been running. */
export function describeSpan(from: ISODate, to: ISODate): string {
  const days = daysBetween(from, to);
  if (days < 14) return `${days} day${days === 1 ? "" : "s"}`;
  if (days < 70) return `${Math.round(days / 7)} weeks`;
  return `${Math.round(days / 30.44)} months`;
}

export type Period = { from: ISODate; to: ISODate; label: string };

/** The ranges the period view offers before anyone reaches for a date picker. */
export function presetPeriods(today = todayISO()): Period[] {
  const [y, m] = today.split("-").map(Number) as [number, number];
  const monthStart = `${y}-${String(m).padStart(2, "0")}-01`;
  const qStart = `${y}-${String(Math.floor((m - 1) / 3) * 3 + 1).padStart(2, "0")}-01`;
  return [
    { from: monthStart, to: today, label: "This month" },
    { from: qStart, to: today, label: "This quarter" },
    { from: `${y}-01-01`, to: today, label: "This year" },
    { from: `${y - 1}-01-01`, to: `${y - 1}-12-31`, label: `${y - 1}` },
  ];
}
