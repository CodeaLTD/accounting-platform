import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MESSAGES } from "@/app/messages";
import {
  ConfigForm,
  EMPTY_CONFIG_FORM_VALUE,
  isConfigComplete,
} from "./ConfigForm";

describe("isConfigComplete", () => {
  it("is false when any field is empty", () => {
    expect(isConfigComplete(EMPTY_CONFIG_FORM_VALUE)).toBe(false);
    expect(
      isConfigComplete({
        partnerCountry: "IT",
        modeOfTransport: "3",
        regionOfConsumption: "",
      }),
    ).toBe(false);
  });

  it("is true when all three fields are filled in", () => {
    expect(
      isConfigComplete({
        partnerCountry: "IT",
        modeOfTransport: "3",
        regionOfConsumption: "SZR",
      }),
    ).toBe(true);
  });
});

describe("ConfigForm", () => {
  it("reports the selected partner country via onChange", async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    render(
      <ConfigForm value={EMPTY_CONFIG_FORM_VALUE} onChange={handleChange} />,
    );

    await user.selectOptions(
      screen.getByLabelText(MESSAGES.labels.partnerCountry),
      "IT",
    );

    expect(handleChange).toHaveBeenCalledWith({
      ...EMPTY_CONFIG_FORM_VALUE,
      partnerCountry: "IT",
    });
  });

  it("reports the selected region of consumption via onChange", async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    render(
      <ConfigForm value={EMPTY_CONFIG_FORM_VALUE} onChange={handleChange} />,
    );

    await user.selectOptions(
      screen.getByLabelText(MESSAGES.labels.regionOfConsumption),
      "SZR",
    );

    expect(handleChange).toHaveBeenCalledWith({
      ...EMPTY_CONFIG_FORM_VALUE,
      regionOfConsumption: "SZR",
    });
  });
});
