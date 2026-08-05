import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { IntrastatDeclarationLine, WorkingLine } from "@/core/types";
import { DeclarationTable } from "./DeclarationTable";

/**
 * Wires the table to its own state the way page.tsx does, so an edit feeds
 * back in through `lines`. The numeric-input bugs below only surface once a
 * keystroke round-trips through the parent and gets reformatted.
 */
function ControlledTable({ initial }: { initial: WorkingLine[] }) {
  const [lines, setLines] = useState(initial);
  return (
    <DeclarationTable
      lines={lines}
      onLineChange={(index: number, patch: Partial<IntrastatDeclarationLine>) =>
        setLines((prev) =>
          prev.map((line, i) => (i === index ? { ...line, ...patch } : line)),
        )
      }
      showInvoiceNumber={false}
      renderRowAction={() => null}
    />
  );
}

const sampleLines: WorkingLine[] = [
  {
    sequenceNumber: null,
    commodityCode: "82084000",
    partnerCountry: "IT",
    countryOfOrigin: "FR",
    natureOfTransaction: "1",
    deliveryTerms: "CPT",
    modeOfTransport: "3",
    transportNationality: "BG",
    regionOfConsumption: "SZR",
    netWeightKg: 15,
    supplementaryQuantity: NaN,
    value: 560,
    statisticalValue: 560,
    invoiceNumber: "INV-001",
  },
];

describe("DeclarationTable", () => {
  it("renders one row per line with correct values", () => {
    render(
      <DeclarationTable
        lines={sampleLines}
        onLineChange={vi.fn()}
        showInvoiceNumber={false}
        renderRowAction={() => null}
      />,
    );
    expect(screen.getByLabelText("Код на стоката row 1")).toHaveValue(
      "82084000",
    );
    expect(screen.getByLabelText("Нето тегло в кг row 1")).toHaveValue("15");
  });

  it("calls onLineChange with the row index and the edited patch", () => {
    const onLineChange = vi.fn();
    render(
      <DeclarationTable
        lines={sampleLines}
        onLineChange={onLineChange}
        showInvoiceNumber={false}
        renderRowAction={() => null}
      />,
    );

    const commodityCodeInput = screen.getByLabelText(
      "Код на стоката row 1",
    ) as HTMLInputElement;
    fireEvent.change(commodityCodeInput, { target: { value: "99999999" } });

    expect(onLineChange).toHaveBeenCalledWith(0, {
      commodityCode: "99999999",
    });
  });

  it("does not coerce a cleared numeric cell to 0", () => {
    const onLineChange = vi.fn();
    render(
      <DeclarationTable
        lines={sampleLines}
        onLineChange={onLineChange}
        showInvoiceNumber={false}
        renderRowAction={() => null}
      />,
    );

    const netWeightInput = screen.getByLabelText(
      "Нето тегло в кг row 1",
    ) as HTMLInputElement;
    fireEvent.change(netWeightInput, { target: { value: "" } });

    expect(onLineChange).toHaveBeenCalledWith(0, { netWeightKg: NaN });
  });

  it("renders the supplementary quantity cell as an editable input, blank by default", () => {
    render(
      <DeclarationTable
        lines={sampleLines}
        onLineChange={vi.fn()}
        showInvoiceNumber={false}
        renderRowAction={() => null}
      />,
    );
    expect(
      screen.getByLabelText("Количество по допълнителна мярка row 1"),
    ).toHaveValue("");
  });

  it("allows entering a supplementary quantity value", () => {
    const onLineChange = vi.fn();
    render(
      <DeclarationTable
        lines={sampleLines}
        onLineChange={onLineChange}
        showInvoiceNumber={false}
        renderRowAction={() => null}
      />,
    );

    const supplementaryQuantityInput = screen.getByLabelText(
      "Количество по допълнителна мярка row 1",
    ) as HTMLInputElement;
    fireEvent.change(supplementaryQuantityInput, {
      target: { value: "12" },
    });

    expect(onLineChange).toHaveBeenCalledWith(0, {
      supplementaryQuantity: 12,
    });
  });

  // Regression: the cell used to reformat on every keystroke, so the decimal
  // separator was swallowed the instant it was typed ("15," parses to 15,
  // which formats back to "15"). Net weight carries 3 decimals, so this made
  // the column effectively integer-only.
  it("keeps the decimal separator while a decimal is being typed", async () => {
    const user = userEvent.setup();
    render(<ControlledTable initial={sampleLines} />);

    const netWeightInput = screen.getByLabelText("Нето тегло в кг row 1");
    await user.clear(netWeightInput);
    await user.type(netWeightInput, "0,085");

    expect(netWeightInput).toHaveValue("0,085");

    // On blur the draft is dropped and the committed number is reformatted —
    // which must round-trip to the same text.
    await user.tab();
    expect(netWeightInput).toHaveValue("0,085");
  });

  it("commits the parsed number as a decimal is typed", () => {
    const onLineChange = vi.fn();
    render(
      <DeclarationTable
        lines={sampleLines}
        onLineChange={onLineChange}
        showInvoiceNumber={false}
        renderRowAction={() => null}
      />,
    );

    fireEvent.change(screen.getByLabelText("Нето тегло в кг row 1"), {
      target: { value: "0,085" },
    });

    expect(onLineChange).toHaveBeenCalledWith(0, { netWeightKg: 0.085 });
  });

  // Regression: bg-BG groups thousands with U+00A0, so 12345.678 displayed as
  // "12 345,678" — which parsed straight back to NaN, blanking the cell and
  // blocking the download the moment the accountant touched it.
  it("renders a five-digit value without a grouping separator, and keeps it editable", async () => {
    const user = userEvent.setup();
    render(
      <ControlledTable
        initial={[{ ...sampleLines[0], value: 12345.678 }]}
      />,
    );

    const valueInput = screen.getByLabelText("Стойност в лв row 1");
    expect(valueInput).toHaveValue("12345,678");

    await user.type(valueInput, "9");
    expect(valueInput).toHaveValue("12345,6789");
  });

  it("parses a value that still carries grouping spaces, e.g. when pasted", () => {
    const onLineChange = vi.fn();
    render(
      <DeclarationTable
        lines={sampleLines}
        onLineChange={onLineChange}
        showInvoiceNumber={false}
        renderRowAction={() => null}
      />,
    );

    fireEvent.change(screen.getByLabelText("Стойност в лв row 1"), {
      target: { value: "12 345,678" },
    });

    expect(onLineChange).toHaveBeenCalledWith(0, { value: 12345.678 });
  });

  it("shows the invoice number column when showInvoiceNumber is true", () => {
    render(
      <DeclarationTable
        lines={sampleLines}
        onLineChange={vi.fn()}
        showInvoiceNumber
        renderRowAction={() => null}
      />,
    );
    expect(screen.getByLabelText("Фактура № row 1")).toHaveTextContent(
      "INV-001",
    );
  });

  it("hides the invoice number column when showInvoiceNumber is false", () => {
    render(
      <DeclarationTable
        lines={sampleLines}
        onLineChange={vi.fn()}
        showInvoiceNumber={false}
        renderRowAction={() => null}
      />,
    );
    expect(
      screen.queryByLabelText("Фактура № row 1"),
    ).not.toBeInTheDocument();
  });

  it("renders the per-row action passed via renderRowAction", () => {
    render(
      <DeclarationTable
        lines={sampleLines}
        onLineChange={vi.fn()}
        showInvoiceNumber={false}
        renderRowAction={(index) => (
          <button aria-label={`add row ${index + 1}`}>+</button>
        )}
      />,
    );
    expect(
      screen.getByRole("button", { name: "add row 1" }),
    ).toBeInTheDocument();
  });

  it("only mounts a subset of rows into the DOM when there are far more rows than fit the viewport", () => {
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
      width: 1000,
      height: 300,
      top: 0,
      left: 0,
      bottom: 300,
      right: 1000,
      x: 0,
      y: 0,
      toJSON: () => {},
    });

    const manyLines: WorkingLine[] = Array.from({ length: 200 }, (_, i) => ({
      ...sampleLines[0],
      commodityCode: `ROW-${i}`,
    }));

    render(
      <DeclarationTable
        lines={manyLines}
        onLineChange={vi.fn()}
        showInvoiceNumber={false}
        renderRowAction={() => null}
      />,
    );

    // A 300px viewport at 40px/row fits well under 200 rows at once — if
    // virtualization is working, most of the 200 inputs never mount.
    const renderedInputs = screen.getAllByDisplayValue(/^ROW-/);
    expect(renderedInputs.length).toBeGreaterThan(0);
    expect(renderedInputs.length).toBeLessThan(200);
  });
});
