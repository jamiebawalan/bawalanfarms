/**
 * @vitest-environment jsdom
 *
 * A suggestion he cannot read is worse than none: he acts on these. So this
 * checks the row actually shows the three things that let him judge it — what
 * to do, why, and by when — and that an accepted one stops offering itself.
 */
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SuggestionRow, type Suggestion } from "./suggestions";

const s: Suggestion = {
  title: "Measure D-leaf on 10 plants",
  dueDate: "2024-06-05",
  isCritical: false,
  reason: "The last reading was five weeks ago and there is no rate yet.",
};

const render = (suggestion: Suggestion, added = false) =>
  renderToStaticMarkup(
    <SuggestionRow suggestion={suggestion} added={added} onAccept={() => {}} />,
  );

describe("a suggested action", () => {
  it("shows what to do", () => {
    expect(render(s)).toContain("Measure D-leaf on 10 plants");
  });

  it("shows why, which is what makes it checkable", () => {
    expect(render(s)).toContain("The last reading was five weeks ago");
  });

  it("shows when, in the farm's date format", () => {
    expect(render(s)).toContain("5 Jun");
  });

  it("marks a critical one, and leaves an ordinary one unmarked", () => {
    expect(render({ ...s, isCritical: true })).toContain("Critical");
    expect(render(s)).not.toContain("Critical");
  });

  it("offers to add it", () => {
    expect(render(s)).toContain("Add it");
  });

  it("stops offering once it is on the list", () => {
    const html = render(s, true);
    expect(html).toContain("Added to the list");
    expect(html).not.toContain("Add it");
  });
});
