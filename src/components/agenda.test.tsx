import { describe, expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {} }),
}));
import { renderToStaticMarkup } from "react-dom/server";
import { Agenda } from "./agenda";
import type { AgendaItem } from "@/lib/domain/agenda";

const TODAY = "2026-11-02";

const item = (p: Partial<AgendaItem> & { id: string; dueOn: string }): AgendaItem => ({
  kind: "protocol", title: p.id, plotLabel: "Plot 11", blockName: null,
  isCritical: false, href: "/cycles/c1", ...p,
});

const render = (items: AgendaItem[]) =>
  renderToStaticMarkup(<Agenda items={items} today={TODAY} />);

describe("the farm's calendar", () => {
  it("says what fills it rather than just showing nothing", () => {
    const html = render([]);
    expect(html).toContain("Nothing planned");
    expect(html).toContain("accepted from a plot");
  });

  it("leads the phone list with what is overdue", () => {
    const html = render([
      item({ id: "late", title: "Ant bait", dueOn: "2026-10-28" }),
      item({ id: "soon", title: "Foliar feed", dueOn: "2026-11-06" }),
    ]);
    expect(html).toContain("Overdue · 1");
    expect(html.indexOf("Overdue")).toBeLessThan(html.indexOf("Next seven days"));
  });

  it("shows both kinds of work together, not in two lists", () => {
    const html = render([
      item({ id: "a", kind: "task", title: "Fix the fence", dueOn: TODAY }),
      item({ id: "b", kind: "protocol", title: "Ant bait", dueOn: TODAY }),
    ]);
    expect(html).toContain("Fix the fence");
    expect(html).toContain("Ant bait");
    expect(html).toContain("Today · 2");
  });

  it("names the block when the work was planned against one", () => {
    const html = render([item({ id: "a", dueOn: TODAY, blockName: "Block A" })]);
    expect(html).toContain("Plot 11 · Block A");
  });

  it("builds the month grid with a full week of headings", () => {
    const html = render([]);
    for (const day of ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]) {
      expect(html).toContain(`>${day}<`);
    }
    expect(html).toContain("November 2026");
  });

  it("counts only the month's own work above the grid", () => {
    // 29 October shows in the grid's first row but is not November's.
    const html = render([
      item({ id: "oct", dueOn: "2026-10-29" }),
      item({ id: "nov", dueOn: "2026-11-12" }),
    ]);
    expect(html).toContain("1 job");
  });

  it("every item links somewhere you can act on it", () => {
    const html = render([item({ id: "a", dueOn: TODAY, href: "/cycles/abc" })]);
    expect(html).toContain('href="/cycles/abc"');
  });

  it("folds away what is far off rather than burying today under it", () => {
    const html = render([
      item({ id: "now", title: "Ant bait", dueOn: TODAY }),
      ...Array.from({ length: 5 }, (_, i) =>
        item({ id: `far${i}`, title: `Later job ${i}`, dueOn: "2026-12-20" }),
      ),
    ]);
    expect(html).toContain("Show 5 more");
    expect(html).toContain("Ant bait");
  });
});

describe("a critical job", () => {
  it("is marked in the phone list, not only in the grid", () => {
    const html = renderToStaticMarkup(
      <Agenda today={TODAY} items={[
        item({ id: "a", title: "Collect the suwe", dueOn: TODAY, isCritical: true }),
      ]} />,
    );
    expect(html).toContain("(critical)");
  });
});
