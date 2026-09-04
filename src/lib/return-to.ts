/**
 * Where "back" goes after something is saved.
 *
 * Logging a cost is something the farm manager does in the middle of doing
 * something else — looking at a plot — so the way out has to lead back there.
 * The destination comes from the address bar, which means it has to be checked
 * rather than followed: a link in a message carrying `?from=https://…` is how a
 * "back" button becomes a login page on somebody else's server.
 *
 * So only one shape is accepted — a plot-cycle page in this app, whose id names
 * a cycle that actually exists. Anything else is dropped and he lands on Today,
 * which is the wrong place but a harmless one.
 */
export type ReturnTarget = { href: string; label: string };

const CYCLE_PATH = /^\/cycles\/([0-9a-f-]{36})$/i;

export function returnTarget(
  from: string | null | undefined,
  cycles: readonly { id: string; plotId: string }[],
  plots: readonly { id: string; label: string }[],
): ReturnTarget | null {
  if (from === null || from === undefined) return null;

  // "//host", "https://host" and "\\host" all leave this app; "/cycles/x" does
  // not. Backslashes are named because some browsers treat them as slashes.
  if (!from.startsWith("/") || from.startsWith("//") || from.includes("\\")) {
    return null;
  }

  const cycleId = CYCLE_PATH.exec(from)?.[1];
  if (cycleId === undefined) return null;

  const cycle = cycles.find((c) => c.id.toLowerCase() === cycleId.toLowerCase());
  if (!cycle) return null;

  const plot = plots.find((p) => p.id === cycle.plotId);
  return { href: `/cycles/${cycle.id}`, label: plot?.label ?? "the plot" };
}
