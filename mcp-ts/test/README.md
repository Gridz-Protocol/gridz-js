# MCP tests

`mcp.test.ts` unit-tests the tool **handlers** directly (100% coverage) — the
prepare→sign→attach→verify no-custody flow, store reads, sink publish, key
suggestion, and bootstrap. `createServer()` is constructed to confirm wiring.

The FastMCP transport binding (`server.ts`) is exercised end-to-end by the **MCP
Inspector** integration gate (BRIEF §15):

```bash
pnpm --filter @gridz/mcp build
npx @modelcontextprotocol/inspector node packages/mcp-ts/dist/cli.js
```

This requires the Inspector and an interactive/CI MCP client, so it is not part
of the offline unit run. The Python server (`gridz_mcp`) mirrors the same tool
surface and is validated the same way.
