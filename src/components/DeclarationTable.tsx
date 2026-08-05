"use client";

import { useMemo, useRef, useState, type ReactNode } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { HEADER_ROW, computeTotals } from "@/core/exportXlsx";
import type { PartnerCountry, TransportMode } from "@/core/constants";
import { toStandardDecimal } from "@/core/parseNumber";
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

/** The cells the accountant edits as numbers rather than as free text. */
type NumericField =
  | "netWeightKg"
  | "supplementaryQuantity"
  | "value"
  | "statisticalValue";

/** HEADER_ROW index for each numeric field — fixed by column order, see the
 * comment at the top of this file. */
const NUMERIC_HEADER_INDEX: Record<NumericField, number> = {
  netWeightKg: 9,
  supplementaryQuantity: 10,
  value: 11,
  statisticalValue: 12,
};

/** Which cell is currently being typed into, and the exact text so far. */
interface NumericDraft {
  row: number;
  field: NumericField;
  text: string;
}

function formatBgNumber(
  value: number,
  options: Intl.NumberFormatOptions,
): string {
  return value.toLocaleString("bg-BG", options);
}

// Decimal fields are shown with a comma, not a point, to match Bulgarian
// convention — plain `<input type="number">` can't do that, so these render as
// text inputs. Grouping is switched off deliberately: bg-BG groups thousands
// with U+00A0, so 12345.678 would display as "12 345,678", which is not a
// string parseNumericInput can read back — editing such a cell would blank it.
function formatDecimal(value: number): string {
  if (Number.isNaN(value)) return "";
  return formatBgNumber(value, { maximumFractionDigits: 3, useGrouping: false });
}

// `Number("")` is 0, which would silently snap a cleared field to 0 while the
// accountant is retyping it. Parse blank input as NaN instead so the field can
// stay blank mid-edit, with hasInvalidNumericValue() blocking the export until
// it's filled in. Accepts a comma as the decimal separator (what the fields
// display, and what she's used to typing), and strips whitespace — including
// the U+00A0 that bg-BG grouping produces — so pasted values still parse.
function parseNumericInput(raw: string): number {
  const cleaned = toStandardDecimal(raw, /\s/g);
  if (cleaned === "") return NaN;
  return Number(cleaned);
}

interface NumericCellProps {
  label: string;
  value: number;
  /** In-progress text while this cell is being edited; null when it isn't. */
  draft: string | null;
  onDraftChange: (text: string) => void;
  onDraftEnd: () => void;
}

// While a cell is being edited it renders the raw text that was typed, and
// only reverts to the formatted value on blur. Reformatting on every keystroke
// swallows the decimal separator the instant it's typed — "15," parses to 15,
// which formats straight back to "15" — which made decimals impossible to
// enter at all.
function NumericCell({
  label,
  value,
  draft,
  onDraftChange,
  onDraftEnd,
}: NumericCellProps) {
  return (
    <div role="cell" className="border px-1 min-w-0">
      <input
        type="text"
        inputMode="decimal"
        className="w-full"
        aria-label={label}
        value={draft ?? formatDecimal(value)}
        onChange={(e) => onDraftChange(e.target.value)}
        onBlur={onDraftEnd}
      />
    </div>
  );
}

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
  // Only one cell can hold focus at a time, so a single draft slot is enough.
  const [draft, setDraft] = useState<NumericDraft | null>(null);

  function draftFor(row: number, field: NumericField): string | null {
    return draft && draft.row === row && draft.field === field
      ? draft.text
      : null;
  }

  function handleNumericChange(
    row: number,
    field: NumericField,
    text: string,
  ) {
    setDraft({ row, field, text });
    onLineChange(row, { [field]: parseNumericInput(text) });
  }

  function numericCellProps(
    index: number,
    field: NumericField,
  ): NumericCellProps {
    return {
      label: `${HEADER_ROW[NUMERIC_HEADER_INDEX[field]]} row ${index + 1}`,
      value: lines[index][field],
      draft: draftFor(index, field),
      onDraftChange: (text) => handleNumericChange(index, field, text),
      onDraftEnd: () => setDraft(null),
    };
  }

  const totals = useMemo(() => computeTotals(lines), [lines]);

  // Summing floats leaves stray trailing digits (e.g. 45.56700000000001).
  // Round to the same precision the accountant enters before formatting, so
  // the on-screen total matches what she'd get adding the column by hand.
  function formatTotal(value: number, maximumFractionDigits: number): string {
    return formatBgNumber(value, { maximumFractionDigits });
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
  const totalWidth = columnWidths.reduce((a, b) => a + b, 0);

  const virtualizer = useVirtualizer({
    count: lines.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT_PX,
    overscan: 10,
  });

  // Horizontal scrolling (when the table is wider than the available
  // space) is owned by exactly one element — the outer wrapper spanning
  // header, body, and footer together — so all three can never drift out
  // of column alignment with each other. Vertical scrolling (when there
  // are more rows than fit) is scoped to just the body rowgroup, not the
  // header/footer's own height, so a table whose rows alone fit within the
  // height cap never shows a scrollbar just because the header/footer add
  // a little extra height on top.
  return (
    <div role="table" aria-rowcount={lines.length + 1} className="text-sm">
      <div
        className="overflow-x-auto overflow-y-visible"
        style={{ maxWidth: totalWidth }}
      >
        <div style={{ width: totalWidth }}>
          <div role="rowgroup">
            <div
              role="row"
              aria-rowindex={1}
              className="grid border-b font-bold"
              style={{ gridTemplateColumns }}
            >
              <div role="columnheader" className="border px-2 py-1" />
              {showInvoiceNumber && (
                <div
                  role="columnheader"
                  className="border px-2 py-1 text-left"
                >
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
            className="max-h-[65vh] overflow-y-auto overflow-x-hidden"
          >
            <div
              role="rowgroup"
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
                aria-rowindex={index + 2}
                className="grid border-b"
                style={{
                  gridTemplateColumns,
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: totalWidth,
                  height: `${virtualRow.size}px`,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                <div
                  role="cell"
                  className="flex items-center justify-center border px-1"
                >
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
                <div role="cell" className="border px-1 min-w-0">
                  <input
                    type="text"
                    className="w-full editable-input"
                    aria-label={`${HEADER_ROW[1]} row ${index + 1}`}
                    value={line.commodityCode}
                    onChange={(e) =>
                      onLineChange(index, { commodityCode: e.target.value })
                    }
                  />
                </div>
                <div role="cell" className="border px-1 min-w-0">
                  <input
                    type="text"
                    className="w-full editable-input"
                    aria-label={`${HEADER_ROW[2]} row ${index + 1}`}
                    value={line.partnerCountry}
                    onChange={(e) =>
                      onLineChange(index, {
                        partnerCountry: e.target.value as PartnerCountry,
                      })
                    }
                  />
                </div>
                <div role="cell" className="border px-1 min-w-0">
                  <input
                    type="text"
                    className="w-full editable-input"
                    aria-label={`${HEADER_ROW[3]} row ${index + 1}`}
                    value={line.countryOfOrigin}
                    onChange={(e) =>
                      onLineChange(index, { countryOfOrigin: e.target.value })
                    }
                  />
                </div>
                <div role="cell" className="border px-1 min-w-0">
                  <input
                    type="text"
                    className="w-full editable-input"
                    aria-label={`${HEADER_ROW[4]} row ${index + 1}`}
                    value={line.natureOfTransaction}
                    onChange={(e) =>
                      onLineChange(index, {
                        natureOfTransaction: e.target.value,
                      })
                    }
                  />
                </div>
                <div role="cell" className="border px-1 min-w-0">
                  <input
                    type="text"
                    className="w-full editable-input"
                    aria-label={`${HEADER_ROW[5]} row ${index + 1}`}
                    value={line.deliveryTerms}
                    onChange={(e) =>
                      onLineChange(index, { deliveryTerms: e.target.value })
                    }
                  />
                </div>
                <div role="cell" className="border px-1 min-w-0">
                  <input
                    type="text"
                    className="w-full editable-input"
                    aria-label={`${HEADER_ROW[6]} row ${index + 1}`}
                    value={line.modeOfTransport}
                    onChange={(e) =>
                      onLineChange(index, {
                        modeOfTransport: e.target.value as TransportMode,
                      })
                    }
                  />
                </div>
                <div role="cell" className="border px-1 min-w-0">
                  <input
                    type="text"
                    className="w-full editable-input"
                    aria-label={`${HEADER_ROW[7]} row ${index + 1}`}
                    value={line.transportNationality}
                    onChange={(e) =>
                      onLineChange(index, {
                        transportNationality: e.target.value,
                      })
                    }
                  />
                </div>
                <div role="cell" className="border px-1 min-w-0">
                  <input
                    type="text"
                    className="w-full editable-input"
                    aria-label={`${HEADER_ROW[8]} row ${index + 1}`}
                    value={line.regionOfConsumption}
                    onChange={(e) =>
                      onLineChange(index, {
                        regionOfConsumption: e.target.value,
                      })
                    }
                  />
                </div>
                <NumericCell {...numericCellProps(index, "netWeightKg")} />
                <NumericCell
                  {...numericCellProps(index, "supplementaryQuantity")}
                />
                <NumericCell {...numericCellProps(index, "value")} />
                <NumericCell
                  {...numericCellProps(index, "statisticalValue")}
                />
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
      </div>
    </div>
  );
}
