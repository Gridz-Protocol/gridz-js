import {
  SCHEMA_VERSION,
  gridId,
  gridzDomain,
  valueHash,
  widgetTypeHash,
  verifyGrid,
  eip712CellAttestation,
  GridzCell,
  PRIMARY_TYPE_CELL,
  type Cell,
  type CellPosition,
  type Grid,
  type Hex,
} from "@gridz/core";
import { MemorySink, type WriteResult } from "@gridz/sinks";
import { TEMPLATES } from "@gridz/cli";

/** Backing store for grid/cell reads. Injectable so the server can front ENS/API. */
export interface GridStore {
  getGrid(subject: string): Grid | null;
  putGrid(subject: string, grid: Grid): void;
  getCell(subject: string, key: string): Cell | null;
}

export class MemoryStore implements GridStore {
  private grids = new Map<string, Grid>();
  getGrid(subject: string): Grid | null {
    return this.grids.get(subject) ?? null;
  }
  putGrid(subject: string, grid: Grid): void {
    this.grids.set(subject, grid);
  }
  getCell(subject: string, key: string): Cell | null {
    return this.grids.get(subject)?.cells.find((c) => c.key === key) ?? null;
  }
}

export interface PrepareWriteInput {
  subject_did: string;
  key: string;
  value: unknown;
  widget_type?: string;
  size?: string;
  position?: CellPosition;
  chain_id: number;
  verifying_contract: Hex;
  nonce?: number;
  expires_at?: string;
  /** When set, returns a hint to chain to the 1claw MCP server instead. */
  oneclaw?: { agent_id: string };
}

export interface PreparedMessage {
  gridId: string;
  key: string;
  valueHashHex: string;
  widgetTypeHash: string;
  expiresAt: string;
  nonce: string;
}

export interface Prepared {
  typed_data: {
    domain: ReturnType<typeof gridzDomain>;
    types: { GridzCell: typeof GridzCell };
    primaryType: string;
    message: PreparedMessage;
  };
  cell_meta: { key: string; value: unknown; widget_type?: string; size: string; position: CellPosition };
  value_hash: Hex;
  next_action?: { next_action: string; server: string; args: unknown };
}

/**
 * Build the unsigned EIP-712 payload for a cell. Signing is NEVER server-side —
 * the agent host signs and calls cell.attach_signature. With 1claw configured,
 * returns a hint to chain to the 1claw MCP server (Gridz never proxies 1claw).
 */
export function cellPrepareWrite(input: PrepareWriteInput): Prepared {
  const algo = "keccak256" as const;
  const gid = gridId(algo, input.subject_did, SCHEMA_VERSION);
  const vhash = valueHash(algo, input.value);
  const whash = widgetTypeHash(algo, input.widget_type);
  const expires = input.expires_at ? BigInt(Math.floor(new Date(input.expires_at).getTime() / 1000)) : 0n;
  const nonce = BigInt(input.nonce ?? 0);
  const domain = gridzDomain(input.chain_id, input.verifying_contract);

  const prepared: Prepared = {
    typed_data: {
      domain,
      types: { GridzCell },
      primaryType: PRIMARY_TYPE_CELL,
      message: {
        gridId: gid,
        key: input.key,
        valueHashHex: vhash,
        widgetTypeHash: whash,
        expiresAt: expires.toString(),
        nonce: nonce.toString(),
      },
    },
    cell_meta: {
      key: input.key,
      value: input.value,
      ...(input.widget_type ? { widget_type: input.widget_type } : {}),
      size: input.size ?? "1x1",
      position: input.position ?? { x: 0, y: 0, w: 1, h: 1 },
    },
    value_hash: vhash,
  };

  if (input.oneclaw) {
    prepared.next_action = {
      next_action: "sign_typed_data",
      server: "1claw",
      args: { agent_id: input.oneclaw.agent_id, typed_data: prepared.typed_data },
    };
  }
  return prepared;
}

/** Stitch a detached signature into a verifiable cell. */
export function cellAttachSignature(input: { prepared: Prepared; signature: Hex; attester: string }): Cell {
  const m = input.prepared.typed_data.message;
  const message = {
    gridId: m.gridId as Hex,
    key: m.key as string,
    valueHashHex: m.valueHashHex as Hex,
    widgetTypeHash: m.widgetTypeHash as Hex,
    expiresAt: BigInt(m.expiresAt),
    nonce: BigInt(m.nonce),
  };
  const attestation = eip712CellAttestation({
    domain: input.prepared.typed_data.domain,
    message,
    signature: input.signature,
    attester: input.attester,
  });
  const meta = input.prepared.cell_meta;
  return {
    id: `cell-${meta.key}`,
    key: meta.key,
    value: meta.value,
    ...(meta.widget_type ? { widget_type: meta.widget_type } : {}),
    position: meta.position,
    size: meta.size,
    is_visible: true,
    attestation,
  };
}

export function gridVerify(grid: Grid): ReturnType<typeof verifyGrid> {
  return verifyGrid(grid);
}

export async function sinkPublish(
  store: GridStore,
  input: { subject: string; sink: string; cell_ids?: string[] },
): Promise<{ ok: boolean; results?: WriteResult[]; error?: string }> {
  if (input.sink !== "memory") {
    return { ok: false, error: "only the in-process memory sink is publishable from the MCP server; use a client wallet/backend for ENS" };
  }
  const grid = store.getGrid(input.subject);
  if (!grid) return { ok: false, error: "grid_not_found" };
  const cells = input.cell_ids ? grid.cells.filter((c) => input.cell_ids!.includes(c.id)) : grid.cells;
  const results = await new MemorySink().write(cells, { subject: grid.subject });
  return { ok: true, results };
}

const KEY_SUGGESTIONS: [string, string][] = [
  ["github", "com.github"],
  ["twitter", "com.twitter"],
  ["telegram", "org.telegram"],
  ["discord", "com.discord"],
  ["farcaster", "xyz.farcaster"],
  ["bluesky", "social.bsky"],
  ["poll", "gridz.poll"],
  ["weather", "gridz.weather"],
  ["clock", "gridz.clock"],
  ["countdown", "gridz.countdown"],
  ["website", "url"],
  ["bio", "description"],
  ["display name", "alias"],
  ["mcp", "agent-endpoint[mcp]"],
  ["context", "agent-context"],
];

const KNOWN_KEYS = new Set(KEY_SUGGESTIONS.map(([, k]) => k));

export function schemaSuggestKey(description: string): { suggested_key: string; existing?: string } {
  const d = description.toLowerCase();
  for (const [kw, key] of KEY_SUGGESTIONS) {
    if (d.includes(kw)) return { suggested_key: key, ...(KNOWN_KEYS.has(key) ? { existing: key } : {}) };
  }
  const slug = d.replace(/[^a-z0-9]+/g, ".").replace(/^\.+|\.+$/g, "") || "gridz.custom";
  return { suggested_key: `gridz.${slug}` };
}

export function bootstrapListTemplates(): { name: string; subject_type: string; cells: number }[] {
  return Object.entries(TEMPLATES).map(([name, t]) => ({
    name,
    subject_type: t.subject.type,
    cells: t.cells.length,
  }));
}

export function bootstrapFromTemplate(name: string): unknown {
  const t = TEMPLATES[name];
  if (!t) return { error: "unknown_template", available: Object.keys(TEMPLATES) };
  return structuredClone(t);
}

export function identityListSigners(): { signers: unknown[]; note: string } {
  // The server holds no keys. Signers live with the agent host / client.
  return { signers: [], note: "Gridz never custodies keys; configure a signer in your client (local wallet, passkey, or 1claw)." };
}
