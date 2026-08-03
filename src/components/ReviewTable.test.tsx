import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { IntrastatDeclarationLine } from "@/core/types";
import { ReviewTable } from "./ReviewTable";

const sampleLines: IntrastatDeclarationLine[] = [
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
  },
];

describe("ReviewTable", () => {
  it("renders one row per line with correct values", () => {
    render(<ReviewTable lines={sampleLines} onChange={vi.fn()} />);
    expect(screen.getByLabelText("Код на стоката row 1")).toHaveValue(
      "82084000",
    );
    expect(screen.getByLabelText("Нето тегло в кг row 1")).toHaveValue("15");
  });

  it("calls onChange with the edited value when a cell is edited", async () => {
    const onChange = vi.fn();
    render(<ReviewTable lines={sampleLines} onChange={onChange} />);

    const commodityCodeInput = screen.getByLabelText("Код на стоката row 1") as HTMLInputElement;
    fireEvent.change(commodityCodeInput, { target: { value: "99999999" } });

    const lastCall = onChange.mock.calls.at(-1)?.[0];
    expect(lastCall[0].commodityCode).toBe("99999999");
  });

  it("does not coerce a cleared numeric cell to 0", () => {
    const onChange = vi.fn();
    render(<ReviewTable lines={sampleLines} onChange={onChange} />);

    const netWeightInput = screen.getByLabelText(
      "Нето тегло в кг row 1",
    ) as HTMLInputElement;
    fireEvent.change(netWeightInput, { target: { value: "" } });

    const lastCall = onChange.mock.calls.at(-1)?.[0];
    expect(lastCall[0].netWeightKg).not.toBe(0);
    expect(Number.isNaN(lastCall[0].netWeightKg)).toBe(true);

    // Re-render with the updated (NaN) line, as the parent would after
    // applying onChange, and confirm the input renders blank rather than 0.
    const updatedLines = lastCall as IntrastatDeclarationLine[];
    render(<ReviewTable lines={updatedLines} onChange={onChange} />);
    expect(
      screen.getAllByLabelText("Нето тегло в кг row 1")[1],
    ).toHaveValue("");
  });
});
