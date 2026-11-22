import { describe, expect, it, vi } from "vitest";
let path = "/expenses/new";
vi.mock("next/navigation", () => ({ usePathname: () => path }));
import { renderToStaticMarkup } from "react-dom/server";
import { LogTabs } from "./log-tabs";

const at = (p: string) => { path = p; return renderToStaticMarkup(<LogTabs />); };

describe("the three things that get written down", () => {
  it("offers all three from any of them", () => {
    const html = at("/expenses/new");
    expect(html).toContain("Cash costs");
    expect(html).toContain("Use inputs");
    expect(html).toContain("Buy inputs");
  });

  it("says cash, because not every cost is cash and not every payment is a cost", () => {
    // Buying stock leaves the float and charges no plot; using stock charges a
    // plot and touches no float. A tab called just "Cost" claimed both.
    expect(at("/expenses/new")).not.toMatch(/>Cost</);
  });

  it("puts using stock before buying it, by how often each happens", () => {
    // He uses stock on most rounds; he buys a few times a season.
    const html = at("/expenses/new");
    expect(html.indexOf("Use inputs")).toBeLessThan(html.indexOf("Buy inputs"));
  });

  /** The href of whichever link is marked as the current page. */
  const current = (html: string): string[] =>
    [...html.matchAll(/<a\b[^>]*>/g)]
      .filter((tag) => tag[0].includes('aria-current="page"'))
      .map((tag) => /href="([^"]+)"/.exec(tag[0])?.[1] ?? "");

  it("marks exactly one as the page he is on", () => {
    expect(current(at("/inputs/use"))).toEqual(["/inputs/use"]);
    expect(current(at("/inputs/buy"))).toEqual(["/inputs/buy"]);
    expect(current(at("/expenses/new"))).toEqual(["/expenses/new"]);
  });

  it("marks none of them on a page that is not one of the three", () => {
    expect(at("/inputs")).not.toContain('aria-current="page"');
  });
});
