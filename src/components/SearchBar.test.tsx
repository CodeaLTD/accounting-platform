import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MESSAGES } from "@/app/messages";
import { SearchBar } from "./SearchBar";

describe("SearchBar", () => {
  it("renders with the given value", () => {
    render(<SearchBar value="INV-1" onChange={vi.fn()} />);
    expect(screen.getByLabelText(MESSAGES.labels.searchInput)).toHaveValue(
      "INV-1",
    );
  });

  it("calls onChange with the typed value", () => {
    const onChange = vi.fn();
    render(<SearchBar value="" onChange={onChange} />);
    fireEvent.change(screen.getByLabelText(MESSAGES.labels.searchInput), {
      target: { value: "INV-2" },
    });
    expect(onChange).toHaveBeenCalledWith("INV-2");
  });
});
