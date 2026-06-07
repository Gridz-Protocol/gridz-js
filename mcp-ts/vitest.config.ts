import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      // server.ts is thin FastMCP wiring whose tool closures are exercised by the
      // MCP Inspector integration gate (see test/README), not unit tests.
      exclude: ["src/index.ts", "src/cli.ts", "src/server.ts"],
      thresholds: { lines: 80, functions: 80, statements: 80, branches: 75 },
    },
  },
});
