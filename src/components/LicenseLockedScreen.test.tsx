import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MESSAGES } from "@/app/messages";
import { LicenseLockedScreen } from "./LicenseLockedScreen";

describe("LicenseLockedScreen", () => {
  it("shows the device id and locked message", () => {
    render(
      <LicenseLockedScreen deviceId="A1B2-C3D4" reason="unpaid" onRetry={vi.fn()} />,
    );
    expect(screen.getByText(MESSAGES.license.lockedMessage)).toBeInTheDocument();
    expect(screen.getByLabelText(MESSAGES.license.deviceIdLabel)).toHaveTextContent(
      "A1B2-C3D4",
    );
  });

  it("calls onRetry when the retry button is clicked", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(
      <LicenseLockedScreen deviceId="A1B2-C3D4" reason="unpaid" onRetry={onRetry} />,
    );

    await user.click(
      screen.getByRole("button", { name: MESSAGES.license.retryButton }),
    );

    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("shows the offline message when the reason is no_network_no_cache", () => {
    render(
      <LicenseLockedScreen
        deviceId="A1B2-C3D4"
        reason="no_network_no_cache"
        onRetry={vi.fn()}
      />,
    );
    expect(screen.getByText(MESSAGES.license.offlineMessage)).toBeInTheDocument();
  });
});
