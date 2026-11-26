/**
 * pnpm --filter @easyjobs/worker fake-api [--port 4000]
 * In-memory fake of the API's ingest routes, for running `worker start` before/without apps/api.
 */
import { parseArgs } from "node:util";
import { startFakeIngest } from "./fake-ingest";

const { values } = parseArgs({ options: { port: { type: "string", short: "p" }, host: { type: "string" } }, strict: true });
const port = Number(values.port ?? process.env.API_PORT ?? 4000);
const server = await startFakeIngest({
  port,
  host: values.host ?? "127.0.0.1",
  key: process.env.INGEST_API_KEY ?? "dev-ingest-key",
  log: (line) => console.log(`${new Date().toISOString().slice(11, 19)} fake-api ${line}`),
});
console.log(`fake ingest API listening on ${server.url} (x-ingest-key: ${process.env.INGEST_API_KEY ? "$INGEST_API_KEY" : "dev-ingest-key"}) — GET /_fake/stats for counts`);
const timer = setInterval(() => console.log(`fake-api stats ${JSON.stringify(server.stats())}`), 30_000);
const stop = (): void => {
  clearInterval(timer);
  console.log(`fake-api final stats ${JSON.stringify(server.stats())}`);
  void server.close().then(() => process.exit(0));
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
