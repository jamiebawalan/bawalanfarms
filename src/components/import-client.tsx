"use client";

import { useState } from "react";
import { Button, Card, Empty, Money, Note, Stat, StatGrid } from "./ui";
import { formatPeso } from "@/lib/domain/money";

type Preview = {
  sheet: string;
  sheetTag: string;
  totalRows: number;
  accepted: number;
  rejected: number;
  acceptedTotalCentavos: number;
  rejectedRows: { rowNumber: number; reason: string; raw: string }[];
  warnings: { message: string; count: number }[];
  unusedColumns: string[];
  sample: {
    rowNumber: number; date: string; activity: string; category: string;
    attribution: string; amountCentavos: number; plotCount: number;
  }[];
  committed: boolean;
  result?: { written: number; replaced: number; unattached: number };
};

export function ImportClient() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(mode: "preview" | "commit") {
    if (!file) return;
    setBusy(true);
    setError(null);

    const body = new FormData();
    body.set("file", file);
    body.set("mode", mode);

    const res = await fetch("/api/import", { method: "POST", body });
    const json = await res.json().catch(() => ({}));
    setBusy(false);

    if (!res.ok) {
      setError(json.error ?? "The import failed.");
      if (json.rejectedRows) setPreview(json as Preview);
      return;
    }
    setPreview(json as Preview);
  }

  return (
    <>
      <Card title="The file">
        <input
          type="file"
          accept=".xlsx,.csv"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setPreview(null);
            setError(null);
          }}
          className="block w-full rounded-xl border-2 border-line-strong bg-paper p-3 file:mr-3 file:min-h-11 file:rounded-lg file:border-0 file:bg-brand file:px-4 file:font-semibold file:text-white"
        />
        <p className="mt-2 text-sm text-ink-soft">
          .xlsx or .csv. It needs at least a date column and an amount column;
          category, activity, plot, rate, quantity and notes are used when present.
        </p>
        <Button
          className="mt-4 w-full"
          disabled={!file || busy}
          onClick={() => run("preview")}
        >
          {busy ? "Checking…" : "Check the file"}
        </Button>
      </Card>

      {error ? <Note tone="danger">{error}</Note> : null}

      {preview ? (
        <>
          {preview.committed ? (
            <Note tone="good">
              Imported. {preview.result?.written} rows written
              {preview.result?.replaced
                ? `, ${preview.result.replaced} replaced from an earlier run`
                : ""}
              .
              {preview.result?.unattached
                ? ` ${preview.result.unattached} of them found no open cycle — see the unattached costs report.`
                : ""}
            </Note>
          ) : null}

          <StatGrid>
            <Stat label="Rows in the file" value={String(preview.totalRows)} />
            <Stat label="Will import" value={String(preview.accepted)} />
            <Stat
              label="Rejected"
              value={String(preview.rejected)}
              tone={preview.rejected > 0 ? "down" : undefined}
            />
            <Stat label="Value" value={formatPeso(preview.acceptedTotalCentavos)} />
          </StatGrid>

          {preview.warnings.length > 0 ? (
            <Card title="Assumed on your behalf">
              <ul className="divide-y-2 divide-line">
                {preview.warnings.map((w) => (
                  <li key={w.message} className="flex justify-between gap-3 py-2.5">
                    <span>{w.message}</span>
                    <span className="tabular shrink-0 font-bold">{w.count}</span>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          <Card title={`Rejected rows (${preview.rejected})`}>
            {preview.rejectedRows.length === 0 ? (
              <Empty>Every row can be imported.</Empty>
            ) : (
              <ul className="divide-y-2 divide-line">
                {preview.rejectedRows.map((r) => (
                  <li key={r.rowNumber} className="py-3">
                    <div className="font-semibold text-danger">
                      Row {r.rowNumber}: {r.reason}
                    </div>
                    <div className="mt-0.5 truncate text-sm text-ink-soft">{r.raw}</div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {preview.unusedColumns.length > 0 ? (
            <Note tone="warn">
              Nothing was read from: {preview.unusedColumns.join(", ")}. If one of
              those holds the plot or the amount, rename its header and check again.
            </Note>
          ) : null}

          {preview.sample.length > 0 ? (
            <Card title="First few rows, as they would be saved">
              <ul className="divide-y-2 divide-line">
                {preview.sample.map((s) => (
                  <li key={s.rowNumber} className="flex justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <div className="truncate font-semibold">
                        {s.date} · {s.activity}
                      </div>
                      <div className="text-sm text-ink-soft">
                        {s.category} ·{" "}
                        {s.attribution === "farm_wide"
                          ? "whole farm"
                          : `${s.plotCount} ${s.plotCount === 1 ? "plot" : "plots"}`}
                      </div>
                    </div>
                    <Money centavos={s.amountCentavos} />
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          {!preview.committed && preview.accepted > 0 ? (
            <Button className="w-full" disabled={busy} onClick={() => run("commit")}>
              {busy ? "Importing…" : `Import ${preview.accepted} rows`}
            </Button>
          ) : null}
        </>
      ) : null}
    </>
  );
}
