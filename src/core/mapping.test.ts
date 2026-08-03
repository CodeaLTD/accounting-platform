import { readFileSync } from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";
import type { RegionOfConsumption } from "./constants";
import { parseSourceInvoiceWorkbook } from "./importXlsx";
import { mapInvoiceLineToIntrastat } from "./mapping";
import type { CustomerProfile, SourceInvoiceLine } from "./types";
import { makeColumnReader } from "./xlsxColumns";

// Mirrors the confirmed business rule in mapping.ts, used only to compute the
// expected value in tests — kept separate from the implementation under test.
function expectedCountryOfOrigin(source: string): string {
  if (source.trim() === "") return "";
  return source === "GB" ? "XU" : source;
}

// Golden-dataset test: reads the accountant's actual reference files directly
// (both input and output are XLS, confirmed 2026-07-30) through the same
// parseSourceInvoiceWorkbook() the app will use in production, so this test
// exercises the real import path rather than a stand-in.

const PROJECT_ROOT = process.cwd();

const sourceRows: SourceInvoiceLine[] = parseSourceInvoiceWorkbook(
  readFileSync(path.join(PROJECT_ROOT, "Invoice Details Inquiry.xls")),
);

const targetWorkbook = XLSX.readFile(
  path.join(PROJECT_ROOT, "за НАП.xls"),
  { codepage: 1251 },
);
const targetRowsAll = XLSX.utils.sheet_to_json<(string | number)[]>(
  targetWorkbook.Sheets["Sheet1"],
  { header: 1, defval: "" },
);
const [targetHeader, ...targetRowsRaw] = targetRowsAll;
const tgtCol = makeColumnReader(targetHeader);
// Drop the totals row and trailing blank rows: real data rows have a commodity code.
const targetRows = targetRowsRaw.filter(
  (row) => tgtCol(row, "Код на стоката") !== "",
);

// All 14 sample rows share the same declarant-level dropdown choices in the reference
// file. Nature of transaction / delivery terms / transport nationality are excluded
// here since the accountant confirmed those are fixed constants, not per-batch config.
// (Nature of transaction was briefly "1" per an earlier confirmation, then corrected
// back to "11" on 2026-08-03 — see project memory: intrastat-mapping-rules.)
const profile: CustomerProfile = {
  partnerCountry: tgtCol(targetRows[0], "Страна партньор") as "IT" | "FR",
  modeOfTransport: tgtCol(targetRows[0], "Вид транспорт") as "3" | "4",
  regionOfConsumption: tgtCol(
    targetRows[0],
    "Регион на потребление",
  ) as RegionOfConsumption,
};

describe("mapInvoiceLineToIntrastat", () => {
  it.each(sourceRows.map((row, i) => [i, row] as const))(
    "matches the reference declaration for row %i",
    (i, source) => {
      const targetRow = targetRows[i];
      const actual = mapInvoiceLineToIntrastat(source, profile);

      expect(actual.commodityCode).toBe(
        tgtCol(targetRow, "Код на стоката").padStart(8, "0"),
      );
      // Not compared against the reference file here: the accountant confirmed a
      // blank source origin should stay blank, which contradicts the sample row for
      // "FILTER, FUEL" (blank -> "IT" in the file). See expectedCountryOfOrigin above.
      expect(actual.countryOfOrigin).toBe(
        expectedCountryOfOrigin(source.countryOfOrigin),
      );
      expect(actual.partnerCountry).toBe(profile.partnerCountry);
      expect(actual.netWeightKg).toBeCloseTo(
        parseFloat(tgtCol(targetRow, "Нето тегло в кг")),
        6,
      );
      expect(actual.value).toBe(
        parseFloat(tgtCol(targetRow, "Стойност в лв")),
      );
      expect(actual.statisticalValue).toBe(
        parseFloat(tgtCol(targetRow, "Статистическа стойност в лв")),
      );
    },
  );

  it("covers all 14 reference rows", () => {
    expect(sourceRows).toHaveLength(14);
    expect(targetRows).toHaveLength(14);
  });
});

describe("country of origin edge cases", () => {
  const baseLine: SourceInvoiceLine = {
    customerCode: "",
    documentType: "",
    orderNumber: "",
    customerOrderNumber: "",
    sublineNumber: "",
    invoiceNumber: "",
    invoiceLine: "",
    invoiceDate: "",
    invoiceDueDate: "",
    deliveryDocument: "",
    deliveryDocumentDate: "",
    partNumber: "",
    partDescription: "",
    carrierCode: "",
    carrierName: "",
    manufacturedCode: "",
    countryOfOrigin: "",
    supersessions: "",
    warehouse: "",
    unitNetWeightKg: 1,
    invoicedQuantity: 1,
    unitListPrice: 0,
    unitNetPrice: 0,
    totalInvoiceVat: 0,
    totalInvoiceAmount: 0,
    surcharges: 0,
    currency: "EUR",
    caseNumber: "",
    customsCode: "00000000 - 0000",
  };
  const profile: CustomerProfile = {
    partnerCountry: "IT",
    modeOfTransport: "3",
    regionOfConsumption: "SZR",
  };

  it("maps GB to the post-Brexit Intrastat code XU", () => {
    const result = mapInvoiceLineToIntrastat(
      { ...baseLine, countryOfOrigin: "GB" },
      profile,
    );
    expect(result.countryOfOrigin).toBe("XU");
  });

  it("leaves a blank country of origin blank", () => {
    const result = mapInvoiceLineToIntrastat(
      { ...baseLine, countryOfOrigin: "" },
      profile,
    );
    expect(result.countryOfOrigin).toBe("");
  });

  it("passes through other country codes unchanged", () => {
    const result = mapInvoiceLineToIntrastat(
      { ...baseLine, countryOfOrigin: "DE" },
      profile,
    );
    expect(result.countryOfOrigin).toBe("DE");
  });

  it("always applies the fixed constants regardless of profile", () => {
    const result = mapInvoiceLineToIntrastat(baseLine, profile);
    expect(result.natureOfTransaction).toBe("11");
    expect(result.deliveryTerms).toBe("CPT");
    expect(result.transportNationality).toBe("BG");
  });
});
