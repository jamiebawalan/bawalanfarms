/**
 * The farm brain.
 *
 * The thing worth guarding here is attribution. A suggestion that says "D003"
 * is telling the owners this rests on a decision they made, and if the id is
 * invented, or the text comes from the model rather than the record, the app is
 * putting words in their mouth. Everything else is presentation; that is trust.
 */
import { describe, expect, it } from "vitest";
import {
  CITABLE_IDS, DECISIONS, ENTITIES, OPEN_ITEMS, TIMELINE,
  describeCitation, farmBrief, findDecision, findOpenItem,
} from "./knowledge";
import { readSuggestions } from "./suggest";

describe("the record", () => {
  it("has the decisions and open questions from the export", () => {
    expect(DECISIONS.length).toBeGreaterThanOrEqual(9);
    expect(OPEN_ITEMS.length).toBeGreaterThanOrEqual(9);
    expect(ENTITIES.length).toBeGreaterThanOrEqual(18);
    expect(TIMELINE.length).toBeGreaterThanOrEqual(26);
  });

  it("gives every entry an id, because ids are what suggestions cite", () => {
    for (const d of DECISIONS) expect(d.id).toMatch(/^D\d{3}$/);
    for (const o of OPEN_ITEMS) expect(o.id).toMatch(/^O\d{3}$/);
  });

  it("has no id used twice across decisions and questions", () => {
    const ids = [...DECISIONS.map((d) => d.id), ...OPEN_ITEMS.map((o) => o.id)];
    expect(new Set(ids).size).toBe(ids.length);
    expect(CITABLE_IDS.size).toBe(ids.length);
  });

  it("finds a decision and a question by id", () => {
    expect(findDecision("D003")?.topic).toBe("crop_rotation");
    expect(findOpenItem("O003")?.topic).toBe("d_leaf_target");
    expect(findDecision("O003")).toBeNull();
    expect(findOpenItem("D003")).toBeNull();
  });

  it("describes either kind by id, and nothing for one it does not know", () => {
    expect(describeCitation("D001")).toContain("Smooth Cayenne");
    expect(describeCitation("O004")).toContain("peanut weed program");
    expect(describeCitation("D999")).toBeNull();
  });
});

describe("the brief the model reads", () => {
  const brief = farmBrief();

  it("says where the farm is and what it grows", () => {
    expect(brief).toContain("Silang, Cavite");
    expect(brief).toContain("Smooth Cayenne");
    expect(brief).toContain("25,000 plants per hectare");
  });

  it("carries the farm's own words, not translations of them", () => {
    expect(brief).toContain("suwe");
    expect(brief).toContain("salo");
    expect(brief).toContain("primera");
  });

  it("keeps both D-leaf thresholds, because the farm has not chosen between them", () => {
    // 75-85 cautious against 95-100 for bigger fruit. Collapsing that to one
    // number would be the app deciding something the owners have not.
    expect(brief).toContain("75-85 cm");
    expect(brief).toContain("95-100 cm");
  });

  it("marks which decisions are settled and which are still being tested", () => {
    expect(brief).toContain("D007");
    expect(brief).toMatch(/D007 \(potassium_trial, trial/);
    expect(brief).toMatch(/D001 \(primary_crop, active/);
  });

  it("carries every open question with its next step", () => {
    for (const o of OPEN_ITEMS) {
      expect(brief).toContain(o.id);
      expect(brief).toContain(o.next_step);
    }
  });

  it("ends on the owners' warning that old dosages were not prescriptions", () => {
    expect(brief).toContain("Do not treat every historical dosage");
  });

  it("shows recent events newest first", () => {
    const b = farmBrief(3);
    const at = (s: string) => b.indexOf(s);
    expect(at("2026-08-26")).toBeGreaterThan(0);
    expect(at("2026-08-26")).toBeLessThan(at("2026-08-02"));
  });
});

describe("what a suggestion is allowed to claim it rests on", () => {
  const base = {
    title: "Measure D-leaf on 10 plants",
    due_date: "2026-09-05",
    is_critical: false,
    reason: "No rate yet.",
    is_trial: false,
  };
  const parse = (rests_on: unknown) =>
    readSuggestions({ suggestions: [{ ...base, rests_on }], note: null }, "2026-09-01");

  it("attaches the text from the record, never from the model", () => {
    const r = parse("O003");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.suggestions[0]!.restsOn).toEqual({
      id: "O003",
      text: findOpenItem("O003")!.question,
    });
  });

  it("drops an id the owners never wrote, rather than showing an invented decision", () => {
    const r = parse("D042");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.suggestions[0]!.restsOn).toBeNull();
  });

  it("takes a lowercase id, since that is a formatting slip and not a claim", () => {
    const r = parse("d003");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.suggestions[0]!.restsOn?.id).toBe("D003");
  });

  it("accepts a suggestion that rests on nothing", () => {
    for (const value of [null, undefined, "", 7]) {
      const r = parse(value);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.suggestions[0]!.restsOn).toBeNull();
    }
  });

  it("only calls something a trial when the model said so explicitly", () => {
    const yes = readSuggestions(
      { suggestions: [{ ...base, rests_on: null, is_trial: true }], note: null },
      "2026-09-01",
    );
    expect(yes.ok && yes.suggestions[0]!.isTrial).toBe(true);
    const no = readSuggestions(
      { suggestions: [{ ...base, rests_on: null, is_trial: "maybe" }], note: null },
      "2026-09-01",
    );
    expect(no.ok && no.suggestions[0]!.isTrial).toBe(false);
  });
});
