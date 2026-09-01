/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Section } from "@/components/ui";

describe("a collapsible section", () => {
  it("shows its headline without being opened", () => {
    const html = renderToStaticMarkup(
      <Section title="Cash" summary="₱24,000 on hand · about 41 days">
        <p>inside</p>
      </Section>,
    );
    expect(html).toContain("Cash");
    expect(html).toContain("₱24,000 on hand");
  });

  it("starts closed, so the page is short", () => {
    const html = renderToStaticMarkup(<Section title="Land"><p>x</p></Section>);
    expect(html).not.toContain("<details open");
  });

  it("opens on its own when it is the one thing he must see", () => {
    const html = renderToStaticMarkup(
      <Section title="This week" defaultOpen summary="2 overdue"><p>x</p></Section>,
    );
    expect(html).toContain("<details open");
  });

  it("colours the headline when something is wrong", () => {
    const html = renderToStaticMarkup(
      <Section title="Cash" tone="danger" summary="spent"><p>x</p></Section>,
    );
    expect(html).toContain("text-danger");
  });

  it("still holds its content, closed or not", () => {
    const html = renderToStaticMarkup(<Section title="Land"><p>inside</p></Section>);
    expect(html).toContain("inside");
  });
});
