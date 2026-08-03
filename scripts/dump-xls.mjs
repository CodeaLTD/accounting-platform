import XLSX from "xlsx";
import { writeFileSync } from "fs";

const files = ["Invoice Details Inquiry.xls", "за НАП.xls"];

for (const file of files) {
  const wb = XLSX.readFile(file, { codepage: 1251 });
  const out = {};
  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    out[sheetName] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  }
  const outPath = `scripts/dump-${file.replace(/[^\w]+/g, "_")}.json`;
  writeFileSync(outPath, JSON.stringify(out, null, 2), "utf-8");
  console.log(`Wrote ${outPath}`);
}
