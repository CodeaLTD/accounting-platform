import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MESSAGES } from "@/app/messages";
import { FileInput } from "./FileInput";

function makeFile(name: string): File {
  return new File(["dummy"], name, { type: "application/octet-stream" });
}

describe("FileInput", () => {
  it("calls onFileSelected for a .xls file", async () => {
    const user = userEvent.setup();
    const onFileSelected = vi.fn();
    const onInvalidFileType = vi.fn();
    render(
      <FileInput
        disabled={false}
        onFileSelected={onFileSelected}
        onInvalidFileType={onInvalidFileType}
      />,
    );

    const file = makeFile("Invoice Details Inquiry.xls");
    await user.upload(screen.getByLabelText(MESSAGES.labels.fileInput), file);

    expect(onFileSelected).toHaveBeenCalledWith(file);
    expect(onInvalidFileType).not.toHaveBeenCalled();
  });

  it("shows the selected file's name once a valid file is chosen, replacing the earlier empty state", async () => {
    const user = userEvent.setup();
    render(
      <FileInput
        disabled={false}
        onFileSelected={vi.fn()}
        onInvalidFileType={vi.fn()}
      />,
    );

    expect(
      screen.queryByText("Invoice Details Inquiry.xls"),
    ).not.toBeInTheDocument();

    const file = makeFile("Invoice Details Inquiry.xls");
    await user.upload(screen.getByLabelText(MESSAGES.labels.fileInput), file);

    expect(
      screen.getByText("Invoice Details Inquiry.xls"),
    ).toBeInTheDocument();
  });

  it("calls onInvalidFileType for a non-Excel file", async () => {
    const onFileSelected = vi.fn();
    const onInvalidFileType = vi.fn();
    render(
      <FileInput
        disabled={false}
        onFileSelected={onFileSelected}
        onInvalidFileType={onInvalidFileType}
      />,
    );

    const file = makeFile("notes.txt");
    const input = screen.getByLabelText(MESSAGES.labels.fileInput);
    fireEvent.change(input, { target: { files: [file] } });

    expect(onInvalidFileType).toHaveBeenCalled();
    expect(onFileSelected).not.toHaveBeenCalled();
  });

  it("is disabled when disabled=true", () => {
    render(
      <FileInput
        disabled={true}
        onFileSelected={vi.fn()}
        onInvalidFileType={vi.fn()}
      />,
    );
    expect(screen.getByLabelText(MESSAGES.labels.fileInput)).toBeDisabled();
  });
});
