/**
 * What the farm has committed to, by the day it falls due.
 *
 * Two things end up here and they arrive by different routes. A task is
 * something somebody typed — "fix the fence", "collect the suwe". A protocol
 * item is a round Anthony accepted off a plot page and gave a date to. They
 * are different in the database and identical in the field: a thing to do, on
 * a day, on a plot. So the calendar treats them the same and says which is
 * which, rather than keeping two lists that each tell half the story.
 *
 * The month grid is a desktop shape. On a phone it is a list in date order,
 * because a 7x5 grid of touch targets on a 390px screen is a grid nobody can
 * read and nobody can tap.
 */

import { addDays, todayISO } from "./dates";
import type { ISODate } from "./types";

export type AgendaKind = "task" | "protocol";

export type AgendaItem = {
  id: string;
  kind: AgendaKind;
  title: string;
  dueOn: ISODate;
  plotLabel: string | null;
  /** The block, where the work was planned against one. */
  blockName: string | null;
  isCritical: boolean;
  /** Where to go to act on it. */
  href: string;
};

/** Monday. The farm week starts when the crew does. */
const WEEK_STARTS_ON = 1;

// ---------------------------------------------------------------------------
// The phone shape: what is late, what is now, what is coming
// ---------------------------------------------------------------------------

export type AgendaBuckets = {
  overdue: AgendaItem[];
  today: AgendaItem[];
  thisWeek: AgendaItem[];
  later: AgendaItem[];
};

export function bucketAgenda(
  items: readonly AgendaItem[],
  today: ISODate = todayISO(),
): AgendaBuckets {
  const weekEnd = addDays(today, 7);
  const sorted = [...items].sort(byUrgency);
  return {
    overdue: sorted.filter((i) => i.dueOn < today),
    today: sorted.filter((i) => i.dueOn === today),
    thisWeek: sorted.filter((i) => i.dueOn > today && i.dueOn <= weekEnd),
    later: sorted.filter((i) => i.dueOn > weekEnd),
  };
}

/**
 * Critical first, then soonest.
 *
 * Within a day, a critical job outranks an ordinary one — that is the whole
 * point of marking it. Across days, the earlier day wins regardless, because
 * a critical job next week is not more urgent than an ordinary one today.
 */
function byUrgency(a: AgendaItem, b: AgendaItem): number {
  return (
    a.dueOn.localeCompare(b.dueOn) ||
    Number(b.isCritical) - Number(a.isCritical) ||
    a.title.localeCompare(b.title)
  );
}

// ---------------------------------------------------------------------------
// The desktop shape: a month
// ---------------------------------------------------------------------------

export type AgendaDay = {
  date: ISODate;
  /** False for the leading and trailing days that belong to the months either side. */
  inMonth: boolean;
  isToday: boolean;
  isPast: boolean;
  items: AgendaItem[];
};

export type AgendaMonth = {
  /** First of the month, as a date. */
  month: ISODate;
  label: string;
  /** Always whole weeks, Monday first, so every row has seven cells. */
  weeks: AgendaDay[][];
  /** Items in this month, for the count above the grid. */
  count: number;
};

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;

export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

/**
 * One month as whole weeks.
 *
 * Padded out to Monday at the start and Sunday at the end so the grid is
 * rectangular. The padding days are real dates and carry their real work:
 * the 1st of a month falling on a Thursday does not mean Monday to Wednesday
 * are empty, and blanking them would hide three days of the farm's plan at
 * every month boundary.
 */
export function monthGrid(
  month: ISODate,
  items: readonly AgendaItem[],
  today: ISODate = todayISO(),
): AgendaMonth {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const first = `${pad4(y)}-${pad2(m)}-01` as ISODate;

  const byDate = new Map<string, AgendaItem[]>();
  for (const item of [...items].sort(byUrgency)) {
    const day = byDate.get(item.dueOn);
    if (day === undefined) byDate.set(item.dueOn, [item]);
    else day.push(item);
  }

  // Back up to the Monday on or before the 1st.
  const firstDow = new Date(`${first}T00:00:00Z`).getUTCDay();
  const lead = (firstDow - WEEK_STARTS_ON + 7) % 7;
  let cursor = addDays(first, -lead);

  const weeks: AgendaDay[][] = [];
  let count = 0;
  // Six weeks covers every possible month; trailing empty weeks are dropped.
  for (let w = 0; w < 6; w += 1) {
    const week: AgendaDay[] = [];
    for (let d = 0; d < 7; d += 1) {
      const inMonth = cursor.slice(0, 7) === first.slice(0, 7);
      const dayItems = byDate.get(cursor) ?? [];
      if (inMonth) count += dayItems.length;
      week.push({
        date: cursor,
        inMonth,
        isToday: cursor === today,
        isPast: cursor < today,
        items: dayItems,
      });
      cursor = addDays(cursor, 1);
    }
    weeks.push(week);
    // Stop once the month is behind us and the row added nothing.
    if (week.every((day) => !day.inMonth) && weeks.length > 1) {
      weeks.pop();
      break;
    }
  }

  return {
    month: first,
    label: `${MONTHS[m - 1]} ${y}`,
    weeks,
    count,
  };
}

/** The month before or after, as a first-of-month date. */
export function shiftMonth(month: ISODate, by: number): ISODate {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const total = y * 12 + (m - 1) + by;
  return `${pad4(Math.floor(total / 12))}-${pad2((total % 12) + 1)}-01` as ISODate;
}

/** The first of the month a date falls in. */
export function monthOf(date: ISODate): ISODate {
  return `${date.slice(0, 7)}-01` as ISODate;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function pad4(n: number): string {
  return String(n).padStart(4, "0");
}
