import type { AttestationRef, Cell, Grid, Subject, Theme } from "@gridz/core";
import { SCHEMA_VERSION } from "@gridz/core";
import type {
  GridQuery,
  Sink,
  SinkCapabilities,
  WriteContext,
  WriteResult,
} from "../types.js";
import type { EnsBackend } from "./backend.js";
import {
  attKey,
  b64uJson,
  decodeCell,
  encodeValue,
  layoutEntry,
  unb64uJson,
  type LayoutEntry,
} from "./codec.js";

const K_KEYS = "gridz.keys";
const K_LAYOUT = "gridz.layout";
const K_ROOT = "gridz.root";
const K_THEME = "gridz.theme";
const K_SUBJECT = "gridz.subject";

/**
 * ENS sink — the primary projection. Each cell becomes a text record on the
 * name; the signed attestation rides alongside under gridz.att[<key>]. The sink
 * is a projection only: everything here can be rebuilt from the source grid.
 */
export class EnsSink implements Sink {
  readonly name = "ens";
  readonly capabilities: SinkCapabilities = {
    read: true,
    write: true,
    delete: true,
    project: false,
    // ENS has no on-chain key enumeration; we keep a gridz.keys manifest instead.
    enumerate: true,
  };

  constructor(
    private readonly backend: EnsBackend,
    /** The ENS name this sink instance is bound to, e.g. "mygrid.eth". */
    private readonly ensName: string,
  ) {}

  async health(): Promise<{ ok: boolean; latency_ms: number }> {
    const start = Date.now();
    try {
      await this.backend.getText(this.ensName, K_KEYS);
      return { ok: true, latency_ms: Date.now() - start };
    } catch {
      return { ok: false, latency_ms: Date.now() - start };
    }
  }

  private async manifest(): Promise<{ keys: string[]; layout: Record<string, LayoutEntry> }> {
    const keysRaw = await this.backend.getText(this.ensName, K_KEYS);
    const layoutRaw = await this.backend.getText(this.ensName, K_LAYOUT);
    return {
      keys: keysRaw ? (JSON.parse(keysRaw) as string[]) : [],
      layout: layoutRaw ? (JSON.parse(layoutRaw) as Record<string, LayoutEntry>) : {},
    };
  }

  async write(cells: Cell[], _ctx: WriteContext): Promise<WriteResult[]> {
    const { keys, layout } = await this.manifest();
    const now = new Date().toISOString();
    const results: WriteResult[] = [];

    for (const cell of cells) {
      const { text, valueType } = encodeValue(cell.value);
      await this.backend.setText(this.ensName, cell.key, text);
      await this.backend.setText(this.ensName, attKey(cell.key), b64uJson(cell.attestation));
      layout[cell.key] = layoutEntry(cell, valueType);
      if (!keys.includes(cell.key)) keys.push(cell.key);
      results.push({
        cell_id: cell.id,
        sink_id: this.name,
        written_at: now,
        sink_native_uri: `ens://${this.ensName}/${cell.key}`,
      });
    }

    await this.backend.setText(this.ensName, K_KEYS, JSON.stringify(keys));
    await this.backend.setText(this.ensName, K_LAYOUT, JSON.stringify(layout));
    return results;
  }

  async read(query: GridQuery): Promise<Cell[]> {
    const { layout } = await this.manifest();
    const keysRaw = await this.backend.getText(this.ensName, K_KEYS);
    const keys = query.keys ?? (keysRaw ? (JSON.parse(keysRaw) as string[]) : []);

    const out: Cell[] = [];
    for (const key of keys) {
      const valueText = await this.backend.getText(this.ensName, key);
      const attB64 = await this.backend.getText(this.ensName, attKey(key));
      const entry = layout[key];
      if (valueText === null || attB64 === null || !entry) continue;
      out.push(decodeCell(key, valueText, attB64, entry));
    }
    return out;
  }

  async delete(cellIds: string[]): Promise<void> {
    const { keys, layout } = await this.manifest();
    const idToKey = new Map(Object.entries(layout).map(([k, e]) => [e.id, k]));
    for (const id of cellIds) {
      const key = idToKey.get(id);
      if (!key) continue;
      await this.backend.setText(this.ensName, key, "");
      await this.backend.setText(this.ensName, attKey(key), "");
      delete layout[key];
    }
    const remaining = keys.filter((k) => k in layout);
    await this.backend.setText(this.ensName, K_KEYS, JSON.stringify(remaining));
    await this.backend.setText(this.ensName, K_LAYOUT, JSON.stringify(layout));
  }

  // --- ENS-specific full-Grid convenience (beyond the Sink interface) ---

  /** Project an entire Grid: subject, theme, root, and every cell. */
  async writeGrid(grid: Grid): Promise<WriteResult[]> {
    await this.backend.setText(this.ensName, K_SUBJECT, JSON.stringify(grid.subject));
    await this.backend.setText(this.ensName, K_THEME, JSON.stringify(grid.theme));
    const results = await this.write(grid.cells, { subject: grid.subject });
    await this.backend.setText(this.ensName, K_ROOT, b64uJson(grid.root_attestation));
    return results;
  }

  /** Pull and reconstruct the full Grid for verification with @gridz/core. */
  async readGrid(): Promise<Grid | null> {
    const subjectRaw = await this.backend.getText(this.ensName, K_SUBJECT);
    const themeRaw = await this.backend.getText(this.ensName, K_THEME);
    const rootRaw = await this.backend.getText(this.ensName, K_ROOT);
    if (!subjectRaw || !themeRaw || !rootRaw) return null;

    const cells = await this.read({ subject: this.ensName });
    return {
      schema_version: SCHEMA_VERSION,
      subject: JSON.parse(subjectRaw) as Subject,
      theme: JSON.parse(themeRaw) as Theme,
      cells,
      root_attestation: unb64uJson<AttestationRef>(rootRaw),
    };
  }
}
