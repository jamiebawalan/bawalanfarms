import { describe, expect, it } from "vitest";
import {
  describeTiming,
  mapForPlantedOn,
  plantedOnForMap,
  dosesFor,
  forcingReadiness,
  formatAmount,
  sizeOf,
  suggestionsFor,
  tankPlan,
  supersededBy,
  type Activity,
  type ActivityMaterial,
  type Material,
} from "./protocol";

const act = (p: Partial<Activity> & { code: string; mapMonth: number }): Activity => ({
  category: "Nutrients",
  title: p.code,
  instruction: "",
  basis: "none",
  series: null,
  choiceGroup: null,
  isDefault: false,
  condition: null,
  sortOrder: 100,
  ...p,
});

const FOLIAR = [4, 5, 6, 7].map((m) =>
  act({ code: `foliar_${m}`, mapMonth: m, series: "foliar" }),
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
      act({ code: `ant_${m}`, mapMonth: m, series: "ant_bait" }),
    );
    const drainage = act({ code: "drainage", mapMonth: -3, category: "Land prep" });
    const out = suggestionsFor(3, [...FOLIAR, ...antBait, drainage]);

    // The month-3 ant bait survives the month-3 foliar entirely.
    expect(out.map((s) => s.activity.code)).toContain("ant_3");
    // And the drainage, whose window shut, is gone — but not because of them.
    expect(out.map((s) => s.activity.code)).not.toContain("drainage");
  });

  it("records what it closed rather than dropping it silently", () => {
    // Month 6 closes month 5. Month 4 is outside the window — it was never
    // on the screen, so closing it would be inventing a backlog to bury.
    const closed = supersededBy(FOLIAR[2]!, FOLIAR);
    expect(closed.map((a) => a.code)).toEqual(["foliar_5"]);
  });

  it("does not re-close something already answered", () => {
    const closed = supersededBy(FOLIAR[2]!, FOLIAR, new Set(["foliar_4"]));
    expect(closed.map((a) => a.code)).toEqual(["foliar_5"]);
  });

  it("closes nothing when the activity stands alone", () => {
    expect(supersededBy(act({ code: "harvest", mapMonth: 18 }), FOLIAR)).toEqual([]);
  });
});

describe("the app looks forward, and keeps no backlog", () => {
  const sideDress = act({ code: "side_dress_5", mapMonth: 5 });
  const landPrep = act({ code: "harrow", mapMonth: -3, category: "Land prep" });

  it("treats this month's work as current, not late", () => {
    // Part-way through month 5, the month-5 job is simply this month's job.
    expect(suggestionsFor(5.3, [sideDress]).map((s) => s.activity.code))
      .toEqual(["side_dress_5"]);
    expect(suggestionsFor(5.3, [sideDress])[0]!.timing.kind).toBe("late");
  });

  it("lets the month go once it is over", () => {
    expect(suggestionsFor(6.5, [sideDress])).toEqual([]);
  });

  it("never offers land prep under a standing crop", () => {
    expect(suggestionsFor(2, [landPrep])).toEqual([]);
  });

  it("offers no backlog however far behind the block is", () => {
    const wholeCrop = [0, 1, 2, 3, 4, 5, 6, 7, 8].map((m) =>
      act({ code: `job_${m}`, mapMonth: m }),
    );
    // A block at month 8 is not asked about months 0 to 6. That catching-up
    // is a conversation with the consultant, not a list on a phone.
    expect(suggestionsFor(8, wholeCrop).map((s) => s.activity.code))
      .toEqual(["job_7", "job_8"]);
  });

  it("does not manufacture a backlog when a late round is answered", () => {
    const rounds = [4, 5, 6, 7, 8, 9].map((m) =>
      act({ code: `foliar_${m}`, mapMonth: m, series: "foliar" }),
    );
    // Answering month 9 closes month 8, which he could have seen. It does
    // not write off months 4 to 7, which he never was shown.
    expect(supersededBy(rounds[5]!, rounds).map((a) => a.code)).toEqual(["foliar_8"]);
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
    const late = act({ code: "late", mapMonth: 4 });
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

describe("what to carry out to the field", () => {
  const mat = (code: string, unit: "kg" | "L" = "kg"): Material => ({
    code, name: code, kind: "fertiliser", analysis: null, unit, note: null,
  });
  const catalogue = new Map<string, Material>([
    ["urea", mat("urea")],
    ["zinc_sulfate", mat("zinc_sulfate")],
    ["glyphosate", mat("glyphosate", "L")],
  ]);
  const foliar = act({ code: "foliar_9", mapMonth: 9, basis: "per_plant" });
  const lines: ActivityMaterial[] = [
    { activityCode: "foliar_9", materialCode: "urea", qty: 2.52,
      qtyUnit: "g_per_plant", mixOrder: 6, note: null },
    { activityCode: "foliar_9", materialCode: "zinc_sulfate", qty: 0.012,
      qtyUnit: "g_per_plant", mixOrder: 2, note: null },
  ];

  it("reproduces the protocol's own worked example", () => {
    const { doses } = dosesFor(foliar, lines, catalogue, { plants: 2650, areaSqm: 1000 });
    expect(doses.map((d) => `${d.material.code} ${d.display}`))
      .toEqual(["zinc_sulfate 31.8 g", "urea 6.68 kg"]);
  });

  it("returns them in mixing order, urea last", () => {
    const { doses } = dosesFor(foliar, lines, catalogue, { plants: 2650, areaSqm: 1000 });
    expect(doses.map((d) => d.mixOrder)).toEqual([2, 6]);
  });

  it("says it needs a plant count rather than guessing one", () => {
    const out = dosesFor(foliar, lines, catalogue, { plants: null, areaSqm: 1000 });
    expect(out).toEqual({ doses: [], missing: "plants" });
  });

  it("says it needs an area for a per-area round", () => {
    const spray = act({ code: "knockdown", mapMonth: -6, basis: "per_area" });
    const areaLines: ActivityMaterial[] = [
      { activityCode: "knockdown", materialCode: "glyphosate", qty: 1000,
        qtyUnit: "ml_per_1000sqm", mixOrder: null, note: null },
    ];
    expect(dosesFor(spray, areaLines, catalogue, { plants: 2650, areaSqm: null }))
      .toEqual({ doses: [], missing: "area" });
    const { doses } = dosesFor(spray, areaLines, catalogue, { plants: null, areaSqm: 3000 });
    expect(doses[0]!.display).toBe("3 L");
  });

  it("asks for nothing when the activity consumes nothing", () => {
    const walk = act({ code: "mortality_check", mapMonth: 0.5 });
    expect(dosesFor(walk, lines, catalogue, { plants: null, areaSqm: null }))
      .toEqual({ doses: [], missing: null });
  });

  it("keeps the decimals on a small weight and drops them on a large one", () => {
    expect(formatAmount(2.3, "g")).toBe("2.3 g");
    expect(formatAmount(31.8, "g")).toBe("31.8 g");
    expect(formatAmount(478.9, "g")).toBe("479 g");
    expect(formatAmount(6678, "g")).toBe("6.68 kg");
    expect(formatAmount(150_000, "g")).toBe("150 kg");
    expect(formatAmount(93, "ml")).toBe("93 ml");
    expect(formatAmount(3000, "ml")).toBe("3 L");
  });
});

describe("how big a block is", () => {
  it("takes its area from its share and its plants from the count", () => {
    expect(sizeOf({ landPct: 30, plantCount: 4500 }, { areaSqm: 10_000, plants: 10_000 }))
      .toEqual({ plants: 4500, areaSqm: 3000 });
  });

  it("falls back to the whole plot when there are no blocks", () => {
    expect(sizeOf(null, { areaSqm: 10_000, plants: 10_000 }))
      .toEqual({ plants: 10_000, areaSqm: 10_000 });
  });

  it("does not apportion the plant count by land share", () => {
    // A block that is 30% of the land but holds 45% of the plants gets 45%.
    const size = sizeOf({ landPct: 30, plantCount: 4500 }, { areaSqm: 10_000, plants: 10_000 });
    expect(size.plants).toBe(4500);
    expect(size.plants).not.toBe(3000);
  });
});

describe("whether the plot can be forced", () => {
  const even = (n: number, g: number) => Array.from({ length: n }, () => g);

  it("forces a plot that meets every criterion", () => {
    const check = forcingReadiness(even(10, 2800))!;
    expect(check.ready).toBe(true);
    expect(check.blocker).toBeNull();
  });

  it("refuses a plot whose average is short", () => {
    const check = forcingReadiness(even(10, 2400))!;
    expect(check.ready).toBe(false);
    expect(check.blocker).toContain("Average plant weight is 2.4 kg");
  });

  it("catches the spread an average hides", () => {
    // Averages 2.8 kg, which alone looks ready. Half the plants are 2.2.
    const check = forcingReadiness([...even(5, 2200), ...even(5, 3400)])!;
    expect(check.averageGrams).toBe(2800);
    expect(check.ready).toBe(false);
    expect(check.blocker).toContain("50%");
  });

  it("refuses a plot with one plant too light", () => {
    const check = forcingReadiness([...even(19, 2900), 2000])!;
    expect(check.criteria.find((c) => c.label === "Lightest plant")!.met).toBe(false);
    expect(check.ready).toBe(false);
  });

  it("refuses an over-robust plot, which is hard to force", () => {
    const check = forcingReadiness(even(10, 3500))!;
    expect(check.ready).toBe(false);
    expect(check.blocker).toContain("Average not over");
  });

  it("will not read a survey that weighed nothing", () => {
    expect(forcingReadiness([])).toBeNull();
    expect(forcingReadiness([0, Number.NaN])).toBeNull();
  });

  it("judges on weight, never on height or age", () => {
    // The same plot, weighed. No D-leaf length is consulted to reach a verdict.
    const check = forcingReadiness(even(10, 2750))!;
    expect(check.ready).toBe(true);
    expect(check.weighed).toBe(10);
  });
});

describe("loading the knapsack", () => {
  const mat = (code: string): Material => ({
    code, name: code, kind: "fertiliser", analysis: null, unit: "kg", note: null,
  });
  const catalogue = new Map<string, Material>(
    ["urea", "iron_sulfate", "zinc_sulfate", "solubor", "mop", "epsom", "glyphosate"]
      .map((c) => [c, mat(c)]),
  );
  // The MAP 9 foliar round, exactly as the protocol seeds it.
  const foliar9 = act({ code: "foliar_9", mapMonth: 9, basis: "per_plant" });
  const lines: ActivityMaterial[] = [
    ["mop", 0.17, 1], ["zinc_sulfate", 0.012, 2], ["epsom", 0.51, 3],
    ["iron_sulfate", 0.20, 4], ["solubor", 0.048, 5], ["urea", 2.52, 6],
  ].map(([code, qty, order]) => ({
    activityCode: "foliar_9", materialCode: code as string, qty: qty as number,
    qtyUnit: "g_per_plant" as const, mixOrder: order as number, note: null,
  }));

  /*
   * The protocol's own worked example: a 16 L knapsack at about 85 ml per
   * plant covers roughly 190 plants, and carries urea 479 g, iron 37 g,
   * zinc 2.3 g, Solubor 9 g, MOP 33 g, Epsom 97 g.
   *
   * 0.1 ha at 2,650 plants gives 2,000 L/ha x 0.1 = 200 L over 2,650 plants
   * = 75 ml each, so 16 L covers 212. Scaled to the protocol's own 190-plant
   * tank the grams match its figures.
   */
  const size = { plants: 2650, areaSqm: 1000 };

  it("works out the water by area and the plants per tank from it", () => {
    const plan = tankPlan(foliar9, lines, catalogue, size)!;
    expect(plan.waterLitres).toBe(200);
    expect(plan.mlPerPlant).toBe(75);
    expect(plan.plantsPerTank).toBe(212);
  });

  it("reproduces the protocol's grams when the tank holds its 190 plants", () => {
    // 2,650 plants over 1,113 sqm is 190 plants to a 16 L tank.
    const plan = tankPlan(foliar9, lines, catalogue, { plants: 2650, areaSqm: 1113 })!;
    expect(plan.plantsPerTank).toBe(190);
    const grams = Object.fromEntries(
      plan.lines.map((l) => [l.material.code, Math.round(l.amount)]),
    );
    expect(grams).toEqual({
      urea: 479, iron_sulfate: 38, zinc_sulfate: 2, solubor: 9, mop: 32, epsom: 97,
    });
  });

  it("keeps the mixing order, urea last", () => {
    const plan = tankPlan(foliar9, lines, catalogue, size)!;
    expect(plan.lines.map((l) => l.material.code)).toEqual([
      "mop", "zinc_sulfate", "epsom", "iron_sulfate", "solubor", "urea",
    ]);
  });

  it("says how many full tanks and what the last one covers", () => {
    const plan = tankPlan(foliar9, lines, catalogue, size)!;
    // 2,650 plants at 212 a tank: twelve full, then 106 left.
    expect(plan.fullTanks).toBe(12);
    expect(plan.lastTankPlants).toBe(106);
    expect(plan.fullTanks * plan.plantsPerTank + plan.lastTankPlants).toBe(2650);
  });

  it("premixes what cannot be weighed in a field, and only that", () => {
    const plan = tankPlan(foliar9, lines, catalogue, size)!;
    const zinc = plan.lines.find((l) => l.material.code === "zinc_sulfate")!;
    const urea = plan.lines.find((l) => l.material.code === "urea")!;

    // 2.5 g a tank is not a field weighing.
    expect(zinc.premix).not.toBeNull();
    expect(zinc.premix!.totalDisplay).toBe("31.8 g");
    expect(zinc.premix!.perTankMl).toBe(100);
    // Thirteen tanks, so 1.3 L of premix at 100 ml each.
    expect(zinc.premix!.dissolveInMl).toBe(1300);

    // Half a kilo of urea is weighed in the ordinary way.
    expect(urea.premix).toBeNull();
  });

  it("does not premix when the whole plot is one tank", () => {
    const plan = tankPlan(foliar9, lines, catalogue, { plants: 150, areaSqm: 60 })!;
    expect(plan.fullTanks + (plan.lastTankPlants > 0 ? 1 : 0)).toBe(1);
    expect(plan.lines.every((l) => l.premix === null)).toBe(true);
  });

  it("warns when the mix falls outside what the protocol expects", () => {
    // Far too many plants for the ground they are supposed to sit on.
    const plan = tankPlan(foliar9, lines, catalogue, { plants: 9000, areaSqm: 1000 })!;
    expect(plan.warning).toContain("ml of mix per plant");
    expect(plan.warning).toContain("Check the plant count");
  });

  it("says nothing for work that never goes in a tank", () => {
    const granules = act({ code: "side_dress_5", mapMonth: 5, basis: "per_plant" });
    expect(tankPlan(granules, [], catalogue, size)).toBeNull();

    const sprayed = act({ code: "knockdown", mapMonth: -6, basis: "per_area" });
    expect(tankPlan(sprayed, lines, catalogue, size)).toBeNull();
  });

  it("refuses to plan a tank without a plant count", () => {
    expect(tankPlan(foliar9, lines, catalogue, { plants: null, areaSqm: 1000 })).toBeNull();
    expect(tankPlan(foliar9, lines, catalogue, { plants: 2650, areaSqm: null })).toBeNull();
  });
});
