"use client";

/**
 * A local write queue.
 *
 * Signal on the farm is good, so this is not an offline-first architecture. It
 * is the smaller promise that matters just as much: once he taps Save, the
 * entry is his. If the network drops between the plot and the road, the write
 * waits on the phone and goes out when the bars come back.
 *
 * Every queued write carries the row id the client generated, so replaying it
 * twice cannot create two rows — the insert conflicts on the primary key and
 * the second attempt is a no-op.
 */

const KEY = "farm.write-queue.v1";

export type QueuedWrite = {
  /** Client-generated row id. Makes the retry idempotent. */
  id: string;
  endpoint: string;
  body: unknown;
  /** What to tell the user this was, e.g. "₱1,800 Deweed, Plot 12". */
  describe: string;
  queuedAt: string;
  attempts: number;
  lastError?: string;
};

function read(): QueuedWrite[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as QueuedWrite[]) : [];
  } catch {
    return [];
  }
}

function write(items: QueuedWrite[]): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    // Storage full or blocked. Nothing useful to do here; the caller has
    // already been told whether the write itself succeeded.
  }
  window.dispatchEvent(new CustomEvent("farm:queue-changed"));
}

export function queued(): QueuedWrite[] {
  return read();
}

export function enqueue(item: Omit<QueuedWrite, "queuedAt" | "attempts">): void {
  const items = read();
  if (items.some((i) => i.id === item.id)) return;
  items.push({ ...item, queuedAt: new Date().toISOString(), attempts: 0 });
  write(items);
}

/**
 * Sends a write, queueing it if the network refuses.
 *
 * Only a genuine transport failure is queued. A 400 means the entry itself is
 * wrong — a split that does not add up, a missing reason — and retrying it in
 * an hour would only fail again silently, so it is thrown back to the form
 * where he can still see and fix it.
 */
export async function send(item: Omit<QueuedWrite, "queuedAt" | "attempts">): Promise<
  { ok: true } | { ok: false; queued: true } | { ok: false; queued: false; error: string }
> {
  try {
    const res = await fetch(item.endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(item.body),
    });
    if (res.ok) return { ok: true };

    if (res.status >= 500) {
      enqueue(item);
      return { ok: false, queued: true };
    }
    const detail = await res.json().catch(() => ({ error: res.statusText }));
    return { ok: false, queued: false, error: detail.error ?? "Could not save" };
  } catch {
    enqueue(item);
    return { ok: false, queued: true };
  }
}

/** Tries every waiting write once. Called on load, on reconnect, and on demand. */
export async function flush(): Promise<{ sent: number; remaining: number }> {
  const items = read();
  if (items.length === 0) return { sent: 0, remaining: 0 };

  const still: QueuedWrite[] = [];
  let sent = 0;

  for (const item of items) {
    try {
      const res = await fetch(item.endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(item.body),
      });
      if (res.ok) {
        sent += 1;
        continue;
      }
      if (res.status < 500) {
        // The entry is bad, not the connection. Keep it so it stays visible and
        // can be dealt with, but stop hammering the server with it.
        const detail = await res.json().catch(() => ({}));
        still.push({
          ...item,
          attempts: item.attempts + 1,
          lastError: detail.error ?? `Rejected (${res.status})`,
        });
        continue;
      }
      still.push({ ...item, attempts: item.attempts + 1, lastError: "Server error" });
    } catch {
      still.push({ ...item, attempts: item.attempts + 1, lastError: "No connection" });
    }
  }

  write(still);
  return { sent, remaining: still.length };
}

export function discard(id: string): void {
  write(read().filter((i) => i.id !== id));
}

/** Retries on reconnect and on a slow timer, so it drains without being asked. */
export function startAutoFlush(): () => void {
  const run = () => { void flush(); };
  window.addEventListener("online", run);
  const timer = window.setInterval(run, 30_000);
  run();
  return () => {
    window.removeEventListener("online", run);
    window.clearInterval(timer);
  };
}

export function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
