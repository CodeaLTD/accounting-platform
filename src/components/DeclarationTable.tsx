"use client";

import type { ReactNode } from "react";
import { HEADER_ROW, computeTotals } from "@/core/exportXlsx";
import type { PartnerCountry, TransportMode } from "@/core/constants";
import type { IntrastatDeclarationLine, WorkingLine } from "@/core/types";
import { MESSAGES } from "@/app/messages";

// Column order below (after the leading action/invoice-number columns) must
// exactly match HEADER_ROW (src/core/exportXlsx.ts), which in turn matches
// lineToRow's field order there. Keep them in sync.

interface DeclarationTableProps {
  lines: WorkingLine[];
  onLineChange: (
    index: number,
    patch: Partial<IntrastatDeclarationLine>,
  ) => void;
  showInvoiceNumber: boolean;
  renderRowAction: (index: number) => ReactNode;
}

export function DeclarationTable({
  lines,
  onLineChange,
  showInvoiceNumber,
  renderRowAction,
}: DeclarationTableProps) {
  // Numeric cells: `Number("")` is 0, which would silently snap a cleared
  // field to 0 while the accountant is retyping it. Parse blank input as
  // NaN instead, and render NaN back as an empty string so the field can
  // stay blank mid-edit. Also accept a comma as the decimal separator,
  // since that's what the fields display (Bulgarian convention) and what
  // she's used to typing.
  function parseNumericInput(raw: string): number {
    if (raw === "") return NaN;
    return Number(raw.replace(",", "."));
  }

  // Decimal fields (netWeightKg, value, statisticalValue) are shown with a
  // comma, not a point, to match Bulgarian convention — plain `<input
  // type="number">` can't do that, so these render as text inputs formatted
  // via this helper and reparsed by parseNumericInput above.
  function formatDecimal(value: number): string {
    if (Number.isNaN(value)) return "";
    return value.toLocaleString("bg-BG", { maximumFractionDigits: 3 });
  }

  const totals = computeTotals(lines);

  // Summing floats leaves stray trailing digits (e.g. 45.56700000000001).
  // Round to the same precision the accountant enters before formatting, so
  // the on-screen total matches what she'd get adding the column by hand.
  function formatTotal(value: number, maximumFractionDigits: number): string {
    return value.toLocaleString("bg-BG", { maximumFractionDigits });
  }

  // Leading columns before HEADER_ROW's own 13 columns: the row action
  // button, plus the invoice number column when shown. The totals row's
  // leading blank span must grow to match, so the numeric totals still
  // land under the right data columns.
  const leadingColSpan = 9 + 1 + (showInvoiceNumber ? 1 : 0);

  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr>
          <th className="border px-2 py-1" />
          {showInvoiceNumber && (
            <th className="border px-2 py-1 text-left">
              {MESSAGES.labels.invoiceNumberColumn}
            </th>
          )}
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
            <td className="border px-1">{renderRowAction(index)}</td>
            {showInvoiceNumber && (
              <td
                className="border px-1"
                aria-label={`${MESSAGES.labels.invoiceNumberColumn} row ${index + 1}`}
              >
                {line.invoiceNumber}
              </td>
            )}
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
                  onLineChange(index, { commodityCode: e.target.value })
                }
              />
            </td>
            <td className="border px-1">
              <input
                type="text"
                aria-label={`${HEADER_ROW[2]} row ${index + 1}`}
                value={line.partnerCountry}
                onChange={(e) =>
                  onLineChange(index, {
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
                  onLineChange(index, { countryOfOrigin: e.target.value })
                }
              />
            </td>
            <td className="border px-1">
              <input
                type="text"
                aria-label={`${HEADER_ROW[4]} row ${index + 1}`}
                value={line.natureOfTransaction}
                onChange={(e) =>
                  onLineChange(index, { natureOfTransaction: e.target.value })
                }
              />
            </td>
            <td className="border px-1">
              <input
                type="text"
                aria-label={`${HEADER_ROW[5]} row ${index + 1}`}
                value={line.deliveryTerms}
                onChange={(e) =>
                  onLineChange(index, { deliveryTerms: e.target.value })
                }
              />
            </td>
            <td className="border px-1">
              <input
                type="text"
                aria-label={`${HEADER_ROW[6]} row ${index + 1}`}
                value={line.modeOfTransport}
                onChange={(e) =>
                  onLineChange(index, {
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
                  onLineChange(index, {
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
                  onLineChange(index, {
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
                  onLineChange(index, {
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
                  onLineChange(index, {
                    value: parseNumericInput(e.target.value),
                  })
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
                  onLineChange(index, {
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
          <td className="border px-1" colSpan={leadingColSpan} />
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
