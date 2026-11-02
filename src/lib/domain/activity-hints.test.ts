import { describe, expect, it } from "vitest";
import { hintsFor, nudgeFor, type ActivityOption } from "./activity-hints";

const A = (code: string, label: string, activityGroup = "x"): ActivityOption =>
  ({ code, label, activityGroup });

const ACTIVITIES: ActivityOption[] = [
  A("machine_repair", "Repairs and parts", "Machines"),
  A("machine_fuel", "Fuel", "Machines"),
  A("side_dress", "Side-dress (granules)", "Nutrients"),
  A("weed_manual", "Tabas / hand weeding", "Weeds"),
  A("weed_spray", "Weed spray (chemical)", "Weeds"),
  A("crew_food", "Crew food", "Crew"),
  A("peanut_seed", "Peanut seed (binhi)", "Peanut"),
  A("peanut_shell", "Shell the seed (himay)", "Peanut"),
  A("admin", "Admin, subscriptions, office", "Overheads"),
  A("vehicle", "Vehicles (not farm machines)", "Overheads"),
  A("stack_haul", "Stack and haul", "Harvest"),
  A("other", "Other (say what, in the note)", "Other"),
];

const codes = (text: string) => hintsFor(text, ACTIVITIES).map((h) => h.code);

describe("finding the activity from what was typed", () => {
  /*
   * Every one of these is a real phrase from the farm's own "Other" entries,
   * which is the only honest test of whether this would have helped.
   */
  it("catches the vehicle repairs that went to Other", () => {
    expect(codes("wrangler parts")).toContain("machine_repair");
    expect(codes("Ball Joints, Bearings, Seals")).toContain("machine_repair");
    expect(codes("Barang Chassis Repair")).toContain("machine_repair");
    expect(codes("New Barang hydroback")).toContain("machine_repair");
    expect(codes("Sychronizers 4 pcs")).toContain("machine_repair");
  });

  it("catches the fertiliser that had no code", () => {
    expect(codes("Fertilizer of 18 sacks used")).toContain("side_dress");
    expect(codes("16-20-0")).toContain("side_dress");
    expect(codes("Zinc sulphate")).toContain("side_dress");
    expect(codes("Urea Supply 8 kgs")).toContain("side_dress");
  });

  it("catches the peanut work", () => {
    expect(codes("Mane Binhi")).toContain("peanut_seed");
    expect(codes("Himay Mane")).toContain("peanut_shell");
  });

  it("catches the overheads", () => {
    expect(codes("ChatGPT 1 yr subscription oct 2025 - sept 2026")).toContain("admin");
    expect(codes("hilux taillight na binangga ni danilo")).toContain("vehicle");
    expect(codes("BYD/Hilux Full tanks")).toContain("vehicle");
  });

  it("reads Tagalog as readily as English", () => {
    expect(codes("Start tabas")).toContain("weed_manual");
    expect(codes("Chemical Deweed")).toContain("weed_spray");
    expect(codes("Baba, Hakot, Transport")).toContain("stack_haul");
  });

  it("never offers Other as a suggestion for Other", () => {
    expect(codes("something nobody can place")).not.toContain("other");
  });

  it("says nothing rather than guessing at a fragment", () => {
    expect(hintsFor("ab", ACTIVITIES)).toEqual([]);
    expect(hintsFor("", ACTIVITIES)).toEqual([]);
  });

  it("offers at most three, so the list is readable", () => {
    expect(hintsFor("fertilizer spray repair fuel food", ACTIVITIES).length)
      .toBeLessThanOrEqual(3);
  });

  it("says which word it matched on, so the guess can be judged", () => {
    const [first] = hintsFor("wrangler parts", ACTIVITIES);
    expect(first!.because).toBeTruthy();
    expect("wrangler parts").toContain(first!.because);
  });
});

describe("noticing what is not an activity at all", () => {
  it("spots a plot written into the note", () => {
    // 50,000 pesos was logged this way.
    const n = nudgeFor("Plot 25 and 26", ACTIVITIES);
    expect(n!.field).toBe("attribution");
    expect(n!.message).toContain("cannot be split");
  });

  it("spots a name written into the note", () => {
    // 'Daddy', eight times, 25,700 pesos.
    const n = nudgeFor("Daddy", ACTIVITIES);
    expect(n!.field).toBe("paid_to");
    expect(n!.message).toContain("Daddy");
  });

  it("leaves a real description alone", () => {
    expect(nudgeFor("wrangler parts", ACTIVITIES)).toBeNull();
    expect(nudgeFor("fence repair by the gate", ACTIVITIES)).toBeNull();
    expect(nudgeFor("Crew food", ACTIVITIES)).toBeNull();
  });

  it("does not mistake a capitalised activity for a person", () => {
    // Nudging about a word that was fine is how people learn to tap past it.
    expect(nudgeFor("Fuel", ACTIVITIES)).toBeNull();
  });

  it("says nothing about a fragment", () => {
    expect(nudgeFor("Da", ACTIVITIES)).toBeNull();
  });
});
