import { describe, expect, it } from "vitest";
import { returnTarget } from "./return-to";

const CYCLE = "11111111-2222-4333-8444-555555555555";
const PLOT = "aaaaaaaa-0000-4000-8000-000000000001";
const cycles = [{ id: CYCLE, plotId: PLOT }];
const plots = [{ id: PLOT, label: "Plot 12" }];

describe("finding the way back after logging a cost", () => {
  it("goes back to the plot he came from, by name", () => {
    expect(returnTarget(`/cycles/${CYCLE}`, cycles, plots)).toEqual({
      href: `/cycles/${CYCLE}`,
      label: "Plot 12",
    });
  });

  it("has no opinion when he came in through the Log tab", () => {
    expect(returnTarget(undefined, cycles, plots)).toBeNull();
    expect(returnTarget(null, cycles, plots)).toBeNull();
  });

  it("names the plot generically if the plot record is missing", () => {
    expect(returnTarget(`/cycles/${CYCLE}`, cycles, [])?.label).toBe("the plot");
  });

  it("ignores a cycle that does not exist", () => {
    expect(
      returnTarget("/cycles/99999999-2222-4333-8444-555555555555", cycles, plots),
    ).toBeNull();
  });
});

/**
 * The destination arrives in the address bar, so it is attacker-controlled in
 * the only way that matters here: a link sent to the farm manager. Following it
 * unchecked is how a "back" button lands him on a login page that is not ours
 * and takes his password. Every one of these has to come back null.
 */
describe("refusing to be sent anywhere but this app", () => {
  const offSite = [
    "https://evil.example/login",
    "//evil.example/login",
    "http://evil.example",
    "\\\\evil.example",
    "/\\evil.example",
    "javascript:alert(1)",
    "data:text/html,<h1>hi</h1>",
    "/cycles/../../evil",
    "",
  ];

  for (const from of offSite) {
    it(`refuses ${JSON.stringify(from)}`, () => {
      expect(returnTarget(from, cycles, plots)).toBeNull();
    });
  }

  it("refuses an in-app path that is not a plot page", () => {
    expect(returnTarget("/settings", cycles, plots)).toBeNull();
    expect(returnTarget("/import", cycles, plots)).toBeNull();
  });

  /**
   * Built from the record, never echoed from the input — so a path that passes
   * the check still cannot smuggle a query string or fragment through.
   */
  it("rebuilds the path from the cycle rather than echoing what was sent", () => {
    expect(returnTarget(`/cycles/${CYCLE}?x=1`, cycles, plots)).toBeNull();
    expect(returnTarget(`/cycles/${CYCLE.toUpperCase()}`, cycles, plots)?.href)
      .toBe(`/cycles/${CYCLE}`);
  });
});
