import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { licenseFetch } from "./httpClient";

const { isTauriMock, tauriFetchMock } = vi.hoisted(() => ({
  isTauriMock: vi.fn(() => false),
  tauriFetchMock: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({ isTauri: isTauriMock }));
vi.mock("@tauri-apps/plugin-http", () => ({ fetch: tauriFetchMock }));

describe("licenseFetch", () => {
  beforeEach(() => {
    isTauriMock.mockReturnValue(false);
    tauriFetchMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses the global fetch outside Tauri", async () => {
    const globalFetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("ok"));

    await licenseFetch("https://example.com", { method: "GET" });

    expect(globalFetchSpy).toHaveBeenCalledWith("https://example.com", {
      method: "GET",
    });
    expect(tauriFetchMock).not.toHaveBeenCalled();
  });

  it("uses the Tauri HTTP plugin's fetch when running in Tauri", async () => {
    isTauriMock.mockReturnValue(true);
    tauriFetchMock.mockResolvedValue(new Response("ok"));
    const globalFetchSpy = vi.spyOn(globalThis, "fetch");

    await licenseFetch("https://example.com", { method: "GET" });

    expect(tauriFetchMock).toHaveBeenCalledWith("https://example.com", {
      method: "GET",
    });
    expect(globalFetchSpy).not.toHaveBeenCalled();
  });
});
