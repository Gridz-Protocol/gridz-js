import type { Cell } from "@gridz/core";
import type { GridQuery, Sink, SinkCapabilities, WriteContext, WriteResult } from "./types.js";

/**
 * Reference in-memory sink. Useful for tests, local dev, and as the canonical
 * example of the Sink contract. Keyed by `${subjectDid}\n${cell.key}`.
 */
export class MemorySink implements Sink {
  readonly name = "memory";
  readonly capabilities: SinkCapabilities = {
    read: true,
    write: true,
    delete: true,
    project: false,
    enumerate: true,
  };

  private store = new Map<string, Cell>();
  private byId = new Map<string, string>();

  private keyOf(subjectDid: string, key: string): string {
    return `${subjectDid}\n${key}`;
  }

  async health(): Promise<{ ok: boolean; latency_ms: number }> {
    return { ok: true, latency_ms: 0 };
  }

  async write(cells: Cell[], ctx: WriteContext): Promise<WriteResult[]> {
    const now = new Date().toISOString();
    return cells.map((cell) => {
      const storeKey = this.keyOf(ctx.subject.did, cell.key);
      this.store.set(storeKey, cell);
      this.byId.set(cell.id, storeKey);
      return {
        cell_id: cell.id,
        sink_id: this.name,
        written_at: now,
        sink_native_uri: `memory://${encodeURIComponent(ctx.subject.did)}/${cell.key}`,
      };
    });
  }

  async read(query: GridQuery): Promise<Cell[]> {
    const wanted = query.keys;
    const out: Cell[] = [];
    for (const [storeKey, cell] of this.store) {
      const [did, key] = storeKey.split("\n");
      if (did !== query.subject) continue;
      if (wanted && !wanted.includes(key!)) continue;
      out.push(cell);
    }
    return out;
  }

  async delete(cellIds: string[]): Promise<void> {
    for (const id of cellIds) {
      const storeKey = this.byId.get(id);
      if (storeKey) {
        this.store.delete(storeKey);
        this.byId.delete(id);
      }
    }
  }
}
