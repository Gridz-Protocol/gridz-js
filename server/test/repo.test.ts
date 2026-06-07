import { describe, it, expect } from "vitest";
import type { Cell, Grid } from "@gridz/core";
import { MemoryGridRepository } from "../src/index.js";

const cell = (key: string, value: unknown): Cell => ({
  id: `id-${key}`,
  key,
  value,
  position: { x: 0, y: 0, w: 1, h: 1 },
  size: "1x1",
  is_visible: true,
  attestation: {
    format: "eip712-raw",
    uid: `0x${"00".repeat(32)}`,
    uri: "data://inline/x",
    attester: "did:web:example",
    iat: "2026-01-01T00:00:00.000Z",
    value_hash: `0x${"00".repeat(32)}`,
  },
});

const grid = (cells: Cell[]): Grid => ({
  schema_version: "gridz/1.0.0",
  subject: { type: "human", did: "did:web:example" },
  theme: {
    background_type: "solid",
    background_value: "#000",
    accent_color: "#fff",
    text_color: "#fff",
    card_style: "rounded",
    card_background: "#111",
    font_family: "sans",
  },
  cells,
  root_attestation: cell("root", "x").attestation,
});

describe("MemoryGridRepository", () => {
  it("putCell adds a new cell and updates an existing one", () => {
    const repo = new MemoryGridRepository();
    repo.put("s", grid([cell("alias", "a")]));

    expect(repo.putCell("s", cell("url", "u"))).toBe(true);
    expect(repo.getCell("s", "url")!.value).toBe("u");

    expect(repo.putCell("s", cell("alias", "renamed"))).toBe(true);
    expect(repo.getCell("s", "alias")!.value).toBe("renamed");
    expect(repo.get("s")!.cells).toHaveLength(2);
  });

  it("putCell returns false when no grid exists", () => {
    expect(new MemoryGridRepository().putCell("missing", cell("a", 1))).toBe(false);
  });

  it("deleteCell handles hit, miss, and missing grid", () => {
    const repo = new MemoryGridRepository();
    repo.put("s", grid([cell("alias", "a")]));
    expect(repo.deleteCell("s", "alias")).toBe(true);
    expect(repo.deleteCell("s", "alias")).toBe(false); // already gone
    expect(repo.deleteCell("missing", "alias")).toBe(false);
  });

  it("getCell/get return null for unknown subjects", () => {
    const repo = new MemoryGridRepository();
    expect(repo.get("nope")).toBeNull();
    expect(repo.getCell("nope", "alias")).toBeNull();
  });
});
