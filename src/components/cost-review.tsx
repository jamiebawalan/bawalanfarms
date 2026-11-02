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

  const assign = async (item: ReviewItem, code: string) => {
    setBusy(item.key);
    setError(null);
    const res = await fetch("/api/costs/review", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: item.kind, key: item.key, to_activity: code }),
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
                    <ChipGroup>
                      {suggestions.map((h) => (
                        <Chip
                          key={h.code}
                          disabled={busy !== null}
                          onClick={() => void assign(item, h.code)}
                        >
                          {h.label}
                        </Chip>
                      ))}
                    </ChipGroup>
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
