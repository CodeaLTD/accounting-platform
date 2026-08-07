import { afterEach, describe, expect, it, vi } from "vitest";
import { registerDevice, verifyLicense } from "./api";

const { licenseFetchMock } = vi.hoisted(() => ({ licenseFetchMock: vi.fn() }));
vi.mock("./httpClient", () => ({ licenseFetch: licenseFetchMock }));

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("registerDevice", () => {
  // Reset in afterEach, not beforeEach — resetting the mock synchronously
  // right before a mockRejectedValue-configured test triggers a
  // Vitest/tinyspy quirk (observed on v4.1.10) that misreports the
  // rejection as unhandled even though it's caught by the implementation's
  // try/catch. Each test sets its own mock behavior explicitly, so
  // resetting after is equally safe and avoids the false failure.
  afterEach(() => {
    licenseFetchMock.mockReset();
    vi.restoreAllMocks();
  });

  it("returns ok with deviceId and apiKey on 201", async () => {
    licenseFetchMock.mockResolvedValue(
      jsonResponse(201, { deviceId: "A1B2", apiKey: "cda_xxx", isPaid: false }),
    );
    const result = await registerDevice({ deviceId: "A1B2" });
    expect(result).toEqual({ ok: true, deviceId: "A1B2", apiKey: "cda_xxx" });
  });

  it("sends email and username in the request body when provided", async () => {
    licenseFetchMock.mockResolvedValue(
      jsonResponse(201, { deviceId: "A1B2", apiKey: "cda_xxx", isPaid: false }),
    );
    await registerDevice({
      deviceId: "A1B2",
      email: "accountant@example.com",
      username: "accountant",
    });
    const [, init] = licenseFetchMock.mock.calls[0];
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      deviceId: "A1B2",
      email: "accountant@example.com",
      username: "accountant",
    });
  });

  it("returns 'conflict' on 409", async () => {
    licenseFetchMock.mockResolvedValue(jsonResponse(409, { error: "x" }));
    const result = await registerDevice({ deviceId: "A1B2" });
    expect(result).toEqual({ ok: false, reason: "conflict" });
  });

  it("returns 'invalid_request' on 400", async () => {
    licenseFetchMock.mockResolvedValue(jsonResponse(400, { error: "x" }));
    const result = await registerDevice({ deviceId: "" });
    expect(result).toEqual({ ok: false, reason: "invalid_request" });
  });

  it("returns 'network_error' when the request throws", async () => {
    licenseFetchMock.mockRejectedValue(new Error("offline"));
    const result = await registerDevice({ deviceId: "A1B2" });
    expect(result).toEqual({ ok: false, reason: "network_error" });
  });

  it("returns 'network_error' on an unexpected server error status", async () => {
    licenseFetchMock.mockResolvedValue(jsonResponse(500, { error: "server_error" }));
    const result = await registerDevice({ deviceId: "A1B2" });
    expect(result).toEqual({ ok: false, reason: "network_error" });
  });
});

describe("verifyLicense", () => {
  // See the comment in the registerDevice describe block above.
  afterEach(() => {
    licenseFetchMock.mockReset();
    vi.restoreAllMocks();
  });

  it("returns the license snapshot on 200", async () => {
    licenseFetchMock.mockResolvedValue(
      jsonResponse(200, {
        isPaid: true,
        expiresAt: "2026-12-31T00:00:00+00:00",
        planType: "yearly",
        serverTime: "2026-08-05T09:14:22+00:00",
        cacheMaxAgeHours: 24,
      }),
    );
    const result = await verifyLicense({ deviceId: "A1B2", apiKey: "cda_xxx" });
    expect(result).toEqual({
      ok: true,
      isPaid: true,
      expiresAt: "2026-12-31T00:00:00+00:00",
      planType: "yearly",
      cacheMaxAgeHours: 24,
    });
  });

  it("returns 'invalid_credentials' on 401", async () => {
    licenseFetchMock.mockResolvedValue(jsonResponse(401, { error: "x" }));
    const result = await verifyLicense({ deviceId: "A1B2", apiKey: "wrong" });
    expect(result).toEqual({ ok: false, reason: "invalid_credentials" });
  });

  it("returns 'revoked' on 403", async () => {
    licenseFetchMock.mockResolvedValue(jsonResponse(403, { error: "x" }));
    const result = await verifyLicense({ deviceId: "A1B2", apiKey: "cda_xxx" });
    expect(result).toEqual({ ok: false, reason: "revoked" });
  });

  it("returns 'network_error' when the request throws", async () => {
    licenseFetchMock.mockRejectedValue(new Error("offline"));
    const result = await verifyLicense({ deviceId: "A1B2", apiKey: "cda_xxx" });
    expect(result).toEqual({ ok: false, reason: "network_error" });
  });
});
