"use client";

import { HEADER_ROW, computeTotals } from "@/core/exportXlsx";
import type { PartnerCountry, TransportMode } from "@/core/constants";
import type { IntrastatDeclarationLine } from "@/core/types";

// Column order below must exactly match HEADER_ROW (src/core/exportXlsx.ts),
// which in turn matches lineToRow's field order there. Keep them in sync.

interface ReviewTableProps {
  lines: IntrastatDeclarationLine[];
  onChange: (lines: IntrastatDeclarationLine[]) => void;
}

export function ReviewTable({ lines, onChange }: ReviewTableProps) {
  function updateLine(
    index: number,
    patch: Partial<IntrastatDeclarationLine>,
  ) {
    onChange(
      lines.map((line, i) => (i === index ? { ...line, ...patch } : line)),
    );
  }

  // Numeric cells: `Number("")` is 0, which would silently snap a cleared
  // field to 0 while the accountant is retyping it. Parse blank input as
  // NaN instead (kept out of the line only via rendering below), and render
  // NaN back as an empty string so the field can stay blank mid-edit. Also
  // accept a comma as the decimal separator, since that's what the fields
  // display (Bulgarian convention) and what she's used to typing.
  function parseNumericInput(raw: string): number {
    if (raw === "") return NaN;
    return Number(raw.replace(",", "."));
  }

  // Decimal fields (netWeightKg, value, statisticalValue) are shown with a
  // comma, not a point, to match Bulgarian convention — plain `<input
  // type="number">` can't do that, so these render as text inputs formatted
  // on blur/via this helper and reparsed by parseNumericInput above.
  function formatDecimal(value: number): string {
    if (Number.isNaN(value)) return "";
    return value.toLocaleString("bg-BG", { maximumFractionDigits: 3 });
  }

  const totals = computeTotals(lines);

  // Summing floats leaves stray trailing digits (e.g. 45.56700000000001).
  // Round to the same precision the accountant enters before formatting,
  // so the on-screen total matches what she'd get adding the column by hand.
  function formatTotal(value: number, maximumFractionDigits: number): string {
    return value.toLocaleString("bg-BG", { maximumFractionDigits });
  }

  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr>
          {HEADER_ROW.map((label) => (
            <th key={label} className="border px-2 py-1 text-left">
              {label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {lines.map((line, index) => (
          <tr key={index}>
            {/* Sequence number: always empty, not editable — locked by the
                type system (IntrastatDeclarationLine.sequenceNumber is a
                literal `null`) per the accountant's request to drop the
                auto-numbering. */}
            <td
              className="border px-1"
              aria-label={`${HEADER_ROW[0]} row ${index + 1}`}
            />
            <td className="border px-1">
              <input
                type="text"
                aria-label={`${HEADER_ROW[1]} row ${index + 1}`}
                value={line.commodityCode}
                onChange={(e) =>
                  updateLine(index, { commodityCode: e.target.value })
                }
              />
            </td>
            <td className="border px-1">
              <input
                type="text"
                aria-label={`${HEADER_ROW[2]} row ${index + 1}`}
                value={line.partnerCountry}
                onChange={(e) =>
                  updateLine(index, {
                    partnerCountry: e.target.value as PartnerCountry,
                  })
                }
              />
            </td>
            <td className="border px-1">
              <input
                type="text"
                aria-label={`${HEADER_ROW[3]} row ${index + 1}`}
                value={line.countryOfOrigin}
                onChange={(e) =>
                  updateLine(index, { countryOfOrigin: e.target.value })
                }
              />
            </td>
            <td className="border px-1">
              <input
                type="text"
                aria-label={`${HEADER_ROW[4]} row ${index + 1}`}
                value={line.natureOfTransaction}
                onChange={(e) =>
                  updateLine(index, { natureOfTransaction: e.target.value })
                }
              />
            </td>
            <td className="border px-1">
              <input
                type="text"
                aria-label={`${HEADER_ROW[5]} row ${index + 1}`}
                value={line.deliveryTerms}
                onChange={(e) =>
                  updateLine(index, { deliveryTerms: e.target.value })
                }
              />
            </td>
            <td className="border px-1">
              <input
                type="text"
                aria-label={`${HEADER_ROW[6]} row ${index + 1}`}
                value={line.modeOfTransport}
                onChange={(e) =>
                  updateLine(index, {
                    modeOfTransport: e.target.value as TransportMode,
                  })
                }
              />
            </td>
            <td className="border px-1">
              <input
                type="text"
                aria-label={`${HEADER_ROW[7]} row ${index + 1}`}
                value={line.transportNationality}
                onChange={(e) =>
                  updateLine(index, {
                    transportNationality: e.target.value,
                  })
                }
              />
            </td>
            <td className="border px-1">
              <input
                type="text"
                aria-label={`${HEADER_ROW[8]} row ${index + 1}`}
                value={line.regionOfConsumption}
                onChange={(e) =>
                  updateLine(index, {
                    regionOfConsumption: e.target.value,
                  })
                }
              />
            </td>
            <td className="border px-1">
              <input
                type="text"
                inputMode="decimal"
                aria-label={`${HEADER_ROW[9]} row ${index + 1}`}
                value={formatDecimal(line.netWeightKg)}
                onChange={(e) =>
                  updateLine(index, {
                    netWeightKg: parseNumericInput(e.target.value),
                  })
                }
              />
            </td>
            {/* Supplementary quantity: always empty, not editable — locked
                by the type system (IntrastatDeclarationLine.supplementaryQuantity
                is a literal `null`) per the accountant's submission process. */}
            <td
              className="border px-1"
              aria-label={`${HEADER_ROW[10]} row ${index + 1}`}
            />
            <td className="border px-1">
              <input
                type="text"
                inputMode="decimal"
                aria-label={`${HEADER_ROW[11]} row ${index + 1}`}
                value={formatDecimal(line.value)}
                onChange={(e) =>
                  updateLine(index, { value: parseNumericInput(e.target.value) })
                }
              />
            </td>
            <td className="border px-1">
              <input
                type="text"
                inputMode="decimal"
                aria-label={`${HEADER_ROW[12]} row ${index + 1}`}
                value={formatDecimal(line.statisticalValue)}
                onChange={(e) =>
                  updateLine(index, {
                    statisticalValue: parseNumericInput(e.target.value),
                  })
                }
              />
            </td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr className="font-bold">
          <td className="border px-1" colSpan={9} />
          <td className="border px-1">{formatTotal(totals.netWeightKg, 3)}</td>
          <td className="border px-1" />
          <td className="border px-1">{formatTotal(totals.value, 2)}</td>
          <td className="border px-1">
            {formatTotal(totals.statisticalValue, 2)}
          </td>
        </tr>
      </tfoot>
    </table>
  );
}
