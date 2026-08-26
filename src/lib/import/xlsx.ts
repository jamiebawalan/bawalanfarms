import { unzipSync, strFromU8 } from "fflate";

/**
 * A small XLSX reader.
 *
 * An .xlsx file is a zip of XML, and all this needs from it is the first
 * sheet's cells, the shared string table, and enough of the style table to
 * know which numbers are really dates. That is about a hundred lines here,
 * against a dependency with a known prototype-pollution advisory on npm — and
 * the whole point of this app is not repeating a data-integrity failure.
 *
 * CSV is accepted too, because exporting one is a single click in Excel.
 */

export type Sheet = {
  name: string;
  /** Row 1 is the header. Values are strings, already date-normalised. */
  rows: string[][];
};

export function readSpreadsheet(bytes: Uint8Array, filename: string): Sheet {
  if (/\.csv$/i.test(filename)) {
    return { name: filename, rows: parseCsv(strFromU8(bytes)) };
  }
  return readXlsx(bytes);
}

function readXlsx(bytes: Uint8Array): Sheet {
  const files = unzipSync(bytes);

  const shared = readSharedStrings(files["xl/sharedStrings.xml"]);
  const dateStyles = readDateStyles(files["xl/styles.xml"]);

  const sheetPath =
    Object.keys(files)
      .filter((p) => /^xl\/worksheets\/sheet\d+\.xml$/.test(p))
      .sort()[0] ?? null;
  if (sheetPath === null) throw new Error("That file has no worksheet in it.");

  const xml = strFromU8(files[sheetPath]!);
  const name = readFirstSheetName(files["xl/workbook.xml"]) ?? "Sheet1";
  const grid: string[][] = [];

  for (const rowXml of matchAll(xml, /<row[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells: string[] = [];
    for (const cellXml of matchAll(rowXml, /<c\b([^>]*)\/>|<c\b([^>]*)>([\s\S]*?)<\/c>/g, true)) {
      const [attrs, body] = cellXml;
      const ref = attr(attrs, "r");
      const index = ref ? columnIndex(ref) : cells.length;
      while (cells.length < index) cells.push("");
      cells[index] = decodeCell(attrs, body, shared, dateStyles);
    }
    grid.push(cells);
  }

  return { name, rows: grid.filter((r) => r.some((c) => c.trim() !== "")) };
}

function decodeCell(
  attrs: string,
  body: string,
  shared: string[],
  dateStyles: Set<number>,
): string {
  const type = attr(attrs, "t");

  if (type === "inlineStr") {
    return unescapeXml(matchAll(body, /<t[^>]*>([\s\S]*?)<\/t>/g).join(""));
  }

  const raw = unescapeXml(/<v[^>]*>([\s\S]*?)<\/v>/.exec(body)?.[1] ?? "");
  if (raw === "") return "";

  if (type === "s") {
    return shared[Number(raw)] ?? "";
  }
  if (type === "str" || type === "e") return raw;
  if (type === "b") return raw === "1" ? "TRUE" : "FALSE";

  // A bare number that carries a date format is a date. This is exactly where
  // the old workbook did its damage: a plot list typed as "24/2" was stored as
  // a date serial and looked like a number ever after.
  const styleIndex = Number(attr(attrs, "s") ?? "-1");
  if (dateStyles.has(styleIndex)) {
    const iso = serialToISO(Number(raw));
    if (iso !== null) return iso;
  }
  return raw;
}

function readSharedStrings(file: Uint8Array | undefined): string[] {
  if (!file) return [];
  const xml = strFromU8(file);
  return matchAll(xml, /<si>([\s\S]*?)<\/si>/g).map((si) =>
    unescapeXml(matchAll(si, /<t[^>]*>([\s\S]*?)<\/t>/g).join("")),
  );
}

/** Which cell style indexes mean "this number is a date". */
function readDateStyles(file: Uint8Array | undefined): Set<number> {
  const styles = new Set<number>();
  if (!file) return styles;
  const xml = strFromU8(file);

  // Built-in formats Excel reserves for dates and times.
  const builtinDate = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47]);
  const customDate = new Set<number>();
  for (const fmt of matchAll(xml, /<numFmt\b([^>]*)\/>/g)) {
    const id = Number(attr(fmt, "numFmtId") ?? "-1");
    const code = attr(fmt, "formatCode") ?? "";
    if (/[dmyhs]/i.test(code.replace(/\[[^\]]*\]|"[^"]*"/g, ""))) customDate.add(id);
  }

  const cellXfs = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(xml)?.[1] ?? "";
  let index = 0;
  for (const xf of matchAll(cellXfs, /<xf\b([^>]*?)(?:\/>|>[\s\S]*?<\/xf>)/g)) {
    const id = Number(attr(xf, "numFmtId") ?? "0");
    if (builtinDate.has(id) || customDate.has(id)) styles.add(index);
    index += 1;
  }
  return styles;
}

function readFirstSheetName(file: Uint8Array | undefined): string | null {
  if (!file) return null;
  const xml = strFromU8(file);
  const sheet = /<sheet\b([^>]*)\/>/.exec(xml)?.[1];
  return sheet ? (attr(sheet, "name") ?? null) : null;
}

/**
 * Excel counts days from an epoch of 1899-12-30 and believes 1900 was a leap
 * year, so serial 60 is the date 1900-02-29, which never happened.
 *
 * The usual -25569 offset silently absorbs that phantom day, which makes it
 * correct from 1900-03-01 onward and one day out for everything before. Farm
 * dates are all well past that, but a conversion that is quietly wrong in a
 * corner is exactly the kind of thing this app exists to stop inheriting.
 */
export function serialToISO(serial: number): string | null {
  if (!Number.isFinite(serial) || serial <= 0) return null;
  if (Math.floor(serial) === 60) return null; // 1900-02-29 never existed
  const adjusted = serial < 60 ? serial + 1 : serial;
  const ms = Math.round((adjusted - 25569) * 86_400_000);
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

/** "BC7" -> 54. */
export function columnIndex(ref: string): number {
  const letters = /^([A-Z]+)/.exec(ref)?.[1] ?? "A";
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  const source = text.replace(/^﻿/, "");
  for (let i = 0; i < source.length; i++) {
    const ch = source[i]!;
    if (quoted) {
      if (ch === '"') {
        if (source[i + 1] === '"') { field += '"'; i += 1; }
        else quoted = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') { quoted = true; continue; }
    if (ch === ",") { row.push(field); field = ""; continue; }
    if (ch === "\r") continue;
    if (ch === "\n") { row.push(field); rows.push(row); row = []; field = ""; continue; }
    field += ch;
  }
  if (field !== "" || row.length > 0) { row.push(field); rows.push(row); }

  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

// --- tiny XML helpers ------------------------------------------------------

function attr(attrs: string, name: string): string | null {
  const m = new RegExp(`${name}="([^"]*)"`).exec(attrs);
  return m ? m[1]! : null;
}

function matchAll(text: string, re: RegExp): string[];
function matchAll(text: string, re: RegExp, pair: true): [string, string][];
function matchAll(text: string, re: RegExp, pair?: true): string[] | [string, string][] {
  const out: unknown[] = [];
  for (const m of text.matchAll(re)) {
    if (pair) {
      // Either the self-closing form (group 1) or the open/close form (2 and 3).
      out.push([m[1] ?? m[2] ?? "", m[3] ?? ""]);
    } else {
      out.push(m[1] ?? "");
    }
  }
  return out as string[] | [string, string][];
}

function unescapeXml(text: string): string {
  return text
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, "&");
}
