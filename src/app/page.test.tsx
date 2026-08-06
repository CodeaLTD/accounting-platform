import { readFileSync } from "node:fs";
import path from "node:path";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as XLSX from "xlsx";
import { MESSAGES } from "./messages";
import Home from "./page";

// jsdom's File/Blob implementation doesn't implement arrayBuffer() (as of
// jsdom 26 in this project's test setup), but page.tsx calls
// `file.arrayBuffer()` — a standard, real-browser-supported API. Polyfill it
// here via FileReader (same technique already used in
// src/components/DownloadButton.test.tsx) so the app code under test can run
// unmodified; this is a test-environment gap, not an application bug.
if (typeof Blob.prototype.arrayBuffer !== "function") {
  Blob.prototype.arrayBuffer = function (this: Blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(this);
    });
  };
}

function loadSampleFile(): File {
  const buffer = readFileSync(
    path.join(process.cwd(), "Invoice Details Inquiry.xls"),
  );
  return new File([buffer], "Invoice Details Inquiry.xls", {
    type: "application/vnd.ms-excel",
  });
}

// Real header row from "Invoice Details Inquiry.xls" — used to build minimal
// synthetic workbooks, so the error-path and search/add-flow tests don't
// depend on hand-maintained second copies of a real invoice file.
const SOURCE_HEADER = [
  "Customer Code",
  "Document type",
  "Order number",
  "Customer order number",
  "Subline number",
  "Invoice Number",
  "Invoice line",
  "Invoice Date",
  "Invoice due date",
  "Delivery document",
  "Delivery document date",
  "Part Number",
  "Part description",
  "Carrier Code",
  "Carrier Name",
  "Manufactured code",
  "Country of Origin",
  "Supersessions ",
  "Warehouse (shipping)",
  "Unit net weight",
  "Invoiced quantity",
  "Unit list price",
  "Unit net price",
  "Total invoice VAT",
  "Total invoice amount",
  "Surcharges: the sum of all surcharges for each line",
  "Cur",
  "Case Number",
  "Custom Code",
];

function buildXlsxFile(rows: (string | number)[][], fileName: string): File {
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Sheet1");
  const bytes = XLSX.write(workbook, {
    type: "array",
    bookType: "xlsx",
  }) as Uint8Array<ArrayBuffer>;
  return new File([bytes], fileName, {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

function buildSourceRow(overrides: {
  invoiceNumber: string;
  customsCode: string;
  unitNetWeightKg: number;
  invoicedQuantity: number;
  unitNetPrice: number;
}): (string | number)[] {
  return [
    "CUST1",
    "INV",
    "ORD1",
    "",
    "1",
    overrides.invoiceNumber,
    "1",
    "2026-01-01",
    "2026-01-15",
    "",
    "",
    "PART1",
    "Test part",
    "",
    "",
    "",
    "DE",
    "",
    "",
    overrides.unitNetWeightKg,
    overrides.invoicedQuantity,
    overrides.unitNetPrice,
    overrides.unitNetPrice,
    0,
    0,
    0,
    "EUR",
    "",
    overrides.customsCode,
  ];
}

// Three rows across two invoice numbers: two line items under "INV-1"
// (distinct commodity codes, since the same invoice can list several
// items) and one under "INV-2" — used to test search filtering and
// "add all" respecting the active filter.
function buildMultiInvoiceFile(): File {
  const rows: (string | number)[][] = [
    SOURCE_HEADER,
    buildSourceRow({
      invoiceNumber: "INV-1",
      customsCode: "90011000 - 0000",
      unitNetWeightKg: 1,
      invoicedQuantity: 2,
      unitNetPrice: 10,
    }),
    buildSourceRow({
      invoiceNumber: "INV-1",
      customsCode: "90012000 - 0000",
      unitNetWeightKg: 1,
      invoicedQuantity: 1,
      unitNetPrice: 5,
    }),
    buildSourceRow({
      invoiceNumber: "INV-2",
      customsCode: "90013000 - 0000",
      unitNetWeightKg: 3,
      invoicedQuantity: 1,
      unitNetPrice: 100,
    }),
  ];
  return buildXlsxFile(rows, "multi-invoice.xlsx");
}

// A second, distinct file (different commodity codes/invoice numbers from
// buildMultiInvoiceFile) used to test that the NAP table accumulates rows
// from two separate uploads rather than being replaced by the second one.
function buildSecondInvoiceFile(): File {
  const rows: (string | number)[][] = [
    SOURCE_HEADER,
    buildSourceRow({
      invoiceNumber: "INV-9",
      customsCode: "90019000 - 0000",
      unitNetWeightKg: 2,
      invoicedQuantity: 3,
      unitNetPrice: 20,
    }),
  ];
  return buildXlsxFile(rows, "second-invoice.xlsx");
}

async function selectOption(
  user: ReturnType<typeof userEvent.setup>,
  triggerLabel: string,
  optionName: string,
) {
  await user.click(screen.getByLabelText(triggerLabel));
  await user.click(await screen.findByRole("option", { name: optionName }));
}

async function fillConfig(user: ReturnType<typeof userEvent.setup>) {
  await selectOption(user, MESSAGES.labels.partnerCountry, "IT");
  await selectOption(user, MESSAGES.labels.modeOfTransport, "3");
  await selectOption(user, MESSAGES.labels.regionOfConsumption, "Стара Загора");
}

describe("Home page", () => {
  let capturedBlob: Blob | null;

  beforeEach(() => {
    capturedBlob = null;
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    URL.createObjectURL = vi.fn((blob: Blob) => {
      capturedBlob = blob;
      return "blob:mock-url";
    });
    URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("disables the file input until all config fields are filled in", () => {
    render(<Home />);
    expect(screen.getByLabelText(MESSAGES.labels.fileInput)).toBeDisabled();
  });

  it("hides the search bar until a file has been uploaded", async () => {
    const user = userEvent.setup();
    render(<Home />);

    expect(
      screen.queryByLabelText(MESSAGES.labels.searchInput),
    ).not.toBeInTheDocument();

    await fillConfig(user);
    expect(
      screen.queryByLabelText(MESSAGES.labels.searchInput),
    ).not.toBeInTheDocument();

    await user.upload(
      screen.getByLabelText(MESSAGES.labels.fileInput),
      loadSampleFile(),
    );

    await waitFor(() => {
      expect(
        screen.getByLabelText(MESSAGES.labels.searchInput),
      ).toBeInTheDocument();
    });
  });

  it("shows a plain-language error for a non-Excel file", async () => {
    const user = userEvent.setup({ applyAccept: false });
    render(<Home />);
    await fillConfig(user);

    const badFile = new File(["not excel"], "notes.txt", {
      type: "text/plain",
    });
    await user.upload(
      screen.getByLabelText(MESSAGES.labels.fileInput),
      badFile,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      MESSAGES.errors.invalidFileType,
    );
  });

  it("shows a plain-language error for a file with no data rows", async () => {
    const user = userEvent.setup();
    render(<Home />);
    await fillConfig(user);

    const emptyFile = buildXlsxFile([SOURCE_HEADER], "empty.xlsx");
    await user.upload(
      screen.getByLabelText(MESSAGES.labels.fileInput),
      emptyFile,
    );

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        MESSAGES.errors.emptyFile,
      );
    });
  });

  it("shows a plain-language error for a file with the wrong columns", async () => {
    const user = userEvent.setup();
    render(<Home />);
    await fillConfig(user);

    const malformedFile = buildXlsxFile(
      [
        ["Not", "The", "Right", "Columns"],
        ["a", "b", "c", "d"],
      ],
      "malformed.xlsx",
    );
    await user.upload(
      screen.getByLabelText(MESSAGES.labels.fileInput),
      malformedFile,
    );

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        MESSAGES.errors.unrecognizedStructure,
      );
    });
  });

  it("adds a single row via the plus button, toggles to the NAP view, and downloads only that row", async () => {
    const user = userEvent.setup();
    render(<Home />);
    await fillConfig(user);

    await user.upload(
      screen.getByLabelText(MESSAGES.labels.fileInput),
      loadSampleFile(),
    );

    await waitFor(() => {
      expect(screen.getByLabelText("Код на стоката row 1")).toHaveValue(
        "82084000",
      );
    });

    await user.click(
      screen.getByRole("button", {
        name: `${MESSAGES.labels.addRowButton} 1`,
      }),
    );

    // Row 1 moved out of the working table — what's now labeled "row 1" is
    // a different line, proving the added row was removed from this view.
    expect(screen.getByLabelText("Код на стоката row 1")).not.toHaveValue(
      "82084000",
    );

    await user.click(
      screen.getByRole("button", {
        name: MESSAGES.labels.viewFinalTableButton,
      }),
    );

    expect(screen.getByLabelText("Код на стоката row 1")).toHaveValue(
      "82084000",
    );
    expect(
      screen.queryByLabelText(`${MESSAGES.labels.invoiceNumberColumn} row 1`),
    ).not.toBeInTheDocument();

    const downloadButton = screen.getByRole("button", {
      name: MESSAGES.labels.downloadButton,
    });
    expect(downloadButton).toBeEnabled();

    await user.click(downloadButton);

    await waitFor(() => expect(capturedBlob).not.toBeNull());
    const arrayBuffer = await capturedBlob!.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    const workbook = XLSX.read(bytes, { type: "array" });
    const sheetName = workbook.SheetNames[0];
    const rows = XLSX.utils.sheet_to_json<(string | number)[]>(
      workbook.Sheets[sheetName],
      { header: 1, defval: "" },
    );
    // Header + 1 data row + totals row = 3, proving only the added row
    // (not the other 13 mapped rows) made it into the download.
    expect(rows).toHaveLength(3);
    expect(rows[1][1]).toBe("82084000");
  });

  it("filters the working table by invoice number and 'add all' only adds the visible rows", async () => {
    const user = userEvent.setup();
    render(<Home />);
    await fillConfig(user);

    await user.upload(
      screen.getByLabelText(MESSAGES.labels.fileInput),
      buildMultiInvoiceFile(),
    );

    await waitFor(() => {
      expect(screen.getByLabelText("Код на стоката row 1")).toHaveValue(
        "90011000",
      );
    });
    expect(screen.getByLabelText("Код на стоката row 3")).toHaveValue(
      "90013000",
    );

    await user.type(
      screen.getByLabelText(MESSAGES.labels.searchInput),
      "INV-1",
    );

    expect(screen.getByLabelText("Код на стоката row 1")).toHaveValue(
      "90011000",
    );
    expect(screen.getByLabelText("Код на стоката row 2")).toHaveValue(
      "90012000",
    );
    expect(
      screen.queryByLabelText("Код на стоката row 3"),
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: MESSAGES.labels.addAllButton }),
    );

    await waitFor(() => {
      expect(
        screen.queryByLabelText("Код на стоката row 1"),
      ).not.toBeInTheDocument();
    });

    await user.clear(screen.getByLabelText(MESSAGES.labels.searchInput));
    expect(screen.getByLabelText("Код на стоката row 1")).toHaveValue(
      "90013000",
    );

    await user.click(
      screen.getByRole("button", {
        name: MESSAGES.labels.viewFinalTableButton,
      }),
    );

    expect(screen.getByLabelText("Код на стоката row 1")).toHaveValue(
      "90011000",
    );
    expect(screen.getByLabelText("Код на стоката row 2")).toHaveValue(
      "90012000",
    );
    expect(
      screen.queryByLabelText("Код на стоката row 3"),
    ).not.toBeInTheDocument();
  });

  it("restores a removed NAP row back to the working table", async () => {
    const user = userEvent.setup();
    render(<Home />);
    await fillConfig(user);

    await user.upload(
      screen.getByLabelText(MESSAGES.labels.fileInput),
      loadSampleFile(),
    );
    await waitFor(() => {
      expect(screen.getByLabelText("Код на стоката row 1")).toHaveValue(
        "82084000",
      );
    });

    await user.click(
      screen.getByRole("button", {
        name: `${MESSAGES.labels.addRowButton} 1`,
      }),
    );
    await user.click(
      screen.getByRole("button", {
        name: MESSAGES.labels.viewFinalTableButton,
      }),
    );
    expect(screen.getByLabelText("Код на стоката row 1")).toHaveValue(
      "82084000",
    );

    await user.click(
      screen.getByRole("button", {
        name: `${MESSAGES.labels.removeRowButton} 1`,
      }),
    );

    expect(
      screen.getByRole("button", { name: MESSAGES.labels.downloadButton }),
    ).toBeDisabled();

    await user.click(
      screen.getByRole("button", {
        name: MESSAGES.labels.viewWorkingTableButton,
      }),
    );

    expect(screen.getByLabelText("Код на стоката row 1")).toHaveValue(
      "82084000",
    );
  });

  it("restores every NAP row back to the working table via 'remove all'", async () => {
    const user = userEvent.setup();
    render(<Home />);
    await fillConfig(user);

    await user.upload(
      screen.getByLabelText(MESSAGES.labels.fileInput),
      buildMultiInvoiceFile(),
    );
    await waitFor(() => {
      expect(screen.getByLabelText("Код на стоката row 1")).toHaveValue(
        "90011000",
      );
    });

    await user.click(
      screen.getByRole("button", { name: MESSAGES.labels.addAllButton }),
    );

    await user.click(
      screen.getByRole("button", {
        name: MESSAGES.labels.viewFinalTableButton,
      }),
    );
    expect(screen.getByLabelText("Код на стоката row 1")).toHaveValue(
      "90011000",
    );

    const removeAllButton = screen.getByRole("button", {
      name: MESSAGES.labels.removeAllButton,
    });
    expect(removeAllButton).toBeEnabled();
    await user.click(removeAllButton);

    expect(
      screen.queryByLabelText("Код на стоката row 1"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: MESSAGES.labels.downloadButton }),
    ).toBeDisabled();
    expect(removeAllButton).toBeDisabled();

    await user.click(
      screen.getByRole("button", {
        name: MESSAGES.labels.viewWorkingTableButton,
      }),
    );

    expect(screen.getByLabelText("Код на стоката row 1")).toHaveValue(
      "90011000",
    );
    expect(screen.getByLabelText("Код на стоката row 3")).toHaveValue(
      "90013000",
    );
  });

  it("asks for confirmation before replacing unadded working rows with a new upload", async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, "confirm");
    render(<Home />);
    await fillConfig(user);

    await user.upload(
      screen.getByLabelText(MESSAGES.labels.fileInput),
      loadSampleFile(),
    );
    await waitFor(() => {
      expect(screen.getByLabelText("Код на стоката row 1")).toHaveValue(
        "82084000",
      );
    });

    confirmSpy.mockReturnValueOnce(false);
    await user.upload(
      screen.getByLabelText(MESSAGES.labels.fileInput),
      buildMultiInvoiceFile(),
    );
    expect(confirmSpy).toHaveBeenCalledWith(
      MESSAGES.confirmations.discardUnaddedRows(14),
    );
    expect(screen.getByLabelText("Код на стоката row 1")).toHaveValue(
      "82084000",
    );

    confirmSpy.mockReturnValueOnce(true);
    await user.upload(
      screen.getByLabelText(MESSAGES.labels.fileInput),
      buildMultiInvoiceFile(),
    );
    await waitFor(() => {
      expect(screen.getByLabelText("Код на стоката row 1")).toHaveValue(
        "90011000",
      );
    });
    expect(screen.getByLabelText("Код на стоката row 3")).toHaveValue(
      "90013000",
    );
  });

  it("disables the download button and shows a message while a NAP row has a blank numeric cell, then re-enables it once fixed", async () => {
    const user = userEvent.setup();
    render(<Home />);
    await fillConfig(user);

    await user.upload(
      screen.getByLabelText(MESSAGES.labels.fileInput),
      loadSampleFile(),
    );
    await waitFor(() => {
      expect(screen.getByLabelText("Код на стоката row 1")).toHaveValue(
        "82084000",
      );
    });

    await user.click(
      screen.getByRole("button", {
        name: `${MESSAGES.labels.addRowButton} 1`,
      }),
    );
    await user.click(
      screen.getByRole("button", {
        name: MESSAGES.labels.viewFinalTableButton,
      }),
    );

    const downloadButton = screen.getByRole("button", {
      name: MESSAGES.labels.downloadButton,
    });
    expect(downloadButton).toBeEnabled();
    expect(
      screen.queryByText(MESSAGES.errors.invalidNumericValue),
    ).not.toBeInTheDocument();

    const netWeightInput = screen.getByLabelText("Нето тегло в кг row 1");
    await user.clear(netWeightInput);

    expect(downloadButton).toBeDisabled();
    expect(
      screen.getByText(MESSAGES.errors.invalidNumericValue),
    ).toBeInTheDocument();

    await user.type(netWeightInput, "20");

    expect(downloadButton).toBeEnabled();
    expect(
      screen.queryByText(MESSAGES.errors.invalidNumericValue),
    ).not.toBeInTheDocument();
  });

  it("does not show the search bar while viewing the NAP table", async () => {
    const user = userEvent.setup();
    render(<Home />);
    await fillConfig(user);

    await user.upload(
      screen.getByLabelText(MESSAGES.labels.fileInput),
      loadSampleFile(),
    );
    await waitFor(() => {
      expect(screen.getByLabelText("Код на стоката row 1")).toHaveValue(
        "82084000",
      );
    });

    await user.click(
      screen.getByRole("button", {
        name: MESSAGES.labels.viewFinalTableButton,
      }),
    );

    expect(
      screen.queryByLabelText(MESSAGES.labels.searchInput),
    ).not.toBeInTheDocument();
  });

  it("preserves the working table when an invalid file type is selected afterwards", async () => {
    const user = userEvent.setup({ applyAccept: false });
    render(<Home />);
    await fillConfig(user);

    await user.upload(
      screen.getByLabelText(MESSAGES.labels.fileInput),
      buildMultiInvoiceFile(),
    );
    await waitFor(() => {
      expect(screen.getByLabelText("Код на стоката row 1")).toHaveValue(
        "90011000",
      );
    });

    const badFile = new File(["not excel"], "notes.txt", {
      type: "text/plain",
    });
    await user.upload(
      screen.getByLabelText(MESSAGES.labels.fileInput),
      badFile,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      MESSAGES.errors.invalidFileType,
    );
    // The working table rows from the earlier valid upload must still be
    // there, unchanged — an invalid file selection must not destroy
    // unrecoverable working-table state (manual edits, restored rows).
    expect(screen.getByLabelText("Код на стоката row 1")).toHaveValue(
      "90011000",
    );
    expect(screen.getByLabelText("Код на стоката row 2")).toHaveValue(
      "90012000",
    );
    expect(screen.getByLabelText("Код на стоката row 3")).toHaveValue(
      "90013000",
    );
  });

  it("accumulates rows from two separate uploads into the NAP table", async () => {
    const user = userEvent.setup();
    render(<Home />);
    await fillConfig(user);

    await user.upload(
      screen.getByLabelText(MESSAGES.labels.fileInput),
      buildMultiInvoiceFile(),
    );
    await waitFor(() => {
      expect(screen.getByLabelText("Код на стоката row 1")).toHaveValue(
        "90011000",
      );
    });

    await user.click(
      screen.getByRole("button", { name: MESSAGES.labels.addAllButton }),
    );
    await waitFor(() => {
      expect(
        screen.queryByLabelText("Код на стоката row 1"),
      ).not.toBeInTheDocument();
    });

    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    await user.upload(
      screen.getByLabelText(MESSAGES.labels.fileInput),
      buildSecondInvoiceFile(),
    );
    expect(confirmSpy).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.getByLabelText("Код на стоката row 1")).toHaveValue(
        "90019000",
      );
    });

    await user.click(
      screen.getByRole("button", { name: MESSAGES.labels.addAllButton }),
    );
    await waitFor(() => {
      expect(
        screen.queryByLabelText("Код на стоката row 1"),
      ).not.toBeInTheDocument();
    });

    await user.click(
      screen.getByRole("button", {
        name: MESSAGES.labels.viewFinalTableButton,
      }),
    );

    // Rows from both uploads must coexist in the accumulated NAP table.
    const finalCodes = [
      screen.getByLabelText("Код на стоката row 1"),
      screen.getByLabelText("Код на стоката row 2"),
      screen.getByLabelText("Код на стоката row 3"),
      screen.getByLabelText("Код на стоката row 4"),
    ].map((el) => (el as HTMLInputElement).value);
    expect(finalCodes).toEqual(
      expect.arrayContaining(["90011000", "90012000", "90013000", "90019000"]),
    );
    expect(
      screen.queryByLabelText("Код на стоката row 5"),
    ).not.toBeInTheDocument();
  });

  it("shows zero working rows and disables 'add all' when a search matches nothing", async () => {
    const user = userEvent.setup();
    render(<Home />);
    await fillConfig(user);

    await user.upload(
      screen.getByLabelText(MESSAGES.labels.fileInput),
      buildMultiInvoiceFile(),
    );
    await waitFor(() => {
      expect(screen.getByLabelText("Код на стоката row 1")).toHaveValue(
        "90011000",
      );
    });

    await user.type(
      screen.getByLabelText(MESSAGES.labels.searchInput),
      "NO-SUCH-INVOICE",
    );

    expect(
      screen.queryByLabelText("Код на стоката row 1"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: MESSAGES.labels.addAllButton }),
    ).toBeDisabled();
  });

  it("moves every working row to the NAP table when 'add all' is clicked with no active search filter", async () => {
    const user = userEvent.setup();
    render(<Home />);
    await fillConfig(user);

    await user.upload(
      screen.getByLabelText(MESSAGES.labels.fileInput),
      buildMultiInvoiceFile(),
    );
    await waitFor(() => {
      expect(screen.getByLabelText("Код на стоката row 1")).toHaveValue(
        "90011000",
      );
    });

    await user.click(
      screen.getByRole("button", { name: MESSAGES.labels.addAllButton }),
    );

    await waitFor(() => {
      expect(
        screen.queryByLabelText("Код на стоката row 1"),
      ).not.toBeInTheDocument();
    });

    await user.click(
      screen.getByRole("button", {
        name: MESSAGES.labels.viewFinalTableButton,
      }),
    );

    expect(screen.getByLabelText("Код на стоката row 1")).toHaveValue(
      "90011000",
    );
    expect(screen.getByLabelText("Код на стоката row 2")).toHaveValue(
      "90012000",
    );
    expect(screen.getByLabelText("Код на стоката row 3")).toHaveValue(
      "90013000",
    );
    expect(
      screen.queryByLabelText("Код на стоката row 4"),
    ).not.toBeInTheDocument();
  });
});
