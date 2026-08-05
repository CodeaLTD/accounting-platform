import request from "supertest";
import { describe, expect, it } from "vitest";
import { createServer } from "../src/server";
import { generateTestKeyPair } from "./testKeys";

describe("createServer", () => {
  it("responds to a health check", async () => {
    const { privateKeyPem } = generateTestKeyPair();
    const app = createServer({ dbPath: ":memory:", privateKeyPem });

    const response = await request(app).get("/health");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });
  });

  it("returns 403 for /activate with an unknown license key", async () => {
    const { privateKeyPem } = generateTestKeyPair();
    const app = createServer({ dbPath: ":memory:", privateKeyPem });

    const response = await request(app)
      .post("/activate")
      .send({ licenseKey: "LIC-NOPE", deviceId: "device-a" });

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ ok: false, reason: "not_found" });
  });
});
