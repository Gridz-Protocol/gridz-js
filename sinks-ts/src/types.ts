import type { Cell, Grid, Subject } from "@gridz/core";

export interface SinkCapabilities {
  read: boolean;
  write: boolean;
  delete: boolean;
  /** Can derive an alternate projection of a whole Grid (e.g. a graph). */
  project: boolean;
  /** Supports wildcard / prefix reads without an explicit key list. */
  enumerate: boolean;
}

export interface WriteContext {
  subject: Subject;
  /** Stable gridId (see @gridz/core gridId), when known. */
  gridId?: string;
}

export interface GridQuery {
  /** ENS name, DID, or sink-native id identifying the Grid. */
  subject: string;
  /** Restrict to these cell keys. Sinks that cannot enumerate require this. */
  keys?: string[];
}

/**
 * The record a sink emits per stored cell. A sink write is NEVER authoritative —
 * it only records where a projection landed. The signed attestation remains the
 * source of truth and the projection can be rebuilt from it at any time.
 */
export interface WriteResult {
  cell_id: string;
  sink_id: string;
  written_at: string;
  /** Sink-native locator, e.g. ens://mygrid.eth/com.github or memory://… */
  sink_native_uri: string;
}

export interface Sink {
  readonly name: string;
  readonly capabilities: SinkCapabilities;
  health(): Promise<{ ok: boolean; latency_ms: number }>;
  write(cells: Cell[], ctx: WriteContext): Promise<WriteResult[]>;
  read(query: GridQuery): Promise<Cell[]>;
  delete(cellIds: string[]): Promise<void>;
  project?(grid: Grid): Promise<unknown>;
}
