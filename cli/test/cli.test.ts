import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalEip712Signer } from "@gridz/core";
import {
  initCmd,
  validateCmd,
  buildCmd,
  verifyCmd,
  cellAddCmd,
  publishCmd,
  sinkListCmd,
  sinkTestCmd,
  schemaCmd,
  whoamiCmd,
  loadConfig,
  saveConfig,
  TEMPLATE_NAMES,
} from "../src/index.js";

const KEY = `0x${"11".repeat(32)}` as const;
const ENV = { GRIDZ_SIGNER_KEY: KEY, GRIDZ_CHAIN_ID: "11155111" };
const NOW = new Date("2026-01-01T00:00:00.000Z");
const signer = LocalEip712Signer.fromPrivateKey(KEY, 11155111);

let dir: string;
let cfg: string;
let grid: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "gridz-cli-"));
  cfg = join(dir, "gridz.yaml");
  grid = join(dir, "grid.json");
});

async function fillConfig(): Promise<void> {
  const config = loadConfig(cfg);
  config.subject.did = await signer.did();
  for (const cell of config.cells) {
    cell.value = cell.key === "url" ? "https://gridz.dev" : `value-${cell.key}`;
    delete cell._needs_input;
  }
  saveConfig(cfg, config);
}

describe("init", () => {
  it("scaffolds a template and refuses to overwrite without --force", () => {
    const r = initCmd({ template: "minimal", out: cfg });
    expect(r).toMatchObject({ ok: true, cells: 3, needs_input: 3 });

    expect(initCmd({ template: "minimal", out: cfg }).ok).toBe(false);
    expect(initCmd({ template: "minimal", out: cfg, force: true }).ok).toBe(true);
    expect(initCmd({ template: "nope", out: cfg }).ok).toBe(false);
  });

  it("every template ships _needs_input and FAILS validation until filled", () => {
    for (const name of TEMPLATE_NAMES) {
      initCmd({ template: name, out: cfg, force: true });
      const v = validateCmd({ path: cfg });
      expect(v.ok).toBe(false); // invariant: shape-only templates never validate as-is
      expect((v.errors as unknown[]).length).toBeGreaterThan(0);
    }
  });
});

describe("validate → build → verify → publish", () => {
  it("runs the full happy path", async () => {
    initCmd({ template: "minimal", out: cfg });
    expect(validateCmd({ path: cfg }).ok).toBe(false);

    await fillConfig();
    expect(validateCmd({ path: cfg }).ok).toBe(true);

    const built = await buildCmd({ path: cfg, out: grid, env: ENV, now: NOW });
    expect(built.ok).toBe(true);
    expect(built.cells).toBe(3);

    const verified = await verifyCmd({ path: grid, now: NOW });
    expect(verified.ok).toBe(true);
    expect((verified.cells as { status: string }[]).every((c) => c.status === "verified")).toBe(true);

    const pub = await publishCmd({ grid, sink: "memory" });
    expect(pub.ok).toBe(true);
    expect((pub.results as unknown[]).length).toBe(3);
  });

  it("build refuses an unfilled (invalid) config", async () => {
    initCmd({ template: "minimal", out: cfg });
    const r = await buildCmd({ path: cfg, out: grid, env: ENV, now: NOW });
    expect(r).toMatchObject({ ok: false, error: "invalid_config" });
  });

  it("build fails with no identity configured", async () => {
    initCmd({ template: "minimal", out: cfg });
    await fillConfig();
    const r = await buildCmd({ path: cfg, out: grid, env: {}, now: NOW });
    expect(r).toMatchObject({ ok: false, error: "no_identity" });
  });
});

describe("cell add", () => {
  it("appends a cell to the config", () => {
    initCmd({ template: "minimal", out: cfg });
    const r = cellAddCmd({ path: cfg, key: "com.github", value: "octocat", size: "1x1" });
    expect(r.ok).toBe(true);
    expect(loadConfig(cfg).cells.map((c) => c.key)).toContain("com.github");
  });

  it("parses JSON values", () => {
    initCmd({ template: "minimal", out: cfg });
    cellAddCmd({ path: cfg, key: "gridz.poll", value: '{"q":"ship?","options":["yes"]}', widget: "gridz.poll" });
    const cell = loadConfig(cfg).cells.find((c) => c.key === "gridz.poll")!;
    expect(cell.value).toEqual({ q: "ship?", options: ["yes"] });
  });
});

describe("identity / sinks / schema", () => {
  it("whoami resolves the env signer", async () => {
    const r = await whoamiCmd({ env: ENV });
    expect(r.ok).toBe(true);
    expect(r.did).toBe(await signer.did());
  });

  it("whoami fails with no identity", async () => {
    expect((await whoamiCmd({ env: {} })).ok).toBe(false);
  });

  it("lists sinks and round-trips the memory sink", async () => {
    expect((sinkListCmd().sinks as { name: string }[]).map((s) => s.name)).toContain("memory");
    expect((await sinkTestCmd({ name: "memory" })).ok).toBe(true);
    expect((await sinkTestCmd({ name: "ens" })).ok).toBe(false);
  });

  it("publish rejects ens (no key custody) and unknown sinks", async () => {
    initCmd({ template: "minimal", out: cfg });
    await fillConfig();
    await buildCmd({ path: cfg, out: grid, env: ENV, now: NOW });
    expect((await publishCmd({ grid, sink: "ens" })).detail).toContain("custody");
    expect((await publishCmd({ grid, sink: "postgres" })).ok).toBe(false);
  });

  it("classifies keys by tier", () => {
    expect(schemaCmd({ key: "gridz.poll" }).source).toBe("gridz");
    expect(schemaCmd({ key: "com.github" }).source).toContain("service");
    expect(schemaCmd({ key: "alias" }).source).toContain("global");
    expect(schemaCmd({ key: "agent-context" }).source).toContain("agent");
  });
});
