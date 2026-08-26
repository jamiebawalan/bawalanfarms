"use client";

import { useState } from "react";
import { Button, Card, Field, Input, Note } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";

/**
 * Magic link only. Three people use this app and none of them wants another
 * password; the access list lives in the database, so a link sent to an email
 * that is not on it will sign in and then see nothing.
 */
export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  async function sendLink() {
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

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4">
      <h1 className="mb-1 text-3xl font-bold tracking-tight">Farm Tracker</h1>
      <p className="mb-6 text-ink-soft">Costs, harvests and sales, by plot and cycle.</p>

      <Card>
        {state === "sent" ? (
          <Note tone="good">
            Check your email. The link signs you in on this phone — open it here,
            not on another device.
          </Note>
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
              onClick={sendLink}
            >
              {state === "sending" ? "Sending…" : "Send me a link"}
            </Button>
          </>
        )}
      </Card>
    </main>
  );
}
