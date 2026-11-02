import { describe, expect, it } from "vitest";
import {
  describeTiming,
  mapForPlantedOn,
  plantedOnForMap,
  suggestionsFor,
  supersededBy,
  type Activity,
} from "./protocol";

const act = (p: Partial<Activity> & { code: string; mapMonth: number }): Activity => ({
  category: "Nutrients",
  title: p.code,
  instruction: "",
  basis: "none",
  series: null,
  recoverableMonths: null,
  choiceGroup: null,
  isDefault: false,
  condition: null,
  sortOrder: 100,
  ...p,
});

const FOLIAR = [4, 5, 6, 7].map((m) =>
  act({ code: `foliar_${m}`, mapMonth: m, series: "foliar", recoverableMonths: 1 }),
);

describe("where a block sits", () => {
  it("round-trips a stage through a date", () => {
    for (const map of [0, 0.5, 3, 8, 12.5, 18]) {
      expect(mapForPlantedOn(plantedOnForMap(map, "2026-11-02"), "2026-11-02"))
        .toBeCloseTo(map, 1);
    }
  });

  it("advances by itself as time passes", () => {
    const planted = plantedOnForMap(5, "2026-11-02");
    expect(mapForPlantedOn(planted, "2026-12-02")).toBeCloseTo(6, 1);
  });
});

describe("a later round closes the earlier ones", () => {
  it("offers only the round the block has reached", () => {
    const out = suggestionsFor(6, FOLIAR);
    expect(out.map((s) => s.activity.code)).toEqual(["foliar_6", "foliar_7"]);
  });

  it("does not close across series", () => {
    const antBait = [1, 2, 3].map((m) =>
      act({ code: `ant_${m}`, mapMonth: m, series: "ant_bait", recoverableMonths: 1 }),
    );
    const drainage = act({ code: "drainage", mapMonth: -3, category: "Land prep" });
    const out = suggestionsFor(3, [...FOLIAR, ...antBait, drainage]);

    // The month-3 ant bait survives the month-3 foliar entirely.
    expect(out.map((s) => s.activity.code)).toContain("ant_3");
    // And the drainage, whose window shut, is gone — but not because of them.
    expect(out.map((s) => s.activity.code)).not.toContain("drainage");
  });

  it("records what it closed rather than dropping it silently", () => {
    const closed = supersededBy(FOLIAR[2]!, FOLIAR);
    expect(closed.map((a) => a.code)).toEqual(["foliar_4", "foliar_5"]);
  });

  it("does not re-close something already answered", () => {
    const closed = supersededBy(FOLIAR[2]!, FOLIAR, new Set(["foliar_4"]));
    expect(closed.map((a) => a.code)).toEqual(["foliar_5"]);
  });

  it("closes nothing when the activity stands alone", () => {
    expect(supersededBy(act({ code: "harvest", mapMonth: 18 }), FOLIAR)).toEqual([]);
  });
});

describe("the recovery window", () => {
  const sideDress = act({ code: "side_dress_5", mapMonth: 5, recoverableMonths: 2 });
  const landPrep = act({ code: "harrow", mapMonth: -3, category: "Land prep" });

  it("still offers a fertiliser round two months late", () => {
    expect(suggestionsFor(7, [sideDress]).map((s) => s.activity.code))
      .toEqual(["side_dress_5"]);
  });

  it("drops it once the window shuts", () => {
    expect(suggestionsFor(8, [sideDress])).toEqual([]);
  });

  it("never offers land prep under a standing crop", () => {
    expect(suggestionsFor(2, [landPrep])).toEqual([]);
  });

  it("honours the hard look-back cap over a generous activity", () => {
    const generous = act({ code: "x", mapMonth: 1, recoverableMonths: 12 });
    expect(suggestionsFor(6, [generous], [], { backMonths: 2 })).toEqual([]);
  });
});

describe("one decision with options", () => {
  const dap = act({
    code: "side_dress_2", mapMonth: 2, choiceGroup: "map2_nitrogen",
    isDefault: true, sortOrder: 150,
  });
  const amsul = act({
    code: "side_dress_2_alt", mapMonth: 2, choiceGroup: "map2_nitrogen",
    sortOrder: 151,
  });

  it("shows as one row, default first", () => {
    const out = suggestionsFor(2, [dap, amsul]);
    expect(out).toHaveLength(1);
    expect(out[0]!.activity.code).toBe("side_dress_2");
    expect(out[0]!.options.map((a) => a.code)).toEqual(["side_dress_2", "side_dress_2_alt"]);
  });

  it("drops the whole decision once either side is answered", () => {
    const out = suggestionsFor(2, [dap, amsul], [
      { activityCode: "side_dress_2_alt", state: "done" },
    ]);
    expect(out).toEqual([]);
  });
});

describe("what gets read first", () => {
  it("puts the closing window above what is merely due", () => {
    const late = act({ code: "late", mapMonth: 4, recoverableMonths: 2 });
    const due = act({ code: "due", mapMonth: 5 });
    const ahead = act({ code: "ahead", mapMonth: 6 });
    expect(suggestionsFor(5, [due, ahead, late]).map((s) => s.activity.code))
      .toEqual(["late", "due", "ahead"]);
  });

  it("says the month in words a farm manager uses", () => {
    expect(describeTiming({ kind: "due" })).toBe("due now");
    expect(describeTiming({ kind: "late", monthsLate: 1 })).toBe("a month late");
    expect(describeTiming({ kind: "late", monthsLate: 2 })).toBe("2 months late");
    expect(describeTiming({ kind: "ahead", monthsAway: 1 })).toBe("next month");
  });

  it("skips anything already answered", () => {
    const out = suggestionsFor(6, FOLIAR, [{ activityCode: "foliar_6", state: "skipped" }]);
    expect(out.map((s) => s.activity.code)).toEqual(["foliar_7"]);
  });
});
