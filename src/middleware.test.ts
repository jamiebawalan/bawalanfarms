/**
 * The magic-link rescue, and what it must not swallow.
 *
 * This rule was written for one thing — a Supabase magic link landing on the
 * site root — and it quietly broke another: it caught Google's OAuth callback
 * on its way to /api/drive/callback and handed the authorization code to the
 * wrong exchange. Connecting Drive ended on a server error every time.
 */
import { describe, expect, it } from "vitest";
import { forwardsMagicLink, isPublicPath } from "./middleware";

describe("rescuing a stray magic link", () => {
  it("forwards one that landed on the site root", () => {
    expect(forwardsMagicLink("/", true)).toBe(true);
  });

  it("forwards one that landed on any other page", () => {
    expect(forwardsMagicLink("/cycles", true)).toBe(true);
    expect(forwardsMagicLink("/settings", true)).toBe(true);
  });

  it("leaves the handler itself alone, so it cannot loop", () => {
    expect(forwardsMagicLink("/auth/callback", true)).toBe(false);
  });

  it("ignores a request with no code at all", () => {
    expect(forwardsMagicLink("/", false)).toBe(false);
    expect(forwardsMagicLink("/api/drive/callback", false)).toBe(false);
  });
});

describe("an API route answering its own OAuth round trip", () => {
  it("keeps Google's code, because that route is what the code is for", () => {
    expect(forwardsMagicLink("/api/drive/callback", true)).toBe(false);
  });

  it("leaves every other API route to handle its own parameters", () => {
    for (const path of ["/api/sheets/mirror", "/api/suggest", "/api/tasks"]) {
      expect(forwardsMagicLink(path, true)).toBe(false);
    }
  });
});

describe("what can be read without signing in", () => {
  it("lets anyone reach sign-in", () => {
    expect(isPublicPath("/login")).toBe(true);
    expect(isPublicPath("/auth/callback")).toBe(true);
  });

  it("lets anyone read the privacy policy and the terms", () => {
    // Google will not publish an external app whose policy sits behind a login,
    // and a policy nobody can read is not a policy.
    expect(isPublicPath("/privacy")).toBe(true);
    expect(isPublicPath("/terms")).toBe(true);
  });

  it("keeps the farm's books behind the door", () => {
    for (const path of ["/", "/cycles", "/map", "/owner", "/settings", "/reports"]) {
      expect(isPublicPath(path)).toBe(false);
    }
  });

  it("does not open anything that merely starts with a public name", () => {
    // /privacy-report would be a page about the farm, not a policy.
    expect(isPublicPath("/privacy-report")).toBe(false);
    expect(isPublicPath("/terms-of-the-lease")).toBe(false);
  });
});
