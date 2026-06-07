import { readFileSync, writeFileSync } from "node:fs";
import { buildGrid, verifyGrid, type Grid } from "@gridz/core";
import { MemorySink, sinkRoundTripTest } from "@gridz/sinks";
import { TEMPLATES } from "./templates.js";
import {
  configExists,
  configToDrafts,
  loadConfig,
  saveConfig,
  validateConfig,
} from "./config.js";
import { resolveIdentity, type IdentityEnv } from "./identity.js";

export interface CmdResult {
  ok: boolean;
  [k: string]: unknown;
}

export function initCmd(opts: { template: string; out: string; force?: boolean }): CmdResult {
  const tmpl = TEMPLATES[opts.template];
  if (!tmpl) return { ok: false, error: "unknown_template", available: Object.keys(TEMPLATES) };
  if (configExists(opts.out) && !opts.force) {
    return { ok: false, error: "exists", detail: `${opts.out} exists; pass --force to overwrite` };
  }
  saveConfig(opts.out, structuredClone(tmpl));
  return { ok: true, path: opts.out, template: opts.template, cells: tmpl.cells.length, needs_input: tmpl.cells.filter((c) => c._needs_input).length };
}

export function validateCmd(opts: { path: string }): CmdResult {
  const config = loadConfig(opts.path);
  const { ok, errors } = validateConfig(config);
  return { ok, errors, cells: config.cells.length };
}

export function whoamiCmd(opts: { env?: IdentityEnv } = {}): Promise<CmdResult> {
  const id = resolveIdentity(opts.env);
  if (!id) return Promise.resolve({ ok: false, error: "no_identity", detail: "configure GRIDZ_SIGNER_KEY or GRIDZ_ED25519_SEED" });
  return id.signer.did().then((did) => ({ ok: true, did, format: id.signer.format(), chainId: id.chainId }));
}

export function cellAddCmd(opts: {
  path: string;
  key: string;
  value: string;
  widget?: string;
  size?: string;
}): CmdResult {
  const config = loadConfig(opts.path);
  let value: unknown;
  try {
    value = JSON.parse(opts.value);
  } catch {
    value = opts.value;
  }
  config.cells.push({
    key: opts.key,
    value,
    ...(opts.widget ? { widget_type: opts.widget } : {}),
    size: opts.size ?? "1x1",
  });
  saveConfig(opts.path, config);
  return { ok: true, key: opts.key, cells: config.cells.length };
}

export async function buildCmd(opts: {
  path: string;
  out: string;
  env?: IdentityEnv;
  now?: Date;
}): Promise<CmdResult> {
  const config = loadConfig(opts.path);
  const validation = validateConfig(config);
  if (!validation.ok) return { ok: false, error: "invalid_config", errors: validation.errors };

  const id = resolveIdentity(opts.env);
  if (!id) return { ok: false, error: "no_identity" };

  const did = config.subject.did ?? (await id.signer.did());
  const grid = await buildGrid(id.signer, {
    subject: { type: config.subject.type, did, ...(config.subject.ens ? { ens: config.subject.ens } : {}) },
    theme: config.theme,
    cells: configToDrafts(config.cells),
    chainId: id.chainId,
    verifyingContract: id.resolver,
    now: opts.now,
  });
  writeFileSync(opts.out, JSON.stringify(grid, null, 2) + "\n");
  return { ok: true, grid_path: opts.out, cells: grid.cells.length, root_uid: grid.root_attestation.uid };
}

export async function verifyCmd(opts: { path: string; now?: Date }): Promise<CmdResult> {
  const grid = JSON.parse(readFileSync(opts.path, "utf8")) as Grid;
  const result = await verifyGrid(grid, opts.now ? { now: opts.now } : {});
  return {
    ok: result.ok,
    cells: result.cells.map((c) => ({ key: c.key, status: c.result.status })),
    root: result.root.status,
  };
}

export async function publishCmd(opts: { grid: string; sink: string }): Promise<CmdResult> {
  if (opts.sink !== "memory") {
    return {
      ok: false,
      error: "unsupported_sink",
      detail:
        opts.sink === "ens"
          ? "ENS publishing needs a wallet/backend; use the SDK with a ViemEnsBackend (the CLI does not custody keys)"
          : `sink ${opts.sink} not wired into the CLI yet`,
    };
  }
  const grid = JSON.parse(readFileSync(opts.grid, "utf8")) as Grid;
  const sink = new MemorySink();
  const results = await sink.write(grid.cells, { subject: grid.subject });
  return { ok: true, sink: opts.sink, results };
}

export function sinkListCmd(): CmdResult {
  const sinks = [new MemorySink()];
  return { ok: true, sinks: sinks.map((s) => ({ name: s.name, capabilities: s.capabilities })) };
}

export async function sinkTestCmd(opts: { name: string }): Promise<CmdResult> {
  if (opts.name !== "memory") return { ok: false, error: "unsupported_sink", detail: `only 'memory' is testable from the CLI without external config` };
  const report = await sinkRoundTripTest(new MemorySink());
  return { ok: report.ok, report };
}

export function schemaCmd(opts: { key: string }): CmdResult {
  const k = opts.key;
  let source: string;
  if (k.startsWith("gridz.")) source = "gridz";
  else if (k.startsWith("agent-") || k.startsWith("agent.")) source = "agent (ENSIP-25/26 + gridz)";
  else if (k.includes(".")) source = "ensip-5 service key";
  else source = "ensip-5/18 global key";
  return { ok: true, key: k, source, note: "dynamic keys are valid; unknown widget types fall back to the Generic renderer" };
}

export const TEMPLATE_LIST = Object.keys(TEMPLATES);
