import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    // node:sqlite is a newer builtin Vite doesn't auto-externalize.
    server: { deps: { external: [/node:sqlite/] } },
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: [
        "src/index.ts",
        "src/types.ts",
        "src/ens/backend.ts",
        "src/db/index.ts",
        // Driver stores are validated by docker-backed integration tests, not the
        // offline unit run; their shared projection logic is tested via SQLite.
        "src/db/drivers.ts",
      ],
      thresholds: { lines: 80, functions: 80, statements: 80, branches: 80 },
    },
  },
});
