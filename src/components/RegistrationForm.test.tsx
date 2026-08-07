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

  it("shows no error message by default", () => {
    render(<RegistrationForm onSubmit={vi.fn()} />);
    expect(
      screen.queryByText(MESSAGES.registration.errorMessage),
    ).not.toBeInTheDocument();
  });

  it("shows the error message and keeps entered values when error is true", async () => {
    const user = userEvent.setup();
    render(<RegistrationForm onSubmit={vi.fn()} error />);

    expect(
      screen.getByText(MESSAGES.registration.errorMessage),
    ).toBeInTheDocument();

    const emailInput = screen.getByLabelText(MESSAGES.registration.emailLabel);
    await user.type(emailInput, "accountant@example.com");
    expect(emailInput).toHaveValue("accountant@example.com");
  });
});
