import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import {
  buildIntrastatWorkbook,
  intrastatWorkbookToBuffer,
  intrastatWorkbookToUint8Array,
  HEADER_ROW,
} from "./exportXlsx";
import type { IntrastatDeclarationLine } from "./types";

const sampleLines: IntrastatDeclarationLine[] = [
  {
    sequenceNumber: null,
    commodityCode: "82084000",
    partnerCountry: "IT",
    countryOfOrigin: "FR",
    natureOfTransaction: "11",
    deliveryTerms: "CPT",
    modeOfTransport: "3",
    transportNationality: "BG",
    regionOfConsumption: "SZR",
    netWeightKg: 15,
    supplementaryQuantity: NaN,
    value: 560,
    statisticalValue: 560,
  },
  {
    sequenceNumber: null,
    commodityCode: "40094200",
    partnerCountry: "IT",
    // Blank country of origin must round-trip as a genuinely empty cell.
    countryOfOrigin: "",
    natureOfTransaction: "11",
    deliveryTerms: "CPT",
    modeOfTransport: "4",
    transportNationality: "BG",
    regionOfConsumption: "SZR",
    netWeightKg: 0.085,
    supplementaryQuantity: NaN,
    value: 68,
    statisticalValue: 68,
  },
];

function readBack(workbook: ExcelJS.Workbook): (string | number)[][] {
  const sheet = workbook.getWorksheet("Sheet1")!;
  const rows: (string | number)[][] = [];
  sheet.eachRow((row) => {
    const values = row.values as (string | number)[];
    // ExcelJS rows are 1-indexed; values[0] is an unused placeholder.
    rows.push(values.slice(1).map((v) => v ?? ""));
  });
  return rows;
}

describe("buildIntrastatWorkbook", () => {
  it("writes the exact reference header row, typo and double space included", () => {
    const rows = readBack(buildIntrastatWorkbook(sampleLines));
    expect(rows[0]).toEqual([
      "№ по ред",
      "Код на стоката",
      "Страна партньор",
      "Страна на проиозход",
      "Вид на сделката",
      "Условия на доставка",
      "Вид транспорт",
      "Националност на транспортното средство",
      "Регион  на потребление",
      "Нето тегло в кг",
      "Количество по допълнителна мярка",
      "Стойност в лв",
      "Статистическа стойност в лв",
    ]);
  });

  it("round-trips values, leaving blank sequence number, origin, and supplementary quantity", () => {
    const rows = readBack(buildIntrastatWorkbook(sampleLines));
    expect(rows[1]).toEqual([
      "",
      "82084000",
      "IT",
      "FR",
      "11",
      "CPT",
      "3",
      "BG",
      "SZR",
      15,
      "",
      560,
      560,
    ]);
    expect(rows[2]).toEqual([
      "",
      "40094200",
      "IT",
      "",
      "11",
      "CPT",
      "4",
      "BG",
      "SZR",
      0.085,
      "",
      68,
      68,
    ]);
  });

  it("exports a real supplementary quantity value when the accountant has entered one", () => {
    const linesWithSupplementaryQuantity: IntrastatDeclarationLine[] = [
      { ...sampleLines[0], supplementaryQuantity: 12 },
    ];
    const rows = readBack(
      buildIntrastatWorkbook(linesWithSupplementaryQuantity),
    );
    expect(rows[1][10]).toBe(12);
  });

  it("appends a totals row summing net weight, value, and statistical value", () => {
    const rows = readBack(buildIntrastatWorkbook(sampleLines));
    expect(rows[3]).toEqual([
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      15.085,
      "",
      628,
      628,
    ]);
  });

  it("formats net weight to a fixed 3 decimals, on data rows and the totals row", () => {
    const sheet = buildIntrastatWorkbook(sampleLines).getWorksheet("Sheet1")!;
    expect(sheet.getRow(2).getCell(10).numFmt).toBe("0.000");
    expect(sheet.getRow(3).getCell(10).numFmt).toBe("0.000");
    expect(sheet.getRow(4).getCell(10).numFmt).toBe("0.000");
  });

  it("bolds the totals row but leaves the header unbolded", () => {
    const sheet = buildIntrastatWorkbook(sampleLines).getWorksheet("Sheet1")!;
    expect(sheet.getRow(1).font?.bold).not.toBe(true);
    expect(sheet.getRow(4).font?.bold).toBe(true);
  });

  it("bolds the commodity code, partner country, and country of origin on data rows", () => {
    const sheet = buildIntrastatWorkbook(sampleLines).getWorksheet("Sheet1")!;
    for (const row of [2, 3]) {
      expect(sheet.getRow(row).getCell(2).font?.bold).toBe(true); // commodity code
      expect(sheet.getRow(row).getCell(3).font?.bold).toBe(true); // partner country
      expect(sheet.getRow(row).getCell(4).font?.bold).toBe(true); // country of origin
      // A neighboring, non-bolded column stays plain.
      expect(sheet.getRow(row).getCell(1).font?.bold).not.toBe(true);
    }
  });

  it("draws a thin border around every cell, header through totals", () => {
    const sheet = buildIntrastatWorkbook(sampleLines).getWorksheet("Sheet1")!;
    for (let r = 1; r <= 4; r++) {
      for (let c = 1; c <= HEADER_ROW.length; c++) {
        const border = sheet.getRow(r).getCell(c).border;
        expect(border?.top?.style).toBe("thin");
        expect(border?.left?.style).toBe("thin");
        expect(border?.bottom?.style).toBe("thin");
        expect(border?.right?.style).toBe("thin");
      }
    }
  });

  it("wraps and centers header text in a taller row so long labels stay inside the cell", () => {
    const sheet = buildIntrastatWorkbook(sampleLines).getWorksheet("Sheet1")!;
    const headerRow = sheet.getRow(1);
    expect(headerRow.height).toBeGreaterThan(20);
    for (let c = 1; c <= HEADER_ROW.length; c++) {
      const alignment = headerRow.getCell(c).alignment;
      expect(alignment?.wrapText).toBe(true);
      expect(alignment?.vertical).toBe("middle");
      expect(alignment?.horizontal).toBe("center");
    }
  });
});

describe("intrastatWorkbookToBuffer", () => {
  it("produces a readable xlsx buffer with styling intact", async () => {
    const buffer = await intrastatWorkbookToBuffer(sampleLines);
    const workbook = new ExcelJS.Workbook();
    // exceljs's own `Buffer` type (see exportXlsx.ts) conflicts with
    // @types/node's — cast at this boundary rather than fight it.
    await workbook.xlsx.load(buffer as unknown as Parameters<
      typeof workbook.xlsx.load
    >[0]);
    const rows = readBack(workbook);
    expect(rows).toHaveLength(4);
    const sheet = workbook.getWorksheet("Sheet1")!;
    expect(sheet.getRow(4).font?.bold).toBe(true);
    expect(sheet.getRow(2).getCell(2).font?.bold).toBe(true);
    expect(sheet.getRow(2).getCell(10).numFmt).toBe("0.000");
  });
});

describe("intrastatWorkbookToUint8Array", () => {
  it("produces bytes that can be parsed back with the same content", async () => {
    const bytes = await intrastatWorkbookToUint8Array(sampleLines);
    expect(bytes).toBeInstanceOf(Uint8Array);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(bytes as unknown as Parameters<
      typeof workbook.xlsx.load
    >[0]);
    const rows = readBack(workbook);
    expect(rows[0]).toEqual(HEADER_ROW);
    expect(rows[1][1]).toBe("82084000");
  });
});
