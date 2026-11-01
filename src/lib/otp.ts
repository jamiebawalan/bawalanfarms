/**
 * Signing in with a code typed into the app, rather than a link tapped in email.
 *
 * The link flow uses PKCE: asking for the link stores a verifier in the browser
 * that asked, and only that browser can complete the sign-in. On a phone the
 * link is almost never opened there — Gmail opens it in its own in-app browser,
 * and a home-screen app has its own cookie jar that no link from email can ever
 * reach. The exchange then fails, the sign-in page comes back blank, and the
 * only move left is to fetch another link. Which fails the same way.
 *
 * A typed code has no verifier and no second browser. It is checked against
 * Supabase directly, and the session lands in whatever the person is holding.
 */

/**
 * Digits only, so a pasted "123 456" or "code: 123456" still works.
 *
 * Six was wrong. How long the code is is a setting on the Supabase project,
 * not a fact about sign-in codes — it can be anywhere from six to ten digits,
 * and this farm's is eight. Cutting it at six meant the owner's husband typed
 * his whole code, had the last two silently thrown away, and was told it did
 * not match. Nothing on the screen could have told him why.
 */
const SHORTEST = 6;
const LONGEST = 10;

export function normaliseCode(raw: string): string {
  return raw.replace(/\D/g, "").slice(0, LONGEST);
}

/**
 * Enough digits to be worth trying. The app cannot know how long this
 * project's codes are, so it accepts anything in the range and lets the
 * server be the judge — which it is anyway.
 */
export function isCompleteCode(raw: string): boolean {
  const code = normaliseCode(raw);
  return code.length >= SHORTEST && code.length <= LONGEST;
}

/**
 * Supabase speaks to developers. The farm manager needs to know which of two
 * things to do: ask for a new code, or check what he typed.
 */
export function explainOtpFailure(message: string): string {
  const m = message.toLowerCase();

  // Rate limiting first: it is the one refusal with a single unambiguous
  // cause, and its message often mentions a token as well.
  if (m.includes("rate") || m.includes("too many") || m.includes("60 seconds")) {
    return "Too many tries. Wait a minute, then ask for a new code.";
  }

  /**
   * Supabase says "Token has expired or is invalid" for both, and will not
   * say which — telling a wrong code from an old one would tell an attacker
   * which half of the guess was right.
   *
   * This used to match "expired" first and report it as fact, which sent the
   * farm's owners hunting a timing problem while the real cause was a code
   * being silently cut short. An error message that picks one of two causes
   * and states it confidently is worse than one that admits to both: it does
   * not just fail to help, it actively misdirects.
   */
  if (m.includes("expired") || m.includes("invalid") || m.includes("token")) {
    return (
      "That code did not work. Type every digit of the code in the newest " +
      "email — asking for a second code stops the first one working — and if " +
      "it still refuses, ask for a new one."
    );
  }

  return message;
}

/** Where to land after signing in. Never anywhere but this app. */
export function safeNext(next: string | null | undefined): string {
  if (!next) return "/";
  if (!next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return "/";
  return next;
}
