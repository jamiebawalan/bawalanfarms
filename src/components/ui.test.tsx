/**
 * @vitest-environment jsdom
 *
 * These render the primitives and read the output. The kit is small enough
 * that this is cheap, and the bug it exists to stop was not: Chip destructured
 * `children` out of its props and then rendered a self-closing <button />, so
 * every chip in the app came out an empty box. TypeScript is happy with an
 * unused variable, and no amount of testing pure functions would have found it.
 */
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Button, Chip, Money, Note, Stat } from "./ui";

describe("Chip", () => {
  it("shows its label — the whole point of a chip", () => {
    const html = renderToStaticMarkup(<Chip>Deweed</Chip>);
    expect(html).toContain("Deweed");
  });

  it("shows a plot number, which is what makes typing one unnecessary", () => {
    expect(renderToStaticMarkup(<Chip>24</Chip>)).toContain(">24<");
  });

  it("says whether it is selected, for screen readers as well as eyes", () => {
    expect(renderToStaticMarkup(<Chip selected>Food</Chip>)).toContain('aria-pressed="true"');
    expect(renderToStaticMarkup(<Chip>Food</Chip>)).toContain('aria-pressed="false"');
  });

  it("never submits a form by accident", () => {
    expect(renderToStaticMarkup(<Chip>Tanim</Chip>)).toContain('type="button"');
  });
});

describe("Button", () => {
  it("shows its label", () => {
    expect(renderToStaticMarkup(<Button>Save ₱1,800</Button>)).toContain("Save ₱1,800");
  });
});

describe("Money", () => {
  it("renders whole pesos by default", () => {
    expect(renderToStaticMarkup(<Money centavos={180_000} />)).toContain("₱1,800");
  });

  it("colours a loss differently from a profit when asked", () => {
    expect(renderToStaticMarkup(<Money centavos={-5000} signed />)).toContain("money-down");
    expect(renderToStaticMarkup(<Money centavos={5000} signed />)).toContain("money-up");
  });
});

describe("Note and Stat", () => {
  it("show what they are given", () => {
    expect(renderToStaticMarkup(<Note tone="warn">Check the year</Note>)).toContain("Check the year");
    const stat = renderToStaticMarkup(<Stat label="Margin" value="₱3,630" hint="72% of revenue" />);
    expect(stat).toContain("Margin");
    expect(stat).toContain("₱3,630");
    expect(stat).toContain("72% of revenue");
  });
});

describe("Money precision", () => {
  it("rounds absolute amounts to whole pesos", () => {
    expect(renderToStaticMarkup(<Money centavos={123_450} />)).toContain("₱1,235");
  });

  it("keeps centavos only when asked, for per-unit figures", () => {
    expect(renderToStaticMarkup(<Money centavos={463} precise />)).toContain("₱4.63");
  });
});
