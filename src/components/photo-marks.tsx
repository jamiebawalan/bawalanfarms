"use client";

import { useRef, useState } from "react";
import { Button, Chip, ChipGroup, Field, Input, Note, cx } from "./ui";
import {
  INK, SIZES, describeMark, pathOf,
  type InkName, type Mark, type Point, type SizeName,
} from "@/lib/domain/annotations";

/**
 * The marks on a photo, drawn over it.
 *
 * Separate from the editor because every screen that shows a photo shows its
 * marks, and only one screen lets him make them. Sized by viewBox rather than
 * pixels, so the same circle lands on the same leaf tip at any width.
 */
export function Marks({ marks, className }: { marks: readonly Mark[]; className?: string }) {
  if (marks.length === 0) return null;
  const W = 1000;
  const H = 1000;
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      aria-hidden="true"
      className={cx("pointer-events-none absolute inset-0 h-full w-full", className)}
    >
      {marks.map((mark) =>
        mark.kind === "pen" ? (
          <path
            key={mark.id}
            d={pathOf(mark.points, W, H)}
            fill="none"
            stroke={INK[mark.ink]}
            strokeWidth={SIZES[mark.size].pen * W}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
            style={{ strokeWidth: `${SIZES[mark.size].pen * 100}%` }}
          />
        ) : (
          <text
            key={mark.id}
            x={mark.at.x * W}
            y={mark.at.y * H}
            fill={INK[mark.ink]}
            fontSize={SIZES[mark.size].text * W}
            // A thin dark edge, because a red label on dark soil and a red
            // label on bright sky are both in the same photograph.
            stroke="#00000055"
            strokeWidth={SIZES[mark.size].text * W * 0.06}
            paintOrder="stroke"
            fontWeight="700"
            fontFamily="system-ui, sans-serif"
          >
            {mark.text}
          </text>
        ),
      )}
    </svg>
  );
}

let nextId = 0;
const makeId = () => `m${Date.now().toString(36)}${(nextId++).toString(36)}`;

/**
 * Drawing on a photo.
 *
 * He is circling a tip burn with one thumb while holding the phone in the
 * same hand, so the whole thing is two tools, six colours and three sizes —
 * no layers, no shapes, no undo stack to understand. Drag to draw; tap to
 * drop a label; every mark listed underneath with its own Remove.
 *
 * Nothing is painted into the photograph. The marks are saved as marks, so
 * any one of them can come off again in a month, and the original picture is
 * still the original picture.
 */
export function MarkEditor({
  marks, busy, onSave, onCancel, children,
}: {
  marks: readonly Mark[];
  busy: boolean;
  onSave: (marks: Mark[]) => void;
  onCancel: () => void;
  /** The photo itself, drawn underneath. */
  children: React.ReactNode;
}) {
  const [draft, setDraft] = useState<Mark[]>([...marks]);
  const [tool, setTool] = useState<"pen" | "text">("pen");
  const [ink, setInk] = useState<InkName>("red");
  const [size, setSize] = useState<SizeName>("medium");
  /**
   * The stroke being drawn right now.
   *
   * In a ref, not in state. A finger moves faster than React re-renders, so
   * every handler that read the stroke out of a closure read a stale one —
   * points were dropped and short strokes vanished on release. The ref is
   * always the current stroke; the state beside it exists only so the live
   * line redraws while he is still dragging.
   */
  const stroke = useRef<Point[] | null>(null);
  const [drawing, setDrawing] = useState<Point[] | null>(null);
  const [placing, setPlacing] = useState<Point | null>(null);
  const [label, setLabel] = useState("");
  const surface = useRef<HTMLDivElement>(null);

  function at(e: React.PointerEvent): Point {
    const box = surface.current?.getBoundingClientRect();
    if (box === undefined || box.width === 0) return { x: 0, y: 0 };
    return {
      x: Math.min(1, Math.max(0, (e.clientX - box.left) / box.width)),
      y: Math.min(1, Math.max(0, (e.clientY - box.top) / box.height)),
    };
  }

  const live: Mark[] =
    drawing !== null && drawing.length >= 2
      ? [...draft, { id: "live", kind: "pen", ink, size, points: drawing }]
      : draft;

  return (
    <div>
      <div
        ref={surface}
        className="relative touch-none overflow-hidden rounded-xl border-2 border-brand"
        onPointerDown={(e) => {
          if (busy) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          if (tool === "pen") {
            const start = [at(e)];
            stroke.current = start;
            setDrawing(start);
          } else {
            setPlacing(at(e));
            setLabel("");
          }
        }}
        onPointerMove={(e) => {
          if (tool !== "pen" || stroke.current === null) return;
          stroke.current = [...stroke.current, at(e)];
          setDrawing(stroke.current);
        }}
        onPointerUp={() => {
          const points = stroke.current;
          stroke.current = null;
          setDrawing(null);
          // Two points is the shortest thing that is a line rather than a tap.
          if (points !== null && points.length >= 2) {
            setDraft((was) => [...was, { id: makeId(), kind: "pen", ink, size, points }]);
          }
        }}
        onPointerCancel={() => { stroke.current = null; setDrawing(null); }}
      >
        {children}
        <Marks marks={live} />
      </div>

      <div className="mt-2">
        <ChipGroup>
          <Chip selected={tool === "pen"} onClick={() => { setTool("pen"); setPlacing(null); }}>
            Draw
          </Chip>
          <Chip selected={tool === "text"} onClick={() => setTool("text")}>
            Label
          </Chip>
        </ChipGroup>
        <p className="mt-1 text-sm text-ink-soft">
          {tool === "pen"
            ? "Drag across the picture to circle something."
            : "Tap the picture where the label should go."}
        </p>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        {(Object.keys(INK) as InkName[]).map((name) => (
          <button
            key={name}
            type="button"
            aria-label={name}
            aria-pressed={ink === name}
            onClick={() => setInk(name)}
            style={{ background: INK[name] }}
            className={cx(
              "size-11 rounded-full border-2",
              ink === name ? "border-ink ring-2 ring-brand" : "border-line-strong",
            )}
          />
        ))}
      </div>

      <div className="mt-2">
        <ChipGroup>
          {(Object.keys(SIZES) as SizeName[]).map((name) => (
            <Chip key={name} selected={size === name} onClick={() => setSize(name)}>
              {SIZES[name].label}
            </Chip>
          ))}
        </ChipGroup>
      </div>

      {placing !== null ? (
        <div className="mt-3 rounded-xl border-2 border-brand bg-brand-tint p-3">
          <Field label="What does it say?" htmlFor="mark-text">
            <Input
              id="mark-text"
              value={label}
              autoFocus
              maxLength={120}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. tip burn"
            />
          </Field>
          <div className="flex gap-2">
            <Button
              size="md"
              disabled={label.trim() === ""}
              onClick={() => {
                setDraft((was) => [
                  ...was,
                  { id: makeId(), kind: "text", ink, size, at: placing, text: label.trim() },
                ]);
                setPlacing(null);
                setLabel("");
              }}
            >
              Put it there
            </Button>
            <Button size="md" variant="secondary" onClick={() => setPlacing(null)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      {draft.length > 0 ? (
        <ul className="mt-3 divide-y-2 divide-line">
          {draft.map((mark) => (
            <li key={mark.id} className="flex items-center justify-between gap-3 py-2">
              <span className="flex min-w-0 items-center gap-2 text-sm">
                <span
                  aria-hidden="true"
                  style={{ background: INK[mark.ink] }}
                  className="size-4 shrink-0 rounded-full border border-line-strong"
                />
                <span className="truncate">{describeMark(mark)}</span>
              </span>
              <button
                type="button"
                className="min-h-11 shrink-0 px-2 text-sm font-semibold text-danger"
                onClick={() => setDraft((was) => was.filter((m) => m.id !== mark.id))}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <Note tone="info">Nothing drawn yet.</Note>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <Button disabled={busy} onClick={() => onSave(draft)}>
          {busy ? "Saving…" : "Save the marks"}
        </Button>
        <Button variant="secondary" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
        {draft.length > 0 ? (
          <Button
            variant="quiet"
            className="text-danger"
            disabled={busy}
            onClick={() => setDraft([])}
          >
            Clear all
          </Button>
        ) : null}
      </div>
    </div>
  );
}
