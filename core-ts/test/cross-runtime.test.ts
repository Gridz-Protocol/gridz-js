import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { verifyGrid, type Grid } from "../src/index.js";

const NOW = new Date("2026-01-01T00:00:00.000Z");

const fixture = (name: string): Grid =>
  JSON.parse(
    readFileSync(fileURLToPath(new URL(`../../../tests/cross-runtime/fixtures/${name}`, import.meta.url)), "utf8"),
  );

/**
 * Reverse cross-runtime gate: grids signed by the Python `gridz` package must
 * verify in @gridz/core. (The forward direction — TS-signed grids verifying in
 * Python — lives in python/gridz/tests/test_crossruntime.py.)
 */
describe("cross-runtime: Python-signed grids verify in TS", () => {
  it("verifies a Python EIP-712 grid", async () => {
    const r = await verifyGrid(fixture("py-eip712-grid.json"), { now: NOW });
    expect(r.ok).toBe(true);
    expect(r.cells.every((c) => c.result.ok)).toBe(true);
    expect(r.root.ok).toBe(true);
  });

  it("verifies a Python Ed25519/JWS grid", async () => {
    const r = await verifyGrid(fixture("py-ed25519-grid.json"), { now: NOW });
    expect(r.ok).toBe(true);
  });

  it("also re-verifies the TS-signed fixtures (round-trip stability)", async () => {
    expect((await verifyGrid(fixture("ts-eip712-grid.json"), { now: NOW })).ok).toBe(true);
    expect((await verifyGrid(fixture("ts-ed25519-grid.json"), { now: NOW })).ok).toBe(true);
  });

  it("rejects a Python grid whose value was tampered", async () => {
    const g = fixture("py-eip712-grid.json");
    (g.cells[0] as { value: unknown }).value = "tampered";
    const r = await verifyGrid(g, { now: NOW });
    expect(r.ok).toBe(false);
    expect(r.cells[0]!.result.reason).toBe("value-hash-mismatch");
  });
});
