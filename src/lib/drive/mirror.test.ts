/**
 * The mirror.
 *
 * The failure this guards against is the one this project has already made
 * once: a writer that only ever creates. Drive will keep two files called
 * History.md side by side in one folder and say nothing, so "run it twice,
 * nothing changes" is the property that matters most here — more than any
 * detail of what the markdown says.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { makeLedger } from "../domain/fixture";
import { cycleDossier } from "../domain/dossier";
import { mirrorToDrive, ROOT_NAME } from "./mirror";
import type { Remembered } from "./drive";
import type { Ledger } from "../domain/types";

const TODAY = "2024-06-01";
const L = makeLedger();

/** A Drive that records what was asked of it, keyed the way Drive keys things. */
function fakeDrive() {
  const files = new Map<string, { name: string; parent: string | null; body: string }>();
  const created: string[] = [];
  let next = 0;

  const handler = async (url: string, init?: RequestInit) => {
    const u = String(url);

    if (u.includes("oauth2.googleapis.com/token")) {
      return json({ access_token: "at-1" });
    }
    // alive check
    const get = u.match(/drive\/v3\/files\/([^?]+)\?fields=id,trashed/);
    if (get && init?.method === undefined) {
      const id = get[1]!;
      return files.has(id)
        ? json({ id, trashed: false })
        : new Response("gone", { status: 404 });
    }
    // folder create
    if (u.startsWith("https://www.googleapis.com/drive/v3/files?fields=id")) {
      const meta = JSON.parse(String(init!.body));
      const id = `f${++next}`;
      files.set(id, { name: meta.name, parent: meta.parents?.[0] ?? null, body: "" });
      created.push(`folder:${meta.name}`);
      return json({ id });
    }
    // multipart create
    if (u.includes("uploadType=multipart")) {
      const raw = Buffer.from(init!.body as Uint8Array).toString("utf8");
      const meta = JSON.parse(raw.slice(raw.indexOf("{"), raw.indexOf("}\r\n") + 1));
      const id = `f${++next}`;
      files.set(id, { name: meta.name, parent: meta.parents?.[0] ?? null, body: raw });
      created.push(`file:${meta.name}`);
      return json({ id });
    }
    // media update
    const patch = u.match(/upload\/drive\/v3\/files\/([^?]+)\?uploadType=media/);
    if (patch) {
      const id = patch[1]!;
      const existing = files.get(id)!;
      files.set(id, { ...existing, body: Buffer.from(init!.body as Uint8Array).toString("utf8") });
      created.push(`update:${existing.name}`);
      return json({ id });
    }
    throw new Error(`unexpected call: ${u}`);
  };

  return { handler, files, created };
}

const json = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200, headers: { "content-type": "application/json" },
  });

/** The drive_files table, in memory. */
function memory(): Remembered & { rows: Map<string, string> } {
  const rows = new Map<string, string>();
  return {
    rows,
    async get(kind, ref) { return rows.get(`${kind}/${ref}`) ?? null; },
    async put(kind, ref, fileId) { rows.set(`${kind}/${ref}`, fileId); },
    async forget(kind, ref) { rows.delete(`${kind}/${ref}`); },
  };
}

beforeEach(() => {
  process.env.GOOGLE_OAUTH_CLIENT_ID = "cid";
  process.env.GOOGLE_OAUTH_CLIENT_SECRET = "secret";
});
afterEach(() => { vi.unstubAllGlobals(); });

describe("writing the farm into Drive", () => {
  it("makes a root, a folder per plot, and a folder per cycle inside it", async () => {
    const drive = fakeDrive();
    vi.stubGlobal("fetch", vi.fn(drive.handler));
    const mem = memory();
    const result = await mirrorToDrive(L, "rt", mem, null, TODAY);

    const names = [...drive.files.values()].map((f) => f.name);
    expect(names).toContain(ROOT_NAME);
    expect(names).toContain("Plot 1");
    expect(names).toContain("History.md");
    expect(result.cycles).toBeGreaterThan(0);
    expect(result.plots).toBeGreaterThan(0);
  });

  it("puts each history inside its own cycle folder, inside its own plot folder", async () => {
    const drive = fakeDrive();
    vi.stubGlobal("fetch", vi.fn(drive.handler));
    await mirrorToDrive(L, "rt", memory(), null, TODAY);

    const byId = drive.files;
    const history = [...byId.entries()].find(([, f]) => f.name === "History.md")!;
    const cycleFolder = byId.get(history[1].parent!)!;
    const plotFolder = byId.get(cycleFolder.parent!)!;
    const root = byId.get(plotFolder.parent!)!;

    expect(cycleFolder.name).toMatch(/^\d{4}-\d{2}-\d{2} /);
    expect(plotFolder.name).toMatch(/^Plot |^Mango|^Coffee/);
    expect(root.name).toBe(ROOT_NAME);
  });

  it("names each cycle folder for the date the cycle started", async () => {
    const drive = fakeDrive();
    vi.stubGlobal("fetch", vi.fn(drive.handler));
    await mirrorToDrive(L, "rt", memory(), null, TODAY);
    const names = [...drive.files.values()].map((f) => f.name);
    expect(names).toContain("2024-01-01 pineapple");
  });

  it("changes nothing on a second run — the whole point", async () => {
    // Drive is happy to hold two files with the same name in one folder. A
    // mirror that only creates would double the farm every night.
    const drive = fakeDrive();
    vi.stubGlobal("fetch", vi.fn(drive.handler));
    const mem = memory();

    const first = await mirrorToDrive(L, "rt", mem, null, TODAY);
    const afterFirst = drive.files.size;
    const createdFirst = drive.created.filter((c) => !c.startsWith("update:")).length;

    const second = await mirrorToDrive(L, "rt", mem, first.rootFolderId, TODAY);

    expect(drive.files.size).toBe(afterFirst);
    expect(second.cycles).toBe(first.cycles);
    expect(second.plots).toBe(first.plots);
    // Everything after the first run is an overwrite, not a creation.
    expect(drive.created.filter((c) => !c.startsWith("update:")).length).toBe(createdFirst);
  });

  it("rebuilds a folder the owner deleted rather than failing forever", async () => {
    const drive = fakeDrive();
    vi.stubGlobal("fetch", vi.fn(drive.handler));
    const mem = memory();
    const first = await mirrorToDrive(L, "rt", mem, null, TODAY);

    // She tidies up and bins one plot folder. The remembered id is now wrong.
    const [plotId] = [...drive.files.entries()].find(([, f]) => f.name === "Plot 1")!;
    drive.files.delete(plotId);

    await expect(
      mirrorToDrive(L, "rt", mem, first.rootFolderId, TODAY),
    ).resolves.toBeTruthy();
    const names = [...drive.files.values()].map((f) => f.name);
    expect(names).toContain("Plot 1");
  });

  it("writes the farm's decisions where both owners can read them", async () => {
    const drive = fakeDrive();
    vi.stubGlobal("fetch", vi.fn(drive.handler));
    await mirrorToDrive(L, "rt", memory(), null, TODAY);
    const doc = [...drive.files.values()].find((f) =>
      f.name === "Decisions and open questions.md");
    expect(doc).toBeDefined();
    expect(doc!.body).toContain("Smooth Cayenne");
  });
});

describe("what a cycle's history file says", () => {
  const d = cycleDossier(L, "c1", TODAY)!;

  it("is named for the plot, the crop and when the cycle started", () => {
    expect(d.markdown).toContain("# Plot 1 — pineapple, started 01 Jan 2024");
    expect(d.folder).toBe("2024-01-01 pineapple");
    expect(d.name).toBe("History.md");
  });

  it("gives the money in whole pesos, and the per-plant figure to the centavo", () => {
    expect(d.markdown).toMatch(/\| Total cost \| ₱[\d,]+ \|/);
    expect(d.markdown).toMatch(/\| Cost per plant \| ₱[\d,]+\.\d\d \|/);
  });

  it("lists every cost charged to the cycle, not just a total", () => {
    expect(d.markdown).toContain("Every cost charged to this cycle");
    expect(d.markdown).toContain("| Date | Activity | Category | Paid to | Charged here |");
  });

  it("says plainly when there are no readings rather than showing an empty table", () => {
    expect(d.markdown).toContain("None recorded.");
  });

  it("warns that the app owns the file, so nobody edits it and loses the edit", () => {
    expect(d.markdown).toContain("will be overwritten");
  });

  it("returns nothing for a cycle that does not exist", () => {
    expect(cycleDossier(L, "nope", TODAY)).toBeNull();
  });

  it("shows readings and the forcing projection once there are two", () => {
    const withLeaf: Ledger = {
      ...L,
      leafMeasurements: [
        { cycleId: "c1", date: "2024-04-01", avgLengthCm: 60, sampleSize: 10 },
        { cycleId: "c1", date: "2024-05-01", avgLengthCm: 75, sampleSize: 10 },
      ],
    };
    const md = cycleDossier(withLeaf, "c1", TODAY)!.markdown;
    expect(md).toContain("| 01 Apr 2024 | 60 cm | 10 |");
    expect(md).toContain("Growing 0.5 cm a day");
    expect(md).toContain("Forcing projected for");
  });
});
