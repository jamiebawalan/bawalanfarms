"use client";

import { useState } from "react";
import { Button, Note } from "./ui";

export function SheetsRefresh() {
  const [state, setState] = useState<"idle" | "busy">("idle");
  const [message, setMessage] = useState<{ tone: "good" | "danger"; text: string } | null>(null);

  return (
    <>
      {message ? <Note tone={message.tone}>{message.text}</Note> : null}
      <Button
        variant="secondary"
        disabled={state === "busy"}
        onClick={async () => {
          setState("busy");
          setMessage(null);
          const res = await fetch("/api/sheets/mirror", { method: "POST" });
          const body = await res.json().catch(() => ({}));
          setState("idle");
          setMessage(
            res.ok
              ? {
                  tone: "good",
                  text: `Refreshed ${(body.tabs ?? []).length} tabs.`,
                }
              : { tone: "danger", text: body.error ?? "The refresh failed." },
          );
        }}
      >
        {state === "busy" ? "Refreshing…" : "Refresh now"}
      </Button>
    </>
  );
}
