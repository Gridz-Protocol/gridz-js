import type { Cell } from "@gridz/core";
import type { GridQuery, Sink, SinkCapabilities, WriteContext, WriteResult } from "../types.js";

/**
 * Storage primitive shared by every database sink. A CellStore persists the
 * canonical cell JSON (the signed attestation rides inside it) keyed by
 * (subject, key). Swapping the store swaps the database; StoreSink adapts any
 * CellStore to the Sink interface, so the projection logic is written and tested
 * once (against SQLite) and reused by Postgres/MySQL/Mongo/Redis/Neo4j/S3.
 */
export interface CellStore {
  readonly name: string;
  init(): Promise<void>;
  ping(): Promise<boolean>;
  /** Upsert a cell; returns the sink-native URI. */
  put(subject: string, cell: Cell): Promise<string>;
  list(subject: string, keys?: string[]): Promise<Cell[]>;
  removeByIds(subject: string, ids: string[]): Promise<void>;
}

export function encodeCell(cell: Cell): string {
  return JSON.stringify(cell);
}

export function decodeCell(json: string): Cell {
  return JSON.parse(json) as Cell;
}

const CAPS: SinkCapabilities = {
  read: true,
  write: true,
  delete: true,
  project: false,
  enumerate: true,
};

/** Adapts a CellStore to the Sink interface. */
export class StoreSink implements Sink {
  readonly capabilities = CAPS;
  constructor(private readonly store: CellStore) {}

  get name(): string {
    return this.store.name;
  }

  async health(): Promise<{ ok: boolean; latency_ms: number }> {
    const start = Date.now();
    const ok = await this.store.ping().catch(() => false);
    return { ok, latency_ms: Date.now() - start };
  }

  async write(cells: Cell[], ctx: WriteContext): Promise<WriteResult[]> {
    await this.store.init();
    const now = new Date().toISOString();
    const out: WriteResult[] = [];
    for (const cell of cells) {
      const uri = await this.store.put(ctx.subject.did, cell);
      out.push({ cell_id: cell.id, sink_id: this.store.name, written_at: now, sink_native_uri: uri });
    }
    return out;
  }

  async read(query: GridQuery): Promise<Cell[]> {
    await this.store.init();
    return this.store.list(query.subject, query.keys);
  }

  async delete(cellIds: string[]): Promise<void> {
    // cellIds are global; the store resolves them per subject. We pass an empty
    // subject to mean "any" for stores that index by id; SQL/KV stores filter by id.
    await this.store.removeByIds("", cellIds);
  }
}
