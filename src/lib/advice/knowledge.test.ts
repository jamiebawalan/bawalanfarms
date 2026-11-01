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

  /**
   * The farm adopted a formal protocol on 1 November 2026, built from seven
   * expert consultations, and instructed that it override everything known
   * before. These tests are the guard on that instruction: the brief Claude
   * reads must lead with the protocol and must not quietly hand back the
   * superseded practice as advice.
   */
  it("leads with the protocol, and says it governs", () => {
    const head = brief.slice(0, brief.indexOf("# What the farm used to do"));
    expect(head).toContain("this governs");
    expect(head).toContain("Advice comes from here first");
  });

  it("carries the rule that makes the Del Monte numbers usable here", () => {
    expect(brief).toContain("dose per plant, not per hectare");
    // The three exceptions, which if scaled by plant count would be wrong by
    // a factor of thousands.
    expect(brief).toContain("never be scaled by plant count");
  });

  it("says MAP is not calendar age, which is true of most plots right now", () => {
    expect(brief).toContain("MAP is not calendar age");
  });

  it("forces on weight, not on D-leaf length", () => {
    expect(brief).toContain("Plant weight, not height, is the go signal");
    expect(brief).toContain("2.7 kg");
  });

  it("keeps the old practice, but after the protocol and marked superseded", () => {
    const historyAt = brief.indexOf("# What the farm used to do");
    const protocolAt = brief.indexOf("this governs");
    expect(historyAt).toBeGreaterThan(protocolAt);
    expect(brief).toContain("Superseded by the protocol");
    expect(brief).toContain("never a recommendation");
  });

  it("tells the reader the protocol wins wherever the history disagrees", () => {
    expect(brief).toContain("The protocol governs");
  });

  /**
   * A v1.0 document with nine unfinished edges. Presenting one of them as
   * settled is the most likely way this brief does harm.
   */
  it("names the protocol's own open questions as open", () => {
    expect(brief).toContain("Do not present any of these as settled");
    expect(brief).toContain("forcing recipe");
  });

  it("does not let a label rate be overridden by anything here", () => {
    expect(brief).toContain("current label directions");
  });
});
