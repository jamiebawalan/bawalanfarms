"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Empty, Field, Input, Note } from "./ui";
import { formatDate, formatDateShort, todayISO } from "@/lib/domain/dates";

export type Photo = {
  id: string;
  takenOn: string;
  caption: string | null;
};

/** Longest edge after shrinking. Enough to see a leaf tip; small enough to send. */
const MAX_EDGE = 1600;
const QUALITY = 0.82;

/**
 * Photos of the plot, taken in the field or picked from the phone.
 *
 * The picture is shrunk here, in the browser, before it goes anywhere. A phone
 * photo is four or five megabytes and would sit right on the limit of what a
 * request can carry; at 1600px it is a couple of hundred kilobytes. That is the
 * difference between an upload that works on farm signal and one that does not,
 * and it costs nothing worth having — a D-leaf tip and a weed are both perfectly
 * legible at that size.
 *
 * The file itself lands in the cycle's Google Drive folder. This screen only
 * ever shows it back.
 */
export function PlotPhotos({
  cycleId, photos, closed, driveConnected,
}: {
  cycleId: string;
  photos: Photo[];
  closed: boolean;
  driveConnected: boolean;
}) {
  const router = useRouter();
  const today = todayISO();
  const camera = useRef<HTMLInputElement>(null);
  const library = useRef<HTMLInputElement>(null);
  const [caption, setCaption] = useState("");
  const [takenOn, setTakenOn] = useState(today);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showing, setShowing] = useState<Photo | null>(null);

  const byDate = [...photos].sort((a, b) => b.takenOn.localeCompare(a.takenOn));

  async function send(file: File) {
    setBusy(true);
    setError(null);
    try {
      const shrunk = await shrink(file);
      const form = new FormData();
      form.set("photo", shrunk, "plot.jpg");
      form.set("cycle_id", cycleId);
      form.set("taken_on", takenOn);
      form.set("caption", caption.trim());

      const res = await fetch("/api/photos", { method: "POST", body: form });
      if (res.ok) {
        setCaption("");
        router.refresh();
      } else {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Could not save that photo.");
      }
    } catch {
      setError("Could not read that picture. Try taking it again.");
    } finally {
      setBusy(false);
      if (camera.current) camera.current.value = "";
      if (library.current) library.current.value = "";
    }
  }

  return (
    <Card title="Photos">
      {error ? <Note tone="danger">{error}</Note> : null}

      {byDate.length === 0 ? (
        <Empty>
          No photos of this plot yet. One every few weeks makes the difference
          between remembering how it looked and guessing.
        </Empty>
      ) : (
        <ul className="mb-4 grid grid-cols-3 gap-2 sm:grid-cols-4">
          {byDate.map((photo) => (
            <li key={photo.id}>
              <button
                type="button"
                onClick={() => setShowing(photo)}
                className="block w-full text-left"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/photos/${photo.id}`}
                  alt={photo.caption ?? `Plot on ${formatDate(photo.takenOn)}`}
                  loading="lazy"
                  className="aspect-square w-full rounded-lg border-2 border-line object-cover"
                />
                <span className="mt-0.5 block text-xs text-ink-soft">
                  {formatDateShort(photo.takenOn)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {showing !== null ? (
        <div className="mb-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/photos/${showing.id}`}
            alt={showing.caption ?? `Plot on ${formatDate(showing.takenOn)}`}
            className="w-full rounded-xl border-2 border-line"
          />
          <div className="mt-1 flex items-baseline justify-between gap-3">
            <span className="text-sm">
              <strong>{formatDate(showing.takenOn)}</strong>
              {showing.caption ? ` — ${showing.caption}` : ""}
            </span>
            <button
              type="button"
              onClick={() => setShowing(null)}
              className="text-sm font-semibold text-brand"
            >
              Close
            </button>
          </div>
        </div>
      ) : null}

      {closed ? null : !driveConnected ? (
        <Note tone="warn">
          Photos need Google Drive connected — that is where they are kept.
        </Note>
      ) : (
        <>
          <div className="flex gap-3">
            <Field label="Taken on" htmlFor="photo-date">
              <Input
                id="photo-date"
                type="date"
                value={takenOn}
                max={today}
                onChange={(e) => setTakenOn(e.target.value)}
              />
            </Field>
            <Field label="What is it? (optional)" htmlFor="photo-caption">
              <Input
                id="photo-caption"
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder="e.g. north end, weeds"
              />
            </Field>
          </div>

          {/* capture="environment" asks the phone for the back camera directly,
              so he taps once and is shooting rather than browsing an album. */}
          <input
            ref={camera}
            type="file"
            accept="image/*"
            capture="environment"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void send(file);
            }}
          />
          <input
            ref={library}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void send(file);
            }}
          />

          <div className="flex gap-2">
            <Button disabled={busy} onClick={() => camera.current?.click()}>
              {busy ? "Saving…" : "Take a photo"}
            </Button>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => library.current?.click()}
            >
              Choose one
            </Button>
          </div>
        </>
      )}
    </Card>
  );
}

/**
 * Shrink the picture before it leaves the phone.
 *
 * If anything about this fails — an image format the canvas will not decode, a
 * browser that will not give up the bytes — the original goes instead. A photo
 * that uploads slowly is better than one that does not upload at all.
 */
async function shrink(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size < 1_500_000) return file;

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext("2d");
    if (context === null) return file;
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", QUALITY),
    );
    return blob ?? file;
  } catch {
    return file;
  }
}
