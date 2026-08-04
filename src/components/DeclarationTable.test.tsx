import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { WorkingLine } from "@/core/types";
import { DeclarationTable } from "./DeclarationTable";

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
    supplementaryQuantity: null,
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
