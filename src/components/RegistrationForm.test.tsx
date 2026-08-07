import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MESSAGES } from "@/app/messages";
import { RegistrationForm } from "./RegistrationForm";

describe("RegistrationForm", () => {
  it("submits the entered email and username", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<RegistrationForm onSubmit={onSubmit} />);

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

    expect(onSubmit).toHaveBeenCalledWith({
      email: "accountant@example.com",
      username: "accountant",
    });
  });

  it("does not submit when the required fields are empty", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<RegistrationForm onSubmit={onSubmit} />);

    await user.click(
      screen.getByRole("button", { name: MESSAGES.registration.submitButton }),
    );

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("does not submit when the username is only whitespace", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<RegistrationForm onSubmit={onSubmit} />);

    await user.type(
      screen.getByLabelText(MESSAGES.registration.emailLabel),
      "accountant@example.com",
    );
    await user.type(screen.getByLabelText(MESSAGES.registration.usernameLabel), "   ");
    await user.click(
      screen.getByRole("button", { name: MESSAGES.registration.submitButton }),
    );

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("trims surrounding whitespace from submitted values", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<RegistrationForm onSubmit={onSubmit} />);

    await user.type(
      screen.getByLabelText(MESSAGES.registration.emailLabel),
      "  accountant@example.com  ",
    );
    await user.type(
      screen.getByLabelText(MESSAGES.registration.usernameLabel),
      "  accountant  ",
    );
    await user.click(
      screen.getByRole("button", { name: MESSAGES.registration.submitButton }),
    );

    expect(onSubmit).toHaveBeenCalledWith({
      email: "accountant@example.com",
      username: "accountant",
    });
  });

  it("shows no error message by default", () => {
    render(<RegistrationForm onSubmit={vi.fn()} />);
    expect(
      screen.queryByText(MESSAGES.registration.errorMessage),
    ).not.toBeInTheDocument();
  });

  it("shows the generic error message and device id for a network_error, and keeps entered values", async () => {
    const user = userEvent.setup();
    render(
      <RegistrationForm
        onSubmit={vi.fn()}
        error={{ deviceId: "A1B2-C3D4", reason: "network_error" }}
      />,
    );

    expect(
      screen.getByText(MESSAGES.registration.errorMessage),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(MESSAGES.license.deviceIdLabel)).toHaveTextContent(
      "A1B2-C3D4",
    );

    const emailInput = screen.getByLabelText(MESSAGES.registration.emailLabel);
    await user.type(emailInput, "accountant@example.com");
    expect(emailInput).toHaveValue("accountant@example.com");
  });

  it("shows the conflict-specific message when the reason is 'conflict'", () => {
    render(
      <RegistrationForm
        onSubmit={vi.fn()}
        error={{ deviceId: "A1B2-C3D4", reason: "conflict" }}
      />,
    );

    expect(
      screen.getByText(MESSAGES.registration.conflictMessage),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(MESSAGES.registration.errorMessage),
    ).not.toBeInTheDocument();
  });

  it("disables the submit button while pending", () => {
    render(<RegistrationForm onSubmit={vi.fn()} pending />);
    expect(
      screen.getByRole("button", { name: MESSAGES.registration.submitButton }),
    ).toBeDisabled();
  });

  it("does not call onSubmit a second time while a submission is pending", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const { rerender } = render(
      <RegistrationForm onSubmit={onSubmit} pending={false} />,
    );

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
    expect(onSubmit).toHaveBeenCalledTimes(1);

    // Simulate LicenseGate flipping to pending once the submission starts.
    rerender(<RegistrationForm onSubmit={onSubmit} pending />);

    await user.click(
      screen.getByRole("button", { name: MESSAGES.registration.submitButton }),
    );
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});
