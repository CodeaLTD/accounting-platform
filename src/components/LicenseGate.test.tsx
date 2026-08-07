import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MESSAGES } from "@/app/messages";
import { LicenseGate } from "./LicenseGate";

const { isTauriMock, runLicenseCheckMock, submitRegistrationMock } = vi.hoisted(() => ({
  isTauriMock: vi.fn(() => true),
  runLicenseCheckMock: vi.fn(),
  submitRegistrationMock: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({ isTauri: isTauriMock }));
vi.mock("./licenseCheck", () => ({
  runLicenseCheck: runLicenseCheckMock,
  submitRegistration: submitRegistrationMock,
}));

describe("LicenseGate", () => {
  beforeEach(() => {
    isTauriMock.mockReturnValue(true);
    runLicenseCheckMock.mockReset();
    submitRegistrationMock.mockReset();
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

  it("shows the registration form when no device is registered yet", async () => {
    runLicenseCheckMock.mockResolvedValue({ status: "needs_registration" });

    render(
      <LicenseGate>
        <p>App content</p>
      </LicenseGate>,
    );

    await waitFor(() => {
      expect(screen.getByText(MESSAGES.registration.title)).toBeInTheDocument();
    });
    expect(
      screen.queryByText(MESSAGES.registration.errorMessage),
    ).not.toBeInTheDocument();
  });

  it("submits the registration form, then renders children once allowed", async () => {
    const user = userEvent.setup();
    runLicenseCheckMock.mockResolvedValue({ status: "needs_registration" });
    submitRegistrationMock.mockResolvedValue({ status: "allowed" });

    render(
      <LicenseGate>
        <p>App content</p>
      </LicenseGate>,
    );

    await waitFor(() => {
      expect(screen.getByText(MESSAGES.registration.title)).toBeInTheDocument();
    });

    await user.type(
      screen.getByLabelText(MESSAGES.registration.emailLabel),
      "accountant@example.com",
    );
    await user.type(
      screen.getByLabelText(MESSAGES.registration.usernameLabel),
      "accountant",
    );
    await user.click(
      screen.getByRole("button", { name: MESSAGES.registration.submitButton }),
    );

    expect(submitRegistrationMock).toHaveBeenCalledWith({
      email: "accountant@example.com",
      username: "accountant",
    });
    await waitFor(() => {
      expect(screen.getByText("App content")).toBeInTheDocument();
    });
  });

  it("re-shows the registration form with an error when submission fails", async () => {
    const user = userEvent.setup();
    runLicenseCheckMock.mockResolvedValue({ status: "needs_registration" });
    submitRegistrationMock.mockResolvedValue({
      status: "registration_failed",
      deviceId: "A1B2-C3D4",
      reason: "network_error",
    });

    render(
      <LicenseGate>
        <p>App content</p>
      </LicenseGate>,
    );

    await waitFor(() => {
      expect(screen.getByText(MESSAGES.registration.title)).toBeInTheDocument();
    });

    await user.type(
      screen.getByLabelText(MESSAGES.registration.emailLabel),
      "accountant@example.com",
    );
    await user.type(
      screen.getByLabelText(MESSAGES.registration.usernameLabel),
      "accountant",
    );
    await user.click(
      screen.getByRole("button", { name: MESSAGES.registration.submitButton }),
    );

    await waitFor(() => {
      expect(
        screen.getByText(MESSAGES.registration.errorMessage),
      ).toBeInTheDocument();
    });
    // Still the registration form, not the generic locked screen.
    expect(screen.getByText(MESSAGES.registration.title)).toBeInTheDocument();
  });

  it("submitting again from the error state re-registers and can succeed", async () => {
    const user = userEvent.setup();
    runLicenseCheckMock.mockResolvedValue({ status: "needs_registration" });
    submitRegistrationMock
      .mockResolvedValueOnce({
        status: "registration_failed",
        deviceId: "A1B2-C3D4",
        reason: "network_error",
      })
      .mockResolvedValueOnce({ status: "allowed" });

    render(
      <LicenseGate>
        <p>App content</p>
      </LicenseGate>,
    );

    await waitFor(() => {
      expect(screen.getByText(MESSAGES.registration.title)).toBeInTheDocument();
    });

    await user.type(
      screen.getByLabelText(MESSAGES.registration.emailLabel),
      "accountant@example.com",
    );
    await user.type(
      screen.getByLabelText(MESSAGES.registration.usernameLabel),
      "accountant",
    );
    await user.click(
      screen.getByRole("button", { name: MESSAGES.registration.submitButton }),
    );

    await waitFor(() => {
      expect(
        screen.getByText(MESSAGES.registration.errorMessage),
      ).toBeInTheDocument();
    });

    await user.click(
      screen.getByRole("button", { name: MESSAGES.registration.submitButton }),
    );

    await waitFor(() => {
      expect(screen.getByText("App content")).toBeInTheDocument();
    });
    expect(submitRegistrationMock).toHaveBeenCalledTimes(2);
  });

  it("disables the submit button while a registration is in flight, preventing a double-submit", async () => {
    const user = userEvent.setup();
    runLicenseCheckMock.mockResolvedValue({ status: "needs_registration" });
    let resolveSubmit: (value: { status: "allowed" }) => void;
    submitRegistrationMock.mockReturnValue(
      new Promise((resolve) => {
        resolveSubmit = resolve;
      }),
    );

    render(
      <LicenseGate>
        <p>App content</p>
      </LicenseGate>,
    );

    await waitFor(() => {
      expect(screen.getByText(MESSAGES.registration.title)).toBeInTheDocument();
    });

    await user.type(
      screen.getByLabelText(MESSAGES.registration.emailLabel),
      "accountant@example.com",
    );
    await user.type(
      screen.getByLabelText(MESSAGES.registration.usernameLabel),
      "accountant",
    );

    const submitButton = screen.getByRole("button", {
      name: MESSAGES.registration.submitButton,
    });
    await user.click(submitButton);
    expect(submitRegistrationMock).toHaveBeenCalledTimes(1);

    await waitFor(() => {
      expect(submitButton).toBeDisabled();
    });
    // A second click while the first attempt is still in flight (the mock
    // hasn't resolved yet) must not fire a second registration — this is
    // exactly the double-registration-on-the-server scenario the pending
    // guard exists to prevent.
    await user.click(submitButton);
    expect(submitRegistrationMock).toHaveBeenCalledTimes(1);

    resolveSubmit!({ status: "allowed" });
    await waitFor(() => {
      expect(screen.getByText("App content")).toBeInTheDocument();
    });
  });
});
