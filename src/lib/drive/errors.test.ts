/**
 * What the owner is told when Google says no.
 *
 * The first version answered every 403 with "connect it again from Settings",
 * which is confident, tidy, and wrong for the most common cause — the Drive API
 * simply not being switched on. It sent someone through the whole authorisation
 * dance to fix a project setting that reconnecting cannot touch. A message that
 * misdirects costs more than no message at all.
 */
import { describe, expect, it } from "vitest";
import { messageIn, reasonIn } from "./drive";

const googleError = (reason: string, message: string, status = 403) =>
  JSON.stringify({
    error: {
      code: status,
      message,
      errors: [{ domain: "usageLimits", reason, message }],
    },
  });

describe("reading Google's error body", () => {
  it("finds the machine-readable reason", () => {
    expect(reasonIn(googleError("accessNotConfigured", "..."))).toBe("accessNotConfigured");
    expect(reasonIn(googleError("storageQuotaExceeded", "..."))).toBe("storageQuotaExceeded");
  });

  it("falls back to the status field when there is no errors array", () => {
    expect(reasonIn(JSON.stringify({ error: { status: "PERMISSION_DENIED" } })))
      .toBe("PERMISSION_DENIED");
  });

  it("finds Google's own sentence, which is usually the useful part", () => {
    const body = googleError(
      "accessNotConfigured",
      "Google Drive API has not been used in project 123 before or it is disabled.",
    );
    expect(messageIn(body)).toContain("has not been used in project");
  });

  it("truncates a runaway message rather than filling the screen", () => {
    const body = JSON.stringify({ error: { message: "x".repeat(1000) } });
    expect(messageIn(body)!.length).toBe(300);
  });

  it("survives a body that is not JSON at all", () => {
    // Proxies and error pages return HTML. Throwing here would replace a bad
    // message with no message.
    for (const junk of ["<html>502</html>", "", "{not json"]) {
      expect(reasonIn(junk)).toBeNull();
      expect(messageIn(junk)).toBeNull();
    }
  });

  it("returns nothing rather than empty text for an empty message", () => {
    expect(messageIn(JSON.stringify({ error: { message: "" } }))).toBeNull();
  });
});
