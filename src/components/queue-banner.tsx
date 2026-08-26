"use client";

import { useEffect, useState } from "react";
import { discard, flush, queued, startAutoFlush, type QueuedWrite } from "@/lib/queue";

/**
 * Tells him, without being asked, that something is still waiting to go out.
 * Silence about an unsent entry is worse than any error message.
 */
export function QueueBanner() {
  const [items, setItems] = useState<QueuedWrite[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const refresh = () => setItems(queued());
    refresh();
    window.addEventListener("farm:queue-changed", refresh);
    const stop = startAutoFlush();
    return () => {
      window.removeEventListener("farm:queue-changed", refresh);
      stop();
    };
  }, []);

  if (items.length === 0) return null;

  const rejected = items.filter((i) => i.lastError && i.attempts > 0 && i.lastError !== "No connection");

  return (
    <div className="border-b-2 border-warn bg-warn-tint px-4 py-3 text-warn">
      <div className="mx-auto flex max-w-2xl items-center justify-between gap-3">
        <div className="min-w-0 text-sm font-semibold">
          {items.length} {items.length === 1 ? "entry is" : "entries are"} waiting to send
          <ul className="mt-1 space-y-0.5 font-normal">
            {items.slice(0, 3).map((i) => (
              <li key={i.id} className="truncate">
                {i.describe}
                {i.lastError ? ` — ${i.lastError}` : ""}
              </li>
            ))}
          </ul>
        </div>
        <div className="flex shrink-0 flex-col gap-1">
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              await flush();
              setItems(queued());
              setBusy(false);
            }}
            className="min-h-11 rounded-lg border-2 border-warn px-3 text-sm font-bold"
          >
            {busy ? "Sending…" : "Send now"}
          </button>
          {rejected.length > 0 ? (
            <button
              type="button"
              onClick={() => {
                for (const i of rejected) discard(i.id);
                setItems(queued());
              }}
              className="min-h-11 px-3 text-sm font-semibold underline"
            >
              Discard {rejected.length} rejected
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
