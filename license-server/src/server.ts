import express from "express";
import { openDb } from "./db.js";
import { handleActivate } from "./routes/activate.js";
import { handleRefresh } from "./routes/refresh.js";

export interface ServerConfig {
  dbPath: string;
  privateKeyPem: string;
}

interface CredentialsBody {
  licenseKey: string;
  deviceId: string;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

/**
 * Validates that a request body has the shape { licenseKey: string, deviceId: string }
 * before it ever reaches the DB layer. better-sqlite3 throws synchronously on
 * non-string bind parameters, and an uncaught throw inside an async Express
 * handler becomes an unhandled rejection with no response ever sent.
 */
function parseCredentialsBody(body: unknown): CredentialsBody | null {
  if (typeof body !== "object" || body === null) return null;
  const candidate = body as Record<string, unknown>;
  if (!isNonEmptyString(candidate.licenseKey)) return null;
  if (!isNonEmptyString(candidate.deviceId)) return null;
  return { licenseKey: candidate.licenseKey, deviceId: candidate.deviceId };
}

export function createServer(config: ServerConfig): express.Express {
  const db = openDb(config.dbPath);
  const app = express();

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.use(express.json());

  app.post("/activate", async (req, res, next) => {
    const body = parseCredentialsBody(req.body);
    if (!body) {
      res.status(400).json({ ok: false, reason: "bad_request" });
      return;
    }
    try {
      const result = await handleActivate(db, config.privateKeyPem, body);
      res.status(result.ok ? 200 : 403).json(result);
    } catch (err) {
      next(err);
    }
  });

  app.post("/refresh", async (req, res, next) => {
    const body = parseCredentialsBody(req.body);
    if (!body) {
      res.status(400).json({ ok: false, reason: "bad_request" });
      return;
    }
    try {
      const result = await handleRefresh(db, config.privateKeyPem, body);
      res.status(result.ok ? 200 : 403).json(result);
    } catch (err) {
      next(err);
    }
  });

  // Catch-all error handler. Must have 4 args for Express to recognize it
  // as an error-handling middleware (arity is significant to Express).
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(500).json({ ok: false, reason: "internal_error" });
  });

  return app;
}
