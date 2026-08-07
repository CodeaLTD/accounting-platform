import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MESSAGES } from "@/app/messages";
import { LicenseGate } from "./LicenseGate";

const { isTauriMock, runLicenseCheckMock } = vi.hoisted(() => ({
  isTauriMock: vi.fn(() => true),
  runLicenseCheckMock: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({ isTauri: isTauriMock }));
vi.mock("./licenseCheck", () => ({ runLicenseCheck: runLicenseCheckMock }));

describe("LicenseGate", () => {
  beforeEach(() => {
    isTauriMock.mockReturnValue(true);
    runLicenseCheckMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows checking briefly, then renders children outside Tauri without calling runLicenseCheck", async () => {
    isTauriMock.mockReturnValue(false);
    render(
      <LicenseGate>
        <p>App content</p>
      </LicenseGate>,
    );

    // The very first render (matching what a server/prerender pass would
    // produce) is always "checking", regardless of isTauri() — see the
    // comment in LicenseGate.tsx on why that value can't be read
    // synchronously during render without risking a hydration mismatch.
    expect(screen.getByText(MESSAGES.license.checkingMessage)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("App content")).toBeInTheDocument();
    });
    expect(runLicenseCheckMock).not.toHaveBeenCalled();
  });

  it("shows the checking message, then renders children once allowed", async () => {
    let resolveCheck: (value: { status: "allowed" }) => void;
    runLicenseCheckMock.mockReturnValue(
      new Promise((resolve) => {
        resolveCheck = resolve;
      }),
    );

    render(
      <LicenseGate>
        <p>App content</p>
      </LicenseGate>,
    );

    expect(screen.getByText(MESSAGES.license.checkingMessage)).toBeInTheDocument();

    resolveCheck!({ status: "allowed" });
    await waitFor(() => {
      expect(screen.getByText("App content")).toBeInTheDocument();
    });
  });

  it("shows the locked screen with the device id when blocked", async () => {
    runLicenseCheckMock.mockResolvedValue({
      status: "blocked",
      deviceId: "A1B2-C3D4",
      reason: "unpaid",
    });

    render(
      <LicenseGate>
        <p>App content</p>
      </LicenseGate>,
    );

    await waitFor(() => {
      expect(screen.getByText(MESSAGES.license.lockedMessage)).toBeInTheDocument();
    });
    expect(screen.getByLabelText(MESSAGES.license.deviceIdLabel)).toHaveTextContent(
      "A1B2-C3D4",
    );
    expect(screen.queryByText("App content")).not.toBeInTheDocument();
  });

  it("re-runs the check when the retry button is clicked, showing checking again first", async () => {
    const user = userEvent.setup();
    let resolveRetryCheck: (value: { status: "allowed" }) => void;
    runLicenseCheckMock
      .mockResolvedValueOnce({
        status: "blocked",
        deviceId: "A1B2-C3D4",
        reason: "unpaid",
      })
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveRetryCheck = resolve;
        }),
      );

    render(
      <LicenseGate>
        <p>App content</p>
      </LicenseGate>,
    );

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: MESSAGES.license.retryButton }),
      ).toBeInTheDocument();
    });

    await user.click(
      screen.getByRole("button", { name: MESSAGES.license.retryButton }),
    );

    // Retry's synchronous setState back to "checking" must fire before the
    // re-run's result comes back — asserted here so a regression that drops
    // that setState (e.g. collapsing retry back into runCheck) gets caught,
    // instead of only checking the eventual allowed/blocked outcome.
    expect(screen.getByText(MESSAGES.license.checkingMessage)).toBeInTheDocument();

    resolveRetryCheck!({ status: "allowed" });
    await waitFor(() => {
      expect(screen.getByText("App content")).toBeInTheDocument();
    });
    expect(runLicenseCheckMock).toHaveBeenCalledTimes(2);
  });
});
