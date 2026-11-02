import { Card, Empty } from "./ui";
import type { Activity, ActivityMaterial, Material } from "@/lib/domain/protocol";

/**
 * The whole crop, month by month.
 *
 * The plot pages answer "what is due on this block"; this answers "what does
 * a crop look like from start to finish". Same rows, read the other way
 * round — which is the view you want when you are planning a season rather
 * than standing in one plot, and the view the husband wants on a laptop.
 *
 * Folded shut by default. Eighteen months of agronomy opened flat is a page
 * nobody scrolls to the end of, and the months are the index.
 */
export function ProtocolGuide({
  activities, materials, catalogue, openMonth,
}: {
  activities: readonly Activity[];
  materials: readonly ActivityMaterial[];
  catalogue: ReadonlyMap<string, Material>;
  /** The month to open on arrival, where there is a reason to pick one. */
  openMonth?: number | null;
}) {
  if (activities.length === 0) {
    return (
      <Card title="The crop, month by month">
        <Empty>
          The protocol is not loaded on this farm yet, so there is nothing to
          show. It arrives with the database migration.
        </Empty>
      </Card>
    );
  }

  const months = new Map<number, Activity[]>();
  for (const a of activities) {
    months.set(a.mapMonth, [...(months.get(a.mapMonth) ?? []), a]);
  }
  const ordered = [...months.entries()].sort((a, b) => a[0] - b[0]);

  const byActivity = new Map<string, ActivityMaterial[]>();
  for (const m of materials) {
    byActivity.set(m.activityCode, [...(byActivity.get(m.activityCode) ?? []), m]);
  }

  return (
    <Card title="The crop, month by month">
      <p className="mb-3 text-sm text-ink-soft">
        Months after planting. Negative months are before it: land prep starts
        at month &minus;6. This is the protocol itself — the same rows the plot
        pages suggest from.
      </p>

      <ul className="divide-y divide-line">
        {ordered.map(([month, inMonth]) => (
          <li key={month}>
            <details open={openMonth === month}>
              <summary className="cursor-pointer py-3">
                <span className="font-semibold tabular text-ink">
                  {monthLabel(month)}
                </span>
                <span className="ml-2 text-ink-soft">
                  {summarise(inMonth)}
                </span>
              </summary>

              <ul className="mb-3 space-y-4 pl-1">
                {[...inMonth]
                  .sort((a, b) => a.sortOrder - b.sortOrder)
                  .map((a) => (
                    <li key={a.code}>
                      <div className="flex flex-wrap items-baseline gap-x-2">
                        <span className="font-semibold text-ink">{a.title}</span>
                        <span className="text-sm text-ink-soft">{a.category}</span>
                      </div>
                      {a.condition === null ? null : (
                        <p className="text-sm font-semibold text-warn">
                          Only when: {a.condition}
                        </p>
                      )}
                      <p className="mt-1 text-sm text-ink-soft">{a.instruction}</p>
                      <Rates lines={byActivity.get(a.code) ?? []} catalogue={catalogue} />
                    </li>
                  ))}
              </ul>
            </details>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/**
 * The protocol's own rates, not a plot's amounts.
 *
 * Per plant or per 1,000 m², because this page is about the crop rather than
 * any one block. The plot pages do the multiplying, where there is a plant
 * count to multiply by.
 */
function Rates({
  lines, catalogue,
}: {
  lines: readonly ActivityMaterial[];
  catalogue: ReadonlyMap<string, Material>;
}) {
  if (lines.length === 0) return null;
  const ordered = [...lines].sort((a, b) => (a.mixOrder ?? 99) - (b.mixOrder ?? 99));

  return (
    <dl className="mt-2 max-w-md rounded-xl bg-paper-sunk p-3">
      {ordered.map((line) => {
        const material = catalogue.get(line.materialCode);
        if (material === undefined) return null;
        return (
          <div key={line.materialCode} className="flex justify-between gap-3 py-0.5">
            <dt className="text-sm text-ink-soft">
              {material.analysis === null
                ? material.name
                : `${material.name} (${material.analysis})`}
            </dt>
            <dd className="whitespace-nowrap text-sm font-semibold tabular text-ink">
              {rate(line)}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

function rate(line: ActivityMaterial): string {
  const n = Number(line.qty.toFixed(3));
  switch (line.qtyUnit) {
    case "g_per_plant":
      return `${n} g per plant`;
    case "g_per_1000sqm":
      return `${n} g per 1,000 m²`;
    default:
      return `${n} ml per 1,000 m²`;
  }
}

/** "Month 5", and "Month -4" said the way the protocol says it. */
function monthLabel(month: number): string {
  const n = Math.round(month * 10) / 10;
  if (n < 0) return `Month ${n}`;
  if (n === 0) return "Planting";
  return `Month ${n}`;
}

/**
 * What a month is about, in a few words.
 *
 * The categories rather than the titles: five activity names do not fit on a
 * phone, and "Nutrients, Pests, Weeds" tells you whether this is the month
 * you were looking for.
 */
function summarise(activities: readonly Activity[]): string {
  const seen: string[] = [];
  for (const a of activities) if (!seen.includes(a.category)) seen.push(a.category);
  return seen.join(" · ");
}
