/**
 * The farm's Drive, laid out the way the owners asked for it.
 *
 *   Bawalan Farms/
 *     Farm/
 *       Decisions and open questions.md
 *     Plot 7/
 *       2026-04-01 pineapple/
 *         History.md
 *         <photos>
 *
 * A folder per plot, a folder per cycle inside it named by the start date, and
 * the whole history of that cycle as a markdown file anyone can read on a phone
 * without the app. Photos land beside the history, in the cycle they belong to.
 *
 * Running it twice must change nothing. Every folder and file is keyed by what
 * it represents — the plot id, the cycle id — and the id Drive gave back is
 * remembered, so the second run overwrites the first run's work instead of
 * doubling it.
 */

import { Drive, type Remembered } from "./drive";
import { cycleDossier, knowledgeDoc } from "../domain/dossier";
import { farmBrief } from "../advice/knowledge";
import { todayISO } from "../domain/dates";
import type { Ledger } from "../domain/types";

export const ROOT_NAME = "Bawalan Farms";

export type MirrorResult = {
  rootFolderId: string;
  cycles: number;
  plots: number;
  skipped: string[];
};

export async function mirrorToDrive(
  ledger: Ledger,
  refreshToken: string,
  memory: Remembered,
  knownRootId: string | null,
  today = todayISO(),
): Promise<MirrorResult> {
  const drive = await Drive.open(refreshToken, memory);

  // The root is remembered under a fixed key, so the first run makes it and
  // every run after finds it. If the owner renames it in Drive, the id still
  // points at her renamed folder and the mirror follows it there.
  const root = knownRootId ?? (await drive.folder("doc", "root", ROOT_NAME, null));

  const farm = await drive.folder("doc", "farm-folder", "Farm", root);
  const knowledge = knowledgeDoc(farmBrief(), today);
  await drive.text("doc", "knowledge", knowledge.name, farm, knowledge.markdown);

  const plotById = new Map(ledger.plots.map((p) => [p.id, p]));
  const skipped: string[] = [];
  const plotFolders = new Map<string, string>();
  let cycles = 0;

  // Oldest first, so the folders appear in the order the farm lived them.
  const ordered = [...ledger.cycles].sort((a, b) =>
    (a.dateStarted ?? a.datePlanted ?? "").localeCompare(b.dateStarted ?? b.datePlanted ?? ""),
  );

  for (const cycle of ordered) {
    const dossier = cycleDossier(ledger, cycle.id, today);
    const plot = plotById.get(cycle.plotId);
    if (dossier === null || plot === undefined) {
      skipped.push(cycle.id);
      continue;
    }

    let plotFolder = plotFolders.get(plot.id);
    if (plotFolder === undefined) {
      plotFolder = await drive.folder("plot_folder", plot.id, plot.label, root);
      plotFolders.set(plot.id, plotFolder);
    }

    const cycleFolder = await drive.folder(
      "cycle_folder", cycle.id, dossier.folder, plotFolder,
    );
    await drive.text("history", cycle.id, dossier.name, cycleFolder, dossier.markdown);
    cycles += 1;
  }

  return { rootFolderId: root, cycles, plots: plotFolders.size, skipped };
}

/**
 * Where a photo of a plot belongs: in that plot's current cycle folder.
 *
 * Made on demand rather than during the mirror, because a photo is taken in
 * the field and should not have to wait for a nightly job to find its home.
 */
export async function cycleFolderFor(
  drive: Drive,
  ledger: Ledger,
  cycleId: string,
  rootFolderId: string,
  today = todayISO(),
): Promise<string | null> {
  const cycle = ledger.cycles.find((c) => c.id === cycleId);
  if (cycle === undefined) return null;
  const plot = ledger.plots.find((p) => p.id === cycle.plotId);
  const dossier = cycleDossier(ledger, cycleId, today);
  if (plot === undefined || dossier === null) return null;

  const plotFolder = await drive.folder("plot_folder", plot.id, plot.label, rootFolderId);
  return drive.folder("cycle_folder", cycle.id, dossier.folder, plotFolder);
}

/** drive_files, as the memory the Drive client writes through. */
export function supabaseMemory(admin: {
  from: (t: string) => {
    select: (c: string) => { eq: (a: string, b: string) => { eq: (a: string, b: string) => { maybeSingle: () => Promise<{ data: { file_id: string } | null }> } } };
    upsert: (row: Record<string, unknown>, opts: { onConflict: string }) => Promise<unknown>;
    delete: () => { eq: (a: string, b: string) => { eq: (a: string, b: string) => Promise<unknown> } };
  };
}): Remembered {
  return {
    async get(kind, ref) {
      const { data } = await admin
        .from("drive_files").select("file_id")
        .eq("kind", kind).eq("ref", ref).maybeSingle();
      return data?.file_id ?? null;
    },
    async put(kind, ref, fileId, name) {
      await admin.from("drive_files").upsert(
        { kind, ref, file_id: fileId, name, updated_at: new Date().toISOString() },
        { onConflict: "kind,ref" },
      );
    },
    async forget(kind, ref) {
      await admin.from("drive_files").delete().eq("kind", kind).eq("ref", ref);
    },
  };
}
