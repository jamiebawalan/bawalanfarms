"use client";

import { useEffect, useState } from "react";
import { Button, Card, Field, Input, Note } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import { explainOtpFailure, isCompleteCode, normaliseCode, safeNext } from "@/lib/otp";

/**
 * Signing in with a six-digit code.
 *
 * It was a magic link, and the link is still sent — but the link cannot be the
 * main way in on a phone. Asking for one stores a verifier in the browser that
 * asked, and only that browser can finish the job. Gmail opens links in its own
 * in-app browser; a home-screen app has a cookie jar no email can reach. So the
 * sign-in kept landing somewhere it could not be used, and the farm manager was
 * fetching a fresh link every single time he opened the app.
 *
 * A typed code goes in where he already is. Once it lands, the session stays
 * put — the cookie is good for over a year and every request renews it — so
 * this is the last time he signs in on that phone.
 */
export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "checking">("idle");
  const [error, setError] = useState<string | null>(null);

  // Read after mounting, not during render. useSearchParams would force this
  // page to be rendered on the server on every visit; reading window during
  // render is worse still — the server cannot see the address bar, so the two
  // renders disagree and React throws the whole page away and redraws it.
  const [linkFailed, setLinkFailed] = useState(false);
  useEffect(() => {
    setLinkFailed(new URLSearchParams(window.location.search).get("error") === "link");
  }, []);

  async function sendCode() {
    setState("sending");
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) {
      setError(error.message);
      setState("idle");
    } else {
      setState("sent");
    }
  }

  async function signIn() {
    setState("checking");
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token: normaliseCode(code),
      type: "email",
    });
    if (error) {
      setError(explainOtpFailure(error.message));
      setState("sent");
      return;
    }
    // A full page load, not a client navigation: it is the server that has to
    // see the new cookie before it will let him past the door.
    // Read here rather than at render: this runs on a tap, where window is real.
    const next = new URLSearchParams(window.location.search).get("next");
    window.location.assign(safeNext(next));
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4">
      <h1 className="mb-1 text-3xl font-bold tracking-tight">Farm Tracker</h1>
      <p className="mb-6 text-ink-soft">Costs, harvests and sales, by plot and cycle.</p>

      <Card>
        {linkFailed && state === "idle" ? (
          <Note tone="warn">
            That link could not sign you in — links only work in the browser that
            asked for them. Use the six-digit code in the same email instead.
          </Note>
        ) : null}

        {state === "sent" || state === "checking" ? (
          <>
            <Note tone="good">
              Check your email for a six-digit code and type it here. Do not tap
              the link — the code is what keeps you signed in.
            </Note>

            <Field label="Six-digit code" htmlFor="code">
              <Input
                id="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus
                value={code}
                onChange={(e) => setCode(normaliseCode(e.target.value))}
                placeholder="123456"
                className="tabular text-2xl tracking-[0.3em]"
              />
            </Field>

            {error ? <Note tone="danger">{error}</Note> : null}

            <Button
              className="w-full"
              disabled={state === "checking" || !isCompleteCode(code)}
              onClick={signIn}
            >
              {state === "checking" ? "Signing in…" : "Sign in"}
            </Button>

            <Button
              variant="quiet"
              className="mt-2 w-full"
              disabled={state === "checking"}
              onClick={() => { setCode(""); setError(null); setState("idle"); }}
            >
              Use a different email
            </Button>
          </>
        ) : (
          <>
            <Field label="Email" htmlFor="email">
              <Input
                id="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
            </Field>
            {error ? <Note tone="danger">{error}</Note> : null}
            <Button
              className="w-full"
              disabled={state === "sending" || !email.includes("@")}
              onClick={sendCode}
            >
              {state === "sending" ? "Sending…" : "Send me a code"}
            </Button>
            <p className="mt-3 text-sm text-ink-soft">
              You should only need this once on this phone.
            </p>
          </>
        )}
      </Card>
    </main>
  );
}
