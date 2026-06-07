#!/usr/bin/env node
import { createServer } from "./server.js";

/** `gridz-mcp` — stdio by default, streamable-HTTP with --http. */
const server = createServer();
const useHttp = process.argv.includes("--http");

if (useHttp) {
  const port = Number(process.env.PORT ?? 8080);
  await server.start({ transportType: "httpStream", httpStream: { port } });
  process.stdout.write(`gridz mcp on http://0.0.0.0:${port}\n`);
} else {
  await server.start({ transportType: "stdio" });
}
