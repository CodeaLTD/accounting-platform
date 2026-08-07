import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MESSAGES } from "@/app/messages";
import { LicenseGate } from "./LicenseGate";

// Unlike LicenseGate.test.tsx (which mocks ./licenseCheck directly), this
// file only mocks the actual I/O boundaries — the Tauri HTTP/fs bridges —
// leaving licenseCheck, the API client, the offline-cache logic, and the
// platform storage layer all real. It exists to prove those pieces compose
// correctly end to end, which no single layer's unit tests can show on
// their own.
const {
  isTauriMock,
  tauriFetchMock,
  getVersionMock,
  existsMock,
  mkdirMock,
  readTextFileMock,
  writeTextFileMock,
  copyFileMock,
} = vi.hoisted(() => ({
  isTauriMock: vi.fn(() => true),
  tauriFetchMock: vi.fn(),
  getVersionMock: vi.fn(() => Promise.resolve("0.1.0")),
  existsMock: vi.fn(),
  mkdirMock: vi.fn(),
  readTextFileMock: vi.fn(),
  writeTextFileMock: vi.fn(),
  copyFileMock: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({ isTauri: isTauriMock }));
vi.mock("@tauri-apps/api/app", () => ({ getVersion: getVersionMock }));
vi.mock("@tauri-apps/plugin-http", () => ({ fetch: tauriFetchMock }));
vi.mock("@tauri-apps/plugin-fs", () => ({
  BaseDirectory: { AppData: "AppData" },
  exists: existsMock,
  mkdir: mkdirMock,
  readTextFile: readTextFileMock,
  writeTextFile: writeTextFileMock,
  copyFile: copyFileMock,
}));

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("LicenseGate integration (real licenseCheck/api/cache/platform)", () => {
  // A minimal in-memory stand-in for the real license.json file, backing
  // the exists/readTextFile/writeTextFile mocks below — the platform layer
  // really reads back what it wrote, rather than each call being stubbed
  // independently.
  let simulatedFile: string | null;

  beforeEach(() => {
    isTauriMock.mockReturnValue(true);
    simulatedFile = null;

    tauriFetchMock.mockReset();
    getVersionMock.mockResolvedValue("0.1.0");

    existsMock.mockReset();
    existsMock.mockImplementation(() => Promise.resolve(simulatedFile !== null));

    mkdirMock.mockReset();
    mkdirMock.mockResolvedValue(undefined);

    readTextFileMock.mockReset();
    readTextFileMock.mockImplementation(() => Promise.resolve(simulatedFile ?? "{}"));

    writeTextFileMock.mockReset();
    writeTextFileMock.mockImplementation((_file: string, contents: string) => {
      simulatedFile = contents;
      return Promise.resolve(undefined);
    });

    copyFileMock.mockReset();
    copyFileMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows the locked screen when the server errors, then unlocks after a successful retry", async () => {
    const user = userEvent.setup();

    // First attempt: registration hits the server's current real-world 500
    // (matches what codea-auth-server was actually returning at the time
    // this feature was built).
    tauriFetchMock.mockResolvedValueOnce(
      jsonResponse(500, { error: "Registration failed", code: "server_error" }),
    );

    render(
      <LicenseGate>
        <p>App content</p>
      </LicenseGate>,
    );

    await waitFor(() => {
      expect(
        screen.getByText(MESSAGES.license.registrationFailedMessage),
      ).toBeInTheDocument();
    });
    const deviceIdOnLockedScreen = screen.getByLabelText(
      MESSAGES.license.deviceIdLabel,
    ).textContent;
    expect(deviceIdOnLockedScreen).toBeTruthy();

    // Second attempt (retry): registration succeeds, verify reports paid.
    tauriFetchMock
      .mockResolvedValueOnce(
        jsonResponse(201, {
          deviceId: deviceIdOnLockedScreen,
          apiKey: "cda_test",
          isPaid: false,
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(200, {
          isPaid: true,
          expiresAt: "2099-01-01T00:00:00Z",
          planType: "yearly",
          serverTime: new Date().toISOString(),
          cacheMaxAgeHours: 24,
        }),
      );

    await user.click(
      screen.getByRole("button", { name: MESSAGES.license.retryButton }),
    );

    await waitFor(() => {
      expect(screen.getByText("App content")).toBeInTheDocument();
    });

    // The device ID sent on the successful retry's registration call must
    // match the one shown on the locked screen — proving the pending
    // device ID actually round-tripped through the real platform layer
    // instead of a fresh one being generated on retry.
    const retryRegisterCall = tauriFetchMock.mock.calls[1];
    const retryRegisterBody = JSON.parse(
      (retryRegisterCall[1] as RequestInit).body as string,
    );
    expect(retryRegisterBody.deviceId).toBe(deviceIdOnLockedScreen);
  });
});
