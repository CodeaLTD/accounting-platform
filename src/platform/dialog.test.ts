import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { confirmDialog } from "./dialog";

const { isTauriMock, confirmTauriMock } = vi.hoisted(() => ({
  isTauriMock: vi.fn(() => false),
  confirmTauriMock: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({ isTauri: isTauriMock }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ confirm: confirmTauriMock }));

describe("confirmDialog", () => {
  beforeEach(() => {
    isTauriMock.mockReturnValue(false);
    confirmTauriMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses window.confirm in the browser", async () => {
    const spy = vi.spyOn(window, "confirm").mockReturnValue(true);

    const result = await confirmDialog("Are you sure?");

    expect(spy).toHaveBeenCalledWith("Are you sure?");
    expect(confirmTauriMock).not.toHaveBeenCalled();
    expect(result).toBe(true);
  });

  it("uses the Tauri dialog plugin's confirm when running in Tauri", async () => {
    isTauriMock.mockReturnValue(true);
    confirmTauriMock.mockResolvedValue(false);
    const spy = vi.spyOn(window, "confirm");

    const result = await confirmDialog("Are you sure?");

    expect(confirmTauriMock).toHaveBeenCalledWith("Are you sure?");
    expect(spy).not.toHaveBeenCalled();
    expect(result).toBe(false);
  });
});
