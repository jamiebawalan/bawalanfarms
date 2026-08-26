/**
 * @vitest-environment jsdom
 *
 * The queue's job is to make one promise true: once he taps Save, the entry is
 * his. These tests are mostly about the ways that promise can quietly break.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { discard, enqueue, flush, newId, queued, send } from "./queue";

const json = (status: number, body: unknown = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

const html = (status: number) =>
  new Response("<!doctype html><title>Sign in</title>", {
    status,
    headers: { "content-type": "text/html" },
  });

const item = (id = "row-1") => ({
  id,
  endpoint: "/api/expenses",
  body: { id, amount_centavos: 180_000 },
  describe: "₱1,800 Deweed, Plot 12",
});

beforeEach(() => {
  window.localStorage.clear();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("saving", () => {
  it("reports success when the API accepts it", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json(200, { id: "row-1" })));
    expect(await send(item())).toEqual({ ok: true });
    expect(queued()).toEqual([]);
  });

  it("keeps the entry on the phone when the network is gone", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new TypeError("failed to fetch");
    }));
    expect(await send(item())).toEqual({ ok: false, queued: true });
    expect(queued()).toHaveLength(1);
    expect(queued()[0]!.describe).toBe("₱1,800 Deweed, Plot 12");
  });

  it("keeps it when the server is having a bad day", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json(503, {})));
    expect(await send(item())).toEqual({ ok: false, queued: true });
    expect(queued()).toHaveLength(1);
  });

  it("does not queue an entry the server says is wrong", async () => {
    // A split that does not add up will fail again in an hour. Retrying it into
    // silence is worse than telling him now, while the form is still open.
    vi.stubGlobal("fetch", vi.fn(async () =>
      json(400, { error: "The split does not add up." }),
    ));
    expect(await send(item())).toEqual({
      ok: false,
      queued: false,
      error: "The split does not add up.",
    });
    expect(queued()).toEqual([]);
  });

  it("never treats an HTML page as a saved entry", async () => {
    // A login page, a proxy, or a captive portal answering 200 with HTML. This
    // is the failure that loses an entry he believes he saved.
    vi.stubGlobal("fetch", vi.fn(async () => html(200)));
    expect(await send(item())).toEqual({ ok: false, queued: true });
    expect(queued()).toHaveLength(1);
  });

  it("tells him to sign in again rather than silently discarding", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json(401, {})));
    const result = await send(item());
    expect(result).toMatchObject({ ok: false, queued: false });
    expect((result as { error: string }).error).toMatch(/sign in/i);
  });
});

describe("draining the queue", () => {
  it("sends what is waiting and clears it", async () => {
    enqueue(item("a"));
    enqueue(item("b"));
    vi.stubGlobal("fetch", vi.fn(async () => json(200)));
    expect(await flush()).toEqual({ sent: 2, remaining: 0 });
    expect(queued()).toEqual([]);
  });

  it("keeps what still cannot go out", async () => {
    enqueue(item("a"));
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new TypeError("offline");
    }));
    expect(await flush()).toEqual({ sent: 0, remaining: 1 });
    expect(queued()[0]!.attempts).toBe(1);
    expect(queued()[0]!.lastError).toBe("No connection");
  });

  it("holds a rejected entry with its reason instead of retrying forever", async () => {
    enqueue(item("a"));
    vi.stubGlobal("fetch", vi.fn(async () =>
      json(400, { error: "That date looks wrong." }),
    ));
    await flush();
    expect(queued()[0]!.lastError).toBe("That date looks wrong.");
  });

  it("holds an entry that met a login page, and does not count it as sent", async () => {
    enqueue(item("a"));
    vi.stubGlobal("fetch", vi.fn(async () => html(200)));
    expect(await flush()).toEqual({ sent: 0, remaining: 1 });
  });

  it("does nothing when there is nothing waiting", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await flush()).toEqual({ sent: 0, remaining: 0 });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("replay safety", () => {
  it("will not queue the same entry twice", () => {
    enqueue(item("a"));
    enqueue(item("a"));
    expect(queued()).toHaveLength(1);
  });

  it("carries a client-generated id, which is what makes a retry a no-op", () => {
    // The server inserts with this id, so a replayed write conflicts on the
    // primary key rather than creating a second row.
    const id = newId();
    expect(id).toMatch(/[0-9a-f-]{8,}/);
    expect(newId()).not.toBe(id);
  });

  it("can drop an entry the owner has decided to abandon", () => {
    enqueue(item("a"));
    enqueue(item("b"));
    discard("a");
    expect(queued().map((i) => i.id)).toEqual(["b"]);
  });

  it("survives corrupted local storage rather than throwing on load", () => {
    window.localStorage.setItem("farm.write-queue.v1", "{not json");
    expect(queued()).toEqual([]);
  });
});
