import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as XLSX from "xlsx";
import { MESSAGES } from "@/app/messages";
import type { IntrastatDeclarationLine } from "@/core/types";
import { DownloadButton } from "./DownloadButton";

function readBlobAsArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

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

describe("DownloadButton", () => {
  let capturedBlob: Blob | null;

  beforeEach(() => {
    capturedBlob = null;
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(
      () => {},
    );
    URL.createObjectURL = vi.fn((blob: Blob) => {
      capturedBlob = blob;
      return "blob:mock-url";
    });
    URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("builds an xlsx blob containing the given lines when clicked", async () => {
    const user = userEvent.setup();
    render(<DownloadButton lines={sampleLines} />);

    await user.click(
      screen.getByRole("button", { name: MESSAGES.labels.downloadButton }),
    );

    await waitFor(() => expect(capturedBlob).not.toBeNull());
    const arrayBuffer = await readBlobAsArrayBuffer(capturedBlob!);
    const bytes = new Uint8Array(arrayBuffer);
    const workbook = XLSX.read(bytes, { type: "array" });
    const rows = XLSX.utils.sheet_to_json<(string | number)[]>(
      workbook.Sheets["Sheet1"],
      { header: 1, defval: "" },
    );
    expect(rows[1][1]).toBe("82084000");
  });

  it("is disabled when there are no lines", () => {
    render(<DownloadButton lines={[]} />);
    expect(
      screen.getByRole("button", { name: MESSAGES.labels.downloadButton }),
    ).toBeDisabled();
  });
});
