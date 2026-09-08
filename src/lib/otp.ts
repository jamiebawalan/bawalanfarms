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

/** Digits only, so a pasted "123 456" or "code: 123456" still works. */
export function normaliseCode(raw: string): string {
  return raw.replace(/\D/g, "").slice(0, 6);
}

export function isCompleteCode(raw: string): boolean {
  return normaliseCode(raw).length === 6;
}

/**
 * Supabase speaks to developers. The farm manager needs to know which of two
 * things to do: ask for a new code, or check what he typed.
 */
export function explainOtpFailure(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("expired")) {
    return "That code has expired. Ask for a new one.";
  }
  if (m.includes("invalid") || m.includes("token")) {
    return "That code did not match. Check the newest email — an older code stops working once you ask for another.";
  }
  if (m.includes("rate") || m.includes("too many") || m.includes("60 seconds")) {
    return "Too many tries. Wait a minute, then ask for a new code.";
  }
  return message;
}

/** Where to land after signing in. Never anywhere but this app. */
export function safeNext(next: string | null | undefined): string {
  if (!next) return "/";
  if (!next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return "/";
  return next;
}
