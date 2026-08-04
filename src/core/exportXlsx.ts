import ExcelJS from "exceljs";
import type { IntrastatDeclarationLine } from "./types";

// Exact header strings from the accountant's за НАП.xls reference file, including
// its typo ("проиозход") and double space ("Регион  на потребление") — kept verbatim
// so the output stays compatible with her existing submission tooling.
export const HEADER_ROW = [
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
];

// Column index (0-based) of "Нето тегло в кг" in HEADER_ROW — kept fixed-point
// so summed floats (e.g. 45.56700000000001) never leak into the file.
const NET_WEIGHT_COLUMN = 9;
const NET_WEIGHT_NUMBER_FORMAT = "0.000";

// Columns (0-based) whose data-row values are bolded per the accountant's
// reference formatting: commodity code, partner country, country of origin.
const BOLD_VALUE_COLUMNS = [1, 2, 3];

const THIN_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: "thin" },
  left: { style: "thin" },
  bottom: { style: "thin" },
  right: { style: "thin" },
};

/** Guards against float-summation drift, matching the rounding used when the line was mapped. */
function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function lineToRow(line: IntrastatDeclarationLine): (string | number)[] {
  return [
    // Always empty — the accountant doesn't want this column auto-numbered.
    "",
    line.commodityCode,
    line.partnerCountry,
    line.countryOfOrigin,
    line.natureOfTransaction,
    line.deliveryTerms,
    line.modeOfTransport,
    line.transportNationality,
    line.regionOfConsumption,
    line.netWeightKg,
    // Blank (not 0) when the accountant hasn't entered a value — see
    // types.ts and DeclarationTable.tsx for why NaN represents "blank".
    Number.isNaN(line.supplementaryQuantity) ? "" : line.supplementaryQuantity,
    line.value,
    line.statisticalValue,
  ];
}

export interface IntrastatTotals {
  netWeightKg: number;
  value: number;
  statisticalValue: number;
}

export function computeTotals(
  lines: IntrastatDeclarationLine[],
): IntrastatTotals {
  return {
    netWeightKg: lines.reduce((sum, line) => sum + line.netWeightKg, 0),
    value: lines.reduce((sum, line) => sum + line.value, 0),
    statisticalValue: lines.reduce(
      (sum, line) => sum + line.statisticalValue,
      0,
    ),
  };
}

function totalsRow(lines: IntrastatDeclarationLine[]): (string | number)[] {
  const totals = computeTotals(lines);
  const row: (string | number)[] = new Array(HEADER_ROW.length).fill("");
  row[NET_WEIGHT_COLUMN] = roundTo(totals.netWeightKg, 3);
  row[11] = totals.value;
  row[12] = totals.statisticalValue;
  return row;
}

export function buildIntrastatWorkbook(
  lines: IntrastatDeclarationLine[],
): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Sheet1");

  const headerRow = sheet.addRow(HEADER_ROW);
  headerRow.height = 60;
  headerRow.eachCell((cell) => {
    cell.alignment = {
      wrapText: true,
      vertical: "middle",
      horizontal: "center",
    };
  });
  sheet.columns.forEach((column) => {
    column.width = 14;
  });

  for (const line of lines) {
    const row = sheet.addRow(lineToRow(line));
    for (const column of BOLD_VALUE_COLUMNS) {
      row.getCell(column + 1).font = { bold: true };
    }
  }

  const totals = totalsRow(lines);
  const totalsSheetRow = sheet.addRow(totals);
  totalsSheetRow.font = { bold: true };

  const lastRow = 1 + lines.length + 1;
  for (let r = 1; r <= lastRow; r++) {
    for (let c = 1; c <= HEADER_ROW.length; c++) {
      sheet.getRow(r).getCell(c).border = THIN_BORDER;
    }
  }

  const netWeightColumn = sheet.getColumn(NET_WEIGHT_COLUMN + 1);
  netWeightColumn.numFmt = NET_WEIGHT_NUMBER_FORMAT;

  return workbook;
}

// exceljs's own type declarations ship a stray `declare interface Buffer
// extends ArrayBuffer {}` that merges with (and breaks) @types/node's real
// Buffer type. Treating writeBuffer()'s result as ArrayBuffer sidesteps that
// conflict — Buffer.from/Uint8Array both copy the underlying bytes correctly
// at runtime regardless of which of the two shapes the value actually is.
async function writeWorkbookBytes(
  lines: IntrastatDeclarationLine[],
): Promise<ArrayBuffer> {
  const written = await buildIntrastatWorkbook(lines).xlsx.writeBuffer();
  return written as unknown as ArrayBuffer;
}

export async function intrastatWorkbookToBuffer(
  lines: IntrastatDeclarationLine[],
): Promise<Buffer> {
  return Buffer.from(await writeWorkbookBytes(lines));
}

export async function intrastatWorkbookToUint8Array(
  lines: IntrastatDeclarationLine[],
): Promise<Uint8Array<ArrayBuffer>> {
  return new Uint8Array(await writeWorkbookBytes(lines));
}
