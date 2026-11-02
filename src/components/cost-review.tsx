"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Chip, ChipGroup, Empty, Field, Input, Note } from "./ui";
import { hintsFor, type ActivityOption } from "@/lib/domain/activity-hints";
import { formatPeso } from "@/lib/domain/money";

export type ReviewItem = {
  kind: "note" | "code";
  key: string;
  text: string;
  entries: number;
  pesos: number;
  sampleNote: string | null;
  sampleDate: string | null;
};

/**
 * Clearing what is filed under a word instead of an activity.
 *
 * About a hundred phrases typed into "Other", plus the seven old codes nobody
 * has said the meaning of. Both are the same job — money was spent and the
 * app does not know on what — so both are answered the same way, by picking
 * an activity once for the whole group.
 *
 * Biggest first. A phrase worth ₱50,000 is worth answering before one worth
 * ₱400, and a list in no particular order is a list nobody finishes.
 */
export function CostReview({
  items, activities,
}: {
  items: ReviewItem[];
  activities: ActivityOption[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Record<string, number>>({});
  const [search, setSearch] = useState<Record<string, string>>({});

  const assign = async (item: ReviewItem, code: string, asCapital = false) => {
    setBusy(item.key);
    setError(null);
    const res = await fetch("/api/costs/review", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kind: item.kind,
        key: item.key,
        to_activity: code,
        // Five years is the schema's own default for an asset's life, and
        // nobody on a farm wants to be asked for a depreciation schedule.
        ...(asCapital ? { as_capital: { useful_life_months: 60 } } : {}),
      }),
    });
    setBusy(null);
    if (res.ok) {
      const body = await res.json().catch(() => ({ moved: item.entries }));
      setDone((d) => ({ ...d, [item.key]: body.moved ?? item.entries }));
      router.refresh();
      return;
    }
    const detail = await res.json().catch(() => ({ error: "Could not save" }));
    setError(detail.error ?? "Could not save");
  };

  if (items.length === 0) {
    return (
      <Card title="Costs waiting on a decision">
        <Empty>
          Nothing left. Every cost is filed under an activity.
        </Empty>
      </Card>
    );
  }

  const total = items.reduce((a, i) => a + i.pesos, 0);

  return (
    <Card
      title="Costs waiting on a decision"
      action={
        <span className="text-sm text-ink-soft tabular">
          {items.length} · {formatPeso(Math.round(total * 100))}
        </span>
      }
    >
      {error === null ? null : <Note tone="danger">{error}</Note>}

      <p className="mb-3 text-sm text-ink-soft">
        Each row is one phrase or one old code, with every entry that used it.
        Pick what the work actually was and the whole group moves together.
        What was originally written is kept either way.
      </p>
      {/*
        * Said out loud because it is the obvious worry: these chips are all
        * activities, and an activity looks like labour. It is not. The kind
        * of money never changes here — a sack of potash stays Farm Inputs and
        * only the work it was for is being answered.
        */}
      <Note tone="info">
        This only changes what a cost was <em>for</em>. It never changes
        whether it was labour, materials or machines — a sack of fertiliser
        stays Farm Inputs, filed under the work it was bought for.
      </Note>

      <ul className="divide-y divide-line">
        {items.map((item) => {
          const moved = done[item.key];
          const typed = search[item.key] ?? "";
          const suggestions = hintsFor(
            typed.trim().length >= 2 ? typed : item.text,
            activities,
            typed.trim().length >= 2 ? 8 : 3,
          );

          return (
            <li key={`${item.kind}:${item.key}`} className="py-4 first:pt-0">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span className="font-semibold text-ink">{item.text}</span>
                <span className="whitespace-nowrap text-sm tabular text-ink-soft">
                  {formatPeso(Math.round(item.pesos * 100))} ·{" "}
                  {item.entries} {item.entries === 1 ? "entry" : "entries"}
                </span>
              </div>

              {item.kind === "code" ? (
                <p className="text-sm text-ink-soft">
                  An old code. Nobody has said which activity it is.
                  {item.sampleNote === null ? null : (
                    <> One of them says: &ldquo;{item.sampleNote}&rdquo;.</>
                  )}
                </p>
              ) : null}

              {moved !== undefined ? (
                <Note tone="good">
                  Moved {moved} {moved === 1 ? "entry" : "entries"}.
                </Note>
              ) : (
                <>
                  <div className="mt-2">
                    {/*
                      * The group, not just the label. "Side-dress (granules)"
                      * is the Nutrients answer, and somebody looking for
                      * Nutrients could not tell that from the name alone.
                      */}
                    <ChipGroup>
                      {suggestions.map((h) => (
                        <Chip
                          key={h.code}
                          disabled={busy !== null}
                          onClick={() => void assign(item, h.code)}
                        >
                          <span className="block text-left">
                            <span className="block text-xs font-normal opacity-75">
                              {groupOf(h.code, activities)}
                            </span>
                            {h.label}
                          </span>
                        </Chip>
                      ))}
                    </ChipGroup>
                  </div>

                    {/*
                      * Equipment, not a cost of the cycle that bought it. The
                      * warning is on the button rather than behind it: this
                      * takes the money off the plot, which is right for a
                      * chainsaw and surprising if you did not expect it.
                      */}
                    <div className="mt-2">
                      <Button
                        variant="quiet"
                        size="md"
                        className="px-0"
                        disabled={busy !== null}
                        onClick={() => void assign(item, "tools_equipment", true)}
                      >
                        It is equipment the farm keeps →
                      </Button>
                      <p className="text-sm text-ink-soft">
                        Files it as Tools and equipment and records it as an
                        asset over five years. The cost leaves the plot, because
                        a chainsaw is not a cost of the cycle that bought it.
                      </p>
                    </div>

                  <div className="mt-2 max-w-sm">
                    <Field
                      label={suggestions.length === 0 ? "Which activity?" : "Something else?"}
                      htmlFor={`search-${item.kind}-${item.key}`}
                    >
                      <Input
                        id={`search-${item.kind}-${item.key}`}
                        value={typed}
                        onChange={(e) =>
                          setSearch((s) => ({ ...s, [item.key]: e.target.value }))
                        }
                        placeholder="repair, abono, tabas…"
                      />
                    </Field>
                  </div>
                </>
              )}
            </li>
          );
        })}
      </ul>

      <p className="mt-4 text-sm text-ink-soft">
        Nothing here is guessed for you. A phrase that meant two different
        things on different days has to be split by hand, and the original
        wording stays on every row so that is still possible afterwards.
      </p>
    </Card>
  );
}

/** Which part of the crop an activity belongs to, for the chip's first line. */
function groupOf(code: string, activities: readonly ActivityOption[]): string {
  return activities.find((a) => a.code === code)?.activityGroup ?? "";
}
