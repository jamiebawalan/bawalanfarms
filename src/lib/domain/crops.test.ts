import { describe, expect, it } from "vitest";
import { isCountedPerPlant } from "./crops";

describe("which crops are counted plant by plant", () => {
  it("counts pineapple, which is what the 40g dose and cost per plant rest on", () => {
    expect(isCountedPerPlant("pineapple")).toBe(true);
    expect(isCountedPerPlant("Pineapple")).toBe(true);
  });

  it("does not count peanut or banana", () => {
    // The farm does not track these plant by plant, so the app must not ask.
    expect(isCountedPerPlant("peanut")).toBe(false);
    expect(isCountedPerPlant("banana")).toBe(false);
    expect(isCountedPerPlant("mane")).toBe(false);
    expect(isCountedPerPlant("corn")).toBe(false);
  });
});
