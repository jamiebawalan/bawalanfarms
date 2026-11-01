import { describe, expect, it } from "vitest";
import { explainOtpFailure, isCompleteCode, normaliseCode, safeNext } from "./otp";

describe("the code he types in", () => {
  it("takes it plain", () => {
    expect(normaliseCode("123456")).toBe("123456");
  });

  /**
   * He will not retype it — he will long-press the code in Gmail and paste.
   * What lands in the box is whatever the selection grabbed.
   */
  it("takes it pasted, however it came out of the email", () => {
    expect(normaliseCode("123 456")).toBe("123456");
    expect(normaliseCode("code: 123456")).toBe("123456");
    expect(normaliseCode("123-456\n")).toBe("123456");
    expect(normaliseCode(" 123456 ")).toBe("123456");
  });

  /**
   * How long the code is is a setting on the Supabase project, not a fact
   * about sign-in codes. This farm's is eight digits, and cutting it at six
   * meant the owner's husband typed his whole code, had the last two thrown
   * away, and was told it did not match.
   */
  it("keeps a code longer than six digits", () => {
    expect(normaliseCode("12345678")).toBe("12345678");
    expect(normaliseCode("code: 1234 5678")).toBe("12345678");
  });

  it("stops at ten, which is as long as the setting goes", () => {
    expect(normaliseCode("123456789012")).toBe("1234567890");
  });

  it("knows when it is not worth trying yet", () => {
    expect(isCompleteCode("12345")).toBe(false);
    expect(isCompleteCode("")).toBe(false);
    expect(isCompleteCode("abcdef")).toBe(false);
  });

  it("is willing to try anything from six to ten digits", () => {
    expect(isCompleteCode("123456")).toBe(true);
    expect(isCompleteCode("12345678")).toBe(true);
    expect(isCompleteCode("1234567890")).toBe(true);
  });
});

describe("what he is told when a code is refused", () => {
  it("says to ask for a new one when it has expired", () => {
    expect(explainOtpFailure("Token has expired or is invalid"))
      .toContain("expired");
  });

  /**
   * The trap worth naming: asking twice kills the first code. Without this he
   * types the code from the email he happens to have open, which is the old
   * one, and concludes the app is broken.
   */
  it("warns that an older code stops working once a new one is asked for", () => {
    expect(explainOtpFailure("Invalid token"))
      .toContain("older code stops working");
  });

  it("says to wait when he has tried too often", () => {
    expect(explainOtpFailure("For security purposes, you can only request this after 60 seconds"))
      .toContain("Wait a minute");
  });

  it("passes anything else through rather than inventing a reason", () => {
    expect(explainOtpFailure("Network unreachable")).toBe("Network unreachable");
  });
});

describe("where he lands after signing in", () => {
  it("goes back to the page he was trying to reach", () => {
    expect(safeNext("/expenses/new")).toBe("/expenses/new");
  });

  it("goes to Today when there was nowhere in particular", () => {
    expect(safeNext(null)).toBe("/");
    expect(safeNext(undefined)).toBe("/");
    expect(safeNext("")).toBe("/");
  });

  /**
   * ?next= is in the address bar of a page that is about to hold a signed-in
   * session, so it is the last place to follow a destination unchecked.
   */
  it("refuses to be sent off this site", () => {
    expect(safeNext("https://evil.example")).toBe("/");
    expect(safeNext("//evil.example")).toBe("/");
    expect(safeNext("\\\\evil.example")).toBe("/");
    expect(safeNext("/\\evil.example")).toBe("/");
    expect(safeNext("javascript:alert(1)")).toBe("/");
  });
});
