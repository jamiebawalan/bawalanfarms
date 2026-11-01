"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Empty, Field, Input, Note } from "./ui";
import { formatDate, formatDateShort, todayISO } from "@/lib/domain/dates";

export type Photo = {
  id: string;
  takenOn: string;
  caption: string | null;
  /** When it went up. Stands in as the caption when nobody wrote one. */
  addedAt: string;
};

/** How many thumbnails before the grid starts making the page long. */
const SHOWN_AT_FIRST = 5;

/**
 * What to call a photo nobody captioned.
 *
 * Derived rather than stored. Writing "01 Nov 2026, 2:32 pm" into the caption
 * column would fill the farm's records with strings that look like somebody's
 * description of the plot and are not — and the day and time are already known
 * for certain, so keeping a copy only creates something that can disagree.
 */
export function photoLabel(photo: Photo): string {
  if (photo.caption && photo.caption.trim() !== "") return photo.caption;
  const when = new Date(photo.addedAt);
  if (Number.isNaN(when.getTime())) return formatDate(photo.takenOn);
  return `${formatDate(photo.takenOn)}, ${when.toLocaleTimeString("en-PH", {
    hour: "numeric",
    minute: "2-digit",
  })}`;
}

/** A picture chosen on the phone, captioned but not yet sent. */
type Pending = {
  key: string;
  file: File;
  preview: string;
  caption: string;
  error: string | null;
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
  const [takenOn, setTakenOn] = useState(today);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The viewer works on a position in the list, not a copy of one photo, so
  // next and previous have somewhere to go and the picture keeps up when the
  // list is refreshed underneath it.
  const [at, setAt] = useState<number | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [editing, setEditing] = useState<string | null>(null);

  /**
   * Photos chosen but not yet sent.
   *
   * He walks a plot and takes eight pictures. Uploading them one at a time —
   * pick, caption, send, wait, pick again — is eight round trips on farm
   * signal, and he stopped doing it. So they queue here with a caption box
   * each, and go up together.
   */
  const [pending, setPending] = useState<Pending[]>([]);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const byDate = [...photos].sort((a, b) => b.takenOn.localeCompare(a.takenOn));
  // Clamped, because a photo removed while the viewer is open shortens the
  // list under it and the last position would otherwise point at nothing.
  const current = at === null ? null : byDate[Math.min(at, byDate.length - 1)] ?? null;

  function queue(files: FileList | null) {
    if (files === null || files.length === 0) return;
    setError(null);
    setPending((was) => [
      ...was,
      ...Array.from(files).map((file) => ({
        key: `${file.name}-${file.size}-${file.lastModified}-${Math.random()}`,
        file,
        // Shown from the phone's own copy, so he can see what he is captioning
        // without waiting for anything to upload.
        preview: URL.createObjectURL(file),
        caption: "",
        error: null as string | null,
      })),
    ]);
    if (camera.current) camera.current.value = "";
    if (library.current) library.current.value = "";
  }

  function drop(key: string) {
    setPending((was) => {
      const going = was.find((p) => p.key === key);
      if (going) URL.revokeObjectURL(going.preview);
      return was.filter((p) => p.key !== key);
    });
  }

  /**
   * Send the queue, one at a time.
   *
   * Sequential rather than all at once: each photo is a few hundred kilobytes
   * and the signal out here is what it is. Firing eight uploads together on a
   * weak connection is how they all fail; one after another lets him watch it
   * work, and a photo that fails keeps its place in the queue with its caption
   * intact rather than taking the whole batch down with it.
   */
  async function sendAll() {
    if (pending.length === 0) return;
    setBusy(true);
    setError(null);
    setProgress({ done: 0, total: pending.length });

    const failed: Pending[] = [];
    let done = 0;

    for (const item of pending) {
      try {
        const shrunk = await shrink(item.file);
        const form = new FormData();
        form.set("photo", shrunk, "plot.jpg");
        form.set("cycle_id", cycleId);
        form.set("taken_on", takenOn);
        form.set("caption", item.caption.trim());

        const res = await fetch("/api/photos", { method: "POST", body: form });
        if (res.ok) {
          URL.revokeObjectURL(item.preview);
        } else {
          const body = await res.json().catch(() => ({}));
          failed.push({ ...item, error: body.error ?? "Could not save this one." });
        }
      } catch {
        failed.push({ ...item, error: "Could not read this picture." });
      }
      done += 1;
      setProgress({ done, total: pending.length });
    }

    setPending(failed);
    setProgress(null);
    setBusy(false);
    if (failed.length > 0) {
      setError(
        failed.length === pending.length
          ? "None of those went up. They are still here — try again."
          : `${pending.length - failed.length} went up. ${failed.length} did not, and are still here.`,
      );
    }
    router.refresh();
  }

  /**
   * Taking a photo back out.
   *
   * Offered only from the opened photo, never from the grid. Twelve square
   * thumbnails of the same green plot are not something anyone can tell apart
   * at that size, and a delete button on each one is a delete button on the
   * wrong one. He opens it, sees it, then decides.
   *
   * The file goes to the bin in the owners' Drive, not into nothing, so a
   * mis-tap here is recoverable for thirty days.
   */
  async function remove(photo: Photo) {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/photos/${photo.id}`, { method: "DELETE" });
    setBusy(false);
    if (res.ok) {
      setConfirming(false);
      setAt(null);
      setZoom(1);
      router.refresh();
    } else {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Could not remove that photo.");
    }
  }

  /** Writing a caption onto a photo that already exists. */
  async function rename(photo: Photo, caption: string) {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/photos/${photo.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ caption }),
    });
    setBusy(false);
    if (res.ok) {
      setEditing(null);
      router.refresh();
    } else {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Could not save that caption.");
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
        <>
          {/* Only the newest few. A season of photos is a very long page to
              scroll past on the way to anything else on this plot. */}
          <ul className="mb-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
            {(expanded ? byDate : byDate.slice(0, SHOWN_AT_FIRST)).map((photo, i) => (
              <li key={photo.id}>
                <button
                  type="button"
                  onClick={() => { setAt(i); setConfirming(false); setZoom(1); }}
                  className="block w-full text-left"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/photos/${photo.id}`}
                    alt={photoLabel(photo)}
                    loading="lazy"
                    className="aspect-square w-full rounded-lg border-2 border-line object-cover"
                  />
                  <span className="mt-0.5 block truncate text-xs text-ink-soft">
                    {formatDateShort(photo.takenOn)}
                  </span>
                </button>
              </li>
            ))}
          </ul>

          {byDate.length > SHOWN_AT_FIRST ? (
            <Button
              variant="quiet"
              size="md"
              className="mb-3 px-0"
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded
                ? `Show fewer`
                : `More — ${byDate.length - SHOWN_AT_FIRST} older ${
                    byDate.length - SHOWN_AT_FIRST === 1 ? "photo" : "photos"
                  }`}
            </Button>
          ) : null}
        </>
      )}

      {current !== null ? (
        <div className="mb-4">
          {/* The picture sits in a window it can be bigger than, so zooming in
              and dragging around it works the same with a finger as with a
              mouse — no pinch gesture to discover, and the page behind does
              not move while he is looking at a leaf tip. */}
          <div
            className="relative overflow-auto rounded-xl border-2 border-line bg-paper-sunk"
            style={{ maxHeight: "70vh" }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/photos/${current.id}`}
              alt={photoLabel(current)}
              className="block origin-top-left"
              style={{ width: `${zoom * 100}%`, maxWidth: "none" }}
            />
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button
              size="md"
              variant="secondary"
              disabled={at === 0}
              onClick={() => { setAt((i) => Math.max(0, (i ?? 0) - 1)); setZoom(1); setConfirming(false); }}
            >
              ‹ Previous
            </Button>
            <Button
              size="md"
              variant="secondary"
              disabled={at !== null && at >= byDate.length - 1}
              onClick={() => { setAt((i) => Math.min(byDate.length - 1, (i ?? 0) + 1)); setZoom(1); setConfirming(false); }}
            >
              Next ›
            </Button>
            <span className="tabular text-sm text-ink-soft">
              {(at ?? 0) + 1} of {byDate.length}
            </span>

            <span className="ml-auto flex items-center gap-1">
              <Button
                size="md"
                variant="secondary"
                aria-label="Zoom out"
                disabled={zoom <= 1}
                onClick={() => setZoom((z) => Math.max(1, Math.round((z - 0.5) * 2) / 2))}
              >
                −
              </Button>
              <span className="tabular w-12 text-center text-sm text-ink-soft">
                {Math.round(zoom * 100)}%
              </span>
              <Button
                size="md"
                variant="secondary"
                aria-label="Zoom in"
                disabled={zoom >= 4}
                onClick={() => setZoom((z) => Math.min(4, Math.round((z + 0.5) * 2) / 2))}
              >
                +
              </Button>
            </span>
          </div>

          <div className="mt-2 flex items-baseline justify-between gap-3">
            <span className="min-w-0 text-sm">
              <strong>{photoLabel(current)}</strong>
            </span>
            <button
              type="button"
              onClick={() => { setAt(null); setConfirming(false); setZoom(1); setEditing(null); }}
              className="shrink-0 text-sm font-semibold text-brand"
            >
              Close
            </button>
          </div>

          {/* Captions are written later or not at all. He is holding a phone
              over a pineapple when he takes these, not writing labels. */}
          {editing !== null ? (
            <div className="mt-2">
              <Field label="Caption" htmlFor="photo-rename">
                <Input
                  id="photo-rename"
                  value={editing}
                  disabled={busy}
                  autoFocus
                  onChange={(e) => setEditing(e.target.value)}
                  placeholder="e.g. north end, weeds"
                />
              </Field>
              <div className="flex gap-2">
                <Button size="md" disabled={busy} onClick={() => rename(current, editing)}>
                  {busy ? "Saving…" : "Save caption"}
                </Button>
                <Button size="md" variant="secondary" disabled={busy}
                        onClick={() => setEditing(null)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <Button
              variant="quiet"
              size="md"
              className="px-0"
              onClick={() => setEditing(current.caption ?? "")}
            >
              {current.caption ? "Edit caption" : "Add a caption"}
            </Button>
          )}

          {closed ? null : confirming ? (
            <div className="mt-2 rounded-xl border-2 border-danger bg-danger-tint p-3">
              <p className="mb-1 font-semibold text-danger">Remove this photo?</p>
              <p className="mb-3 text-sm text-ink">
                It goes to the bin in the farm&rsquo;s Google Drive, so it can be
                put back from there for thirty days.
              </p>
              <div className="flex gap-2">
                <Button size="md" variant="danger" disabled={busy}
                        onClick={() => remove(current)}>
                  {busy ? "Removing…" : "Remove it"}
                </Button>
                <Button size="md" variant="secondary" disabled={busy}
                        onClick={() => setConfirming(false)}>
                  Keep it
                </Button>
              </div>
            </div>
          ) : (
            <Button
              variant="quiet"
              size="md"
              className="px-0 text-danger"
              onClick={() => setConfirming(true)}
            >
              Remove this photo
            </Button>
          )}
        </div>
      ) : null}

      {closed ? null : !driveConnected ? (
        <Note tone="warn">
          Photos need Google Drive connected — that is where they are kept.
        </Note>
      ) : (
        <>
          {/* One date for the batch: they are from the same walk round. */}
          <Field label="Taken on" htmlFor="photo-date">
            <Input
              id="photo-date"
              type="date"
              value={takenOn}
              max={today}
              onChange={(e) => setTakenOn(e.target.value)}
            />
          </Field>

          {/* capture="environment" asks the phone for the back camera directly,
              so he taps once and is shooting rather than browsing an album.
              The camera hands back one picture at a time; the album does not,
              so that one takes `multiple`. */}
          <input
            ref={camera}
            type="file"
            accept="image/*"
            capture="environment"
            hidden
            onChange={(e) => queue(e.target.files)}
          />
          <input
            ref={library}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => queue(e.target.files)}
          />

          {pending.length > 0 ? (
            <ul className="mb-3 space-y-2">
              {pending.map((item, i) => (
                <li key={item.key} className="flex items-start gap-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={item.preview}
                    alt={`Picture ${i + 1} waiting to go up`}
                    className="size-16 shrink-0 rounded-lg border-2 border-line object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <Input
                      aria-label={`Caption for picture ${i + 1}`}
                      value={item.caption}
                      disabled={busy}
                      onChange={(e) => {
                        const text = e.target.value;
                        setPending((was) =>
                          was.map((p) => (p.key === item.key ? { ...p, caption: text } : p)),
                        );
                      }}
                      placeholder="e.g. north end, weeds"
                    />
                    {item.error ? (
                      <p className="mt-1 text-sm font-semibold text-danger">{item.error}</p>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => drop(item.key)}
                    aria-label={`Remove picture ${i + 1} from the queue`}
                    className="min-h-12 shrink-0 px-2 text-sm font-semibold text-danger disabled:opacity-50"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          {pending.length > 0 ? (
            <Button className="mb-2 w-full" disabled={busy} onClick={sendAll}>
              {progress !== null
                ? `Saving ${progress.done + 1} of ${progress.total}…`
                : `Save ${pending.length} ${pending.length === 1 ? "photo" : "photos"}`}
            </Button>
          ) : null}

          <div className="flex gap-2">
            <Button disabled={busy} onClick={() => camera.current?.click()}>
              Take a photo
            </Button>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => library.current?.click()}
            >
              {pending.length > 0 ? "Add more" : "Choose photos"}
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
