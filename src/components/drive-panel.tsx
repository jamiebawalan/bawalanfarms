"use client";

import { useState } from "react";
import { Button, Note } from "./ui";
import { formatDate } from "@/lib/domain/dates";

/**
 * Connecting the farm's Drive, and writing to it.
 *
 * The refresh token never appears here — the callback puts it straight into the
 * database. This screen only ever shows whether the connection is alive, when
 * it last wrote, and what went wrong if something did.
 */
export function DrivePanel({
  connected,
  connectedBy,
  lastMirrorAt,
  lastError,
  folderId,
  status,
}: {
  connected: boolean;
  connectedBy: string | null;
  lastMirrorAt: string | null;
  lastError: string | null;
  folderId: string | null;
  status?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "good" | "danger"; text: string } | null>(null);
  const [folder, setFolder] = useState<string | null>(
    folderId === null ? null : `https://drive.google.com/drive/folders/${folderId}`,
  );

  const banner = STATUS[status ?? ""] ?? null;

  return (
    <>
      {banner ? <Note tone={banner.tone}>{banner.text}</Note> : null}
      {message ? <Note tone={message.tone}>{message.text}</Note> : null}
      {lastError !== null && message === null ? (
        <Note tone="danger">Last time it ran: {lastError}</Note>
      ) : null}

      {connected ? (
        <>
          <p className="mb-3 text-sm text-ink-soft">
            Connected{connectedBy === null ? "" : ` by ${connectedBy}`}
            {lastMirrorAt === null
              ? ". Not written yet."
              : `. Last written ${formatDate(lastMirrorAt.slice(0, 10))}.`}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setMessage(null);
                const res = await fetch("/api/drive/mirror", { method: "POST" });
                const body = await res.json().catch(() => ({}));
                setBusy(false);
                if (res.ok) {
                  setFolder(body.folder ?? null);
                  setMessage({
                    tone: "good",
                    text: `Wrote ${body.cycles} cycles across ${body.plots} plots.`,
                  });
                } else {
                  setMessage({ tone: "danger", text: body.error ?? "Writing to Drive failed." });
                }
              }}
            >
              {busy ? "Writing to Drive…" : "Write to Drive now"}
            </Button>
            {folder !== null ? (
              <a
                href={folder}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-12 items-center px-3 font-semibold text-brand underline underline-offset-4"
              >
                Open the folder
              </a>
            ) : null}
          </div>
          <p className="mt-3 text-sm text-ink-soft">
            Reconnecting is safe — it replaces the permission without touching the
            files.{" "}
            <a href="/api/drive/connect" className="font-semibold text-brand underline underline-offset-4">
              Reconnect
            </a>
          </p>
        </>
      ) : (
        <>
          <p className="mb-3 text-sm text-ink-soft">
            Google will ask you to allow Farm Tracker to manage the files it
            creates. It cannot see anything else in your Drive.
          </p>
          <a
            href="/api/drive/connect"
            className="inline-flex min-h-12 items-center rounded-xl bg-brand px-4 font-semibold text-white"
          >
            Connect Google Drive
          </a>
        </>
      )}
    </>
  );
}

const STATUS: Record<string, { tone: "good" | "danger" | "warn"; text: string }> = {
  connected: { tone: "good", text: "Google Drive is connected." },
  denied: { tone: "warn", text: "Google was not given permission, so nothing changed." },
  badstate: {
    tone: "danger",
    text: "That sign-in did not come back the way it left. Start again from this page.",
  },
  norefresh: {
    tone: "danger",
    text:
      "Google did not hand back a lasting permission. Remove Farm Tracker at " +
      "myaccount.google.com/permissions, then connect again.",
  },
  failed: { tone: "danger", text: "Connecting to Google failed. Try again." },
  unconfigured: {
    tone: "warn",
    text: "The Google OAuth client is not set up yet — see the setup notes.",
  },
};
