import { describe, expect, it } from "vitest";
import { zipSync, strToU8 } from "fflate";
import { columnIndex, parseCsv, readSpreadsheet, serialToISO } from "./xlsx";

/** Builds a real .xlsx in memory, so the reader is tested against the format. */
function makeXlsx(rows: (string | number)[][], dateColumns: number[] = []): Uint8Array {
  const shared: string[] = [];
  const idFor = (s: string) => {
    const at = shared.indexOf(s);
    return at >= 0 ? at : shared.push(s) - 1;
  };

  const body = rows
    .map((row, r) => {
      const cells = row
        .map((value, c) => {
          const ref = `${String.fromCharCode(65 + c)}${r + 1}`;
          if (typeof value === "number") {
            const style = dateColumns.includes(c) ? ' s="1"' : "";
            return `<c r="${ref}"${style}><v>${value}</v></c>`;
          }
          return `<c r="${ref}" t="s"><v>${idFor(value)}</v></c>`;
        })
        .join("");
      return `<row r="${r + 1}">${cells}</row>`;
    })
    .join("");

  return zipSync({
    "[Content_Types].xml": strToU8("<Types/>"),
    "xl/workbook.xml": strToU8(
      `<workbook><sheets><sheet name="Expenses" sheetId="1"/></sheets></workbook>`,
    ),
    "xl/sharedStrings.xml": strToU8(
      `<sst>${shared.map((s) => `<si><t>${s.replace(/&/g, "&amp;")}</t></si>`).join("")}</sst>`,
    ),
    // Style 0 is plain; style 1 uses built-in date format 14.
    "xl/styles.xml": strToU8(
      `<styleSheet><cellXfs count="2"><xf numFmtId="0"/><xf numFmtId="14"/></cellXfs></styleSheet>`,
    ),
    "xl/worksheets/sheet1.xml": strToU8(`<worksheet><sheetData>${body}</sheetData></worksheet>`),
  });
}

describe("reading a real xlsx", () => {
  it("reads the header and the rows", () => {
    const file = makeXlsx([
      ["Date", "Activity", "Plot", "Amount"],
      ["2024-03-01", "Deweed", "12", 1800],
    ]);
    const sheet = readSpreadsheet(file, "expenses.xlsx");
    expect(sheet.name).toBe("Expenses");
    expect(sheet.rows[0]).toEqual(["Date", "Activity", "Plot", "Amount"]);
    expect(sheet.rows[1]).toEqual(["2024-03-01", "Deweed", "12", "1800"]);
  });

  it("turns a date-formatted number back into a date", () => {
    // 45352 with a date format is 01 Mar 2024, not the number 45352.
    const file = makeXlsx([["Date"], [45352]], [0]);
    expect(readSpreadsheet(file, "x.xlsx").rows[1]).toEqual(["2024-03-01"]);
  });

  it("leaves a plain number alone", () => {
    const file = makeXlsx([["Amount"], [1800]]);
    expect(readSpreadsheet(file, "x.xlsx").rows[1]).toEqual(["1800"]);
  });

  it("keeps empty cells in position, so columns do not shift", () => {
    // A row with a gap must not slide its later values into the wrong column.
    const file = makeXlsx([
      ["Date", "Category", "Activity", "Amount"],
      ["2024-03-01", "", "Deweed", 1800],
    ]);
    const row = readSpreadsheet(file, "x.xlsx").rows[1]!;
    expect(row[2]).toBe("Deweed");
    expect(row[3]).toBe("1800");
  });

  it("unescapes XML entities in text", () => {
    const file = makeXlsx([["Note"], ["Tools & parts"]]);
    expect(readSpreadsheet(file, "x.xlsx").rows[1]).toEqual(["Tools & parts"]);
  });

  it("skips wholly blank rows", () => {
    const file = makeXlsx([["Date"], [""], ["2024-03-01"]]);
    expect(readSpreadsheet(file, "x.xlsx").rows).toHaveLength(2);
  });
});

describe("reading a csv", () => {
  it("handles quotes, embedded commas and newlines", () => {
    const rows = parseCsv('Date,Note\n2024-03-01,"Plot 17, 18"\n2024-03-02,"a ""quote"""');
    expect(rows[1]).toEqual(["2024-03-01", "Plot 17, 18"]);
    expect(rows[2]).toEqual(["2024-03-02", 'a "quote"']);
  });

  it("strips a byte-order mark, which Excel loves to add", () => {
    expect(parseCsv("﻿Date,Amount\n2024-03-01,100")[0]).toEqual(["Date", "Amount"]);
  });

  it("is chosen by the file extension", () => {
    const sheet = readSpreadsheet(strToU8("Date,Amount\n2024-03-01,100"), "book.csv");
    expect(sheet.rows[1]).toEqual(["2024-03-01", "100"]);
  });
});

describe("spreadsheet arithmetic", () => {
  it("converts Excel serials, working around the 1900 leap-year bug", () => {
    expect(serialToISO(45352)).toBe("2024-03-01");
    expect(serialToISO(45355)).toBe("2024-03-04");
    // Serials before Excel's phantom 29 Feb 1900 need the day back.
    expect(serialToISO(1)).toBe("1900-01-01");
    expect(serialToISO(59)).toBe("1900-02-28");
    // Serial 60 is 1900-02-29, a date that never existed.
    expect(serialToISO(60)).toBeNull();
    expect(serialToISO(61)).toBe("1900-03-01");
    expect(serialToISO(0)).toBeNull();
  });

  it("reads column letters past Z", () => {
    expect(columnIndex("A1")).toBe(0);
    expect(columnIndex("Z9")).toBe(25);
    expect(columnIndex("AA1")).toBe(26);
    expect(columnIndex("BC7")).toBe(54);
  });
});
