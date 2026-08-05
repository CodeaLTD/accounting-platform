import { readFileSync } from "node:fs";
import { createServer } from "./server.js";

const port = Number(process.env.PORT ?? 3001);
const dbPath = process.env.DB_PATH;
const privateKeyPath = process.env.PRIVATE_KEY_PATH;

if (!dbPath) {
  console.error("Missing required env var: DB_PATH");
  process.exit(1);
}
if (!privateKeyPath) {
  console.error("Missing required env var: PRIVATE_KEY_PATH");
  process.exit(1);
}

const privateKeyPem = readFileSync(privateKeyPath, "utf8");

const app = createServer({ dbPath, privateKeyPem });

app.listen(port, () => {
  console.log(`license-server listening on port ${port}`);
});
