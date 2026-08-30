/**
 * The farm brain.
 *
 * Eighteen months of the owners' agronomy conversations, exported as a
 * structured memory and kept here as the standing context behind every
 * suggestion the app makes. The plot pages already know what a cycle cost and
 * how the plants are growing; this is what the farm has decided, tried and not
 * yet settled. Neither half is much use alone.
 *
 * It lives in the repository rather than the database on purpose. This is
 * knowledge that changes a few times a year and matters enormously when it
 * does, so it belongs somewhere with a history you can read — who changed the
 * forcing threshold, and when — rather than in a row someone can quietly edit.
 */

import decisionsJson from "./decisions.json";
import openItemsJson from "./open-items.json";
import entitiesJson from "./entities.json";
import timelineJson from "./timeline.json";
import { AGRONOMY, EXPORTED_ON, FARM, HOW_THEY_WORK, INTERPRETATION } from "./narrative";

export type DecisionStatus = "active" | "trial" | "considering" | "planning";

export type Decision = {
  id: string;
  topic: string;
  decision: string;
  status: string;
  confidence?: string;
  rationale?: string;
  metrics?: string[];
};

export type OpenItem = {
  id: string;
  topic: string;
  question: string;
  next_step: string;
};

export type Entity = {
  id: string;
  type: string;
  name: string;
  attributes: Record<string, unknown>;
};

export type TimelineEvent = { date: string; event: string; source?: string };

export const DECISIONS: Decision[] = decisionsJson;
export const OPEN_ITEMS: OpenItem[] = openItemsJson;
export const ENTITIES: Entity[] = entitiesJson;
export const TIMELINE: TimelineEvent[] = timelineJson;

export const KNOWLEDGE = {
  exportedOn: EXPORTED_ON,
  decisions: DECISIONS,
  openItems: OPEN_ITEMS,
  entities: ENTITIES,
  timeline: TIMELINE,
};

/** Every id the model is allowed to cite, so a made-up one can be caught. */
export const CITABLE_IDS: ReadonlySet<string> = new Set([
  ...DECISIONS.map((d) => d.id),
  ...OPEN_ITEMS.map((o) => o.id),
]);

export function findDecision(id: string): Decision | null {
  return DECISIONS.find((d) => d.id === id) ?? null;
}

export function findOpenItem(id: string): OpenItem | null {
  return OPEN_ITEMS.find((o) => o.id === id) ?? null;
}

/** A decision or open item, whichever the id belongs to, as one line. */
export function describeCitation(id: string): string | null {
  const d = findDecision(id);
  if (d !== null) return d.decision;
  const o = findOpenItem(id);
  if (o !== null) return o.question;
  return null;
}

/**
 * The brain as the model reads it.
 *
 * Decisions come with their status because the difference between "active" and
 * "trial" is the difference between something to build on and something still
 * being tested — and advice that confuses the two is how a trial quietly
 * becomes standard practice without anyone deciding it should.
 */
export function farmBrief(recentEvents = 12): string {
  const parts: string[] = [];

  parts.push("# What this farm is");
  parts.push(FARM);

  parts.push("");
  parts.push("# How the owners want to be advised");
  parts.push(HOW_THEY_WORK);

  parts.push("");
  parts.push("# What the farm has learned");
  parts.push(AGRONOMY);

  parts.push("");
  parts.push("# Decisions on the record");
  parts.push(
    "Cite these by id when a suggestion rests on one. Status matters: `active` is settled practice, `trial` is being tested and its result is not yet in, `considering` and `planning` are not yet being done at all.",
  );
  for (const d of DECISIONS) {
    const bits = [`- ${d.id} (${d.topic}, ${d.status}`];
    if (d.confidence !== undefined) bits.push(`, confidence ${d.confidence}`);
    bits.push(`): ${d.decision}`);
    if (d.rationale !== undefined) bits.push(` Why: ${d.rationale}`);
    if (d.metrics !== undefined) bits.push(` Metrics: ${d.metrics.join(", ")}.`);
    parts.push(bits.join(""));
  }

  parts.push("");
  parts.push("# Questions the farm has not answered");
  parts.push(
    "These are the open loops. A suggestion that closes one is worth more than a suggestion that does not, so cite the id when it does.",
  );
  for (const o of OPEN_ITEMS) {
    parts.push(`- ${o.id} (${o.topic}): ${o.question}\n  Next step: ${o.next_step}`);
  }

  const recent = [...TIMELINE].sort((a, b) => b.date.localeCompare(a.date)).slice(0, recentEvents);
  if (recent.length > 0) {
    parts.push("");
    parts.push("# What has happened lately");
    for (const e of recent) parts.push(`- ${e.date}: ${e.event}`);
  }

  parts.push("");
  parts.push("# How to read all of this");
  parts.push(INTERPRETATION);

  return parts.join("\n");
}
