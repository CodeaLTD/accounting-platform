"use client";

import { useRef, type ReactNode } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { HEADER_ROW, computeTotals } from "@/core/exportXlsx";
import type { PartnerCountry, TransportMode } from "@/core/constants";
import type { IntrastatDeclarationLine, WorkingLine } from "@/core/types";
import { MESSAGES } from "@/app/messages";

// Column order below (after the leading action/invoice-number columns) must
// exactly match HEADER_ROW (src/core/exportXlsx.ts), which in turn matches
// lineToRow's field order there. Keep them in sync.

// Every row is a fixed single line of inputs, so the virtualizer can use a
// constant estimated size instead of dynamic per-row measurement.
const ROW_HEIGHT_PX = 40;

const ACTION_COLUMN_WIDTH = 40;
const INVOICE_NUMBER_COLUMN_WIDTH = 110;

// Fixed pixel width per HEADER_ROW column, in the same order as
// HEADER_ROW. CSS Grid (unlike a native <table>, which auto-sizes columns
// per-table) needs explicit widths so the header, each virtualized body
// row, and the totals footer — three separate elements — stay aligned.
const DATA_COLUMN_WIDTHS = [
  60, // № по ред (always empty)
  100, // Код на стоката
  90, // Страна партньор
  90, // Страна на проиозход
  90, // Вид на сделката
  90, // Условия на доставка
  90, // Вид транспорт
  160, // Националност на транспортното средство
  110, // Регион на потребление
  110, // Нето тегло в кг
  110, // Количество по допълнителна мярка (always empty)
  110, // Стойност в лв
  140, // Статистическа стойност в лв
];

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
  const scrollRef = useRef<HTMLDivElement>(null);

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
  // leading span must grow to match, so the numeric totals still land
  // under the right data columns.
  const leadingColSpan = 9 + 1 + (showInvoiceNumber ? 1 : 0);

  const columnWidths = [
    ACTION_COLUMN_WIDTH,
    ...(showInvoiceNumber ? [INVOICE_NUMBER_COLUMN_WIDTH] : []),
    ...DATA_COLUMN_WIDTHS,
  ];
  const gridTemplateColumns = columnWidths.map((w) => `${w}px`).join(" ");

  const virtualizer = useVirtualizer({
    count: lines.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT_PX,
    overscan: 10,
  });

  return (
    <div role="table" className="w-full text-sm">
      <div role="rowgroup">
        <div
          role="row"
          className="grid border-b font-bold"
          style={{ gridTemplateColumns }}
        >
          <div role="columnheader" className="border px-2 py-1" />
          {showInvoiceNumber && (
            <div role="columnheader" className="border px-2 py-1 text-left">
              {MESSAGES.labels.invoiceNumberColumn}
            </div>
          )}
          {HEADER_ROW.map((label) => (
            <div
              key={label}
              role="columnheader"
              className="border px-2 py-1 text-left"
            >
              {label}
            </div>
          ))}
        </div>
      </div>

      <div
        ref={scrollRef}
        role="rowgroup"
        className="max-h-[65vh] overflow-y-auto"
      >
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            position: "relative",
          }}
        >
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const index = virtualRow.index;
            const line = lines[index];
            return (
              <div
                key={index}
                role="row"
                className="grid border-b"
                style={{
                  gridTemplateColumns,
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: `${virtualRow.size}px`,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                <div role="cell" className="border px-1">
                  {renderRowAction(index)}
                </div>
                {showInvoiceNumber && (
                  <div
                    role="cell"
                    className="border px-1"
                    aria-label={`${MESSAGES.labels.invoiceNumberColumn} row ${index + 1}`}
                  >
                    {line.invoiceNumber}
                  </div>
                )}
                {/* Sequence number: always empty, not editable — locked by
                    the type system (IntrastatDeclarationLine.sequenceNumber
                    is a literal `null`) per the accountant's request to
                    drop the auto-numbering. */}
                <div
                  role="cell"
                  className="border px-1"
                  aria-label={`${HEADER_ROW[0]} row ${index + 1}`}
                />
                <div role="cell" className="border px-1">
                  <input
                    type="text"
                    aria-label={`${HEADER_ROW[1]} row ${index + 1}`}
                    value={line.commodityCode}
                    onChange={(e) =>
                      onLineChange(index, { commodityCode: e.target.value })
                    }
                  />
                </div>
                <div role="cell" className="border px-1">
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
                </div>
                <div role="cell" className="border px-1">
                  <input
                    type="text"
                    aria-label={`${HEADER_ROW[3]} row ${index + 1}`}
                    value={line.countryOfOrigin}
                    onChange={(e) =>
                      onLineChange(index, { countryOfOrigin: e.target.value })
                    }
                  />
                </div>
                <div role="cell" className="border px-1">
                  <input
                    type="text"
                    aria-label={`${HEADER_ROW[4]} row ${index + 1}`}
                    value={line.natureOfTransaction}
                    onChange={(e) =>
                      onLineChange(index, {
                        natureOfTransaction: e.target.value,
                      })
                    }
                  />
                </div>
                <div role="cell" className="border px-1">
                  <input
                    type="text"
                    aria-label={`${HEADER_ROW[5]} row ${index + 1}`}
                    value={line.deliveryTerms}
                    onChange={(e) =>
                      onLineChange(index, { deliveryTerms: e.target.value })
                    }
                  />
                </div>
                <div role="cell" className="border px-1">
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
                </div>
                <div role="cell" className="border px-1">
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
                </div>
                <div role="cell" className="border px-1">
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
                </div>
                <div role="cell" className="border px-1">
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
                </div>
                {/* Supplementary quantity: always empty, not editable —
                    locked by the type system
                    (IntrastatDeclarationLine.supplementaryQuantity is a
                    literal `null`) per the accountant's submission
                    process. */}
                <div
                  role="cell"
                  className="border px-1"
                  aria-label={`${HEADER_ROW[10]} row ${index + 1}`}
                />
                <div role="cell" className="border px-1">
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
                </div>
                <div role="cell" className="border px-1">
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
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div role="rowgroup">
        <div
          role="row"
          className="grid border-t font-bold"
          style={{ gridTemplateColumns }}
        >
          <div
            role="cell"
            className="border px-1"
            style={{ gridColumn: `span ${leadingColSpan}` }}
          />
          <div role="cell" className="border px-1">
            {formatTotal(totals.netWeightKg, 3)}
          </div>
          <div role="cell" className="border px-1" />
          <div role="cell" className="border px-1">
            {formatTotal(totals.value, 2)}
          </div>
          <div role="cell" className="border px-1">
            {formatTotal(totals.statisticalValue, 2)}
          </div>
        </div>
      </div>
    </div>
  );
}
