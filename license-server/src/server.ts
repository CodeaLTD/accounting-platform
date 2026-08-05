import express from "express";
import { openDb } from "./db";
import { handleActivate } from "./routes/activate";
import { handleRefresh } from "./routes/refresh";

export interface ServerConfig {
  dbPath: string;
  privateKeyPem: string;
}

export function createServer(config: ServerConfig): express.Express {
  const db = openDb(config.dbPath);
  const app = express();

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.use(express.json());

  app.post("/activate", async (req, res) => {
    const result = await handleActivate(db, config.privateKeyPem, req.body);
    res.status(result.ok ? 200 : 403).json(result);
  });

  app.post("/refresh", async (req, res) => {
    const result = await handleRefresh(db, config.privateKeyPem, req.body);
    res.status(result.ok ? 200 : 403).json(result);
  });

  return app;
}
