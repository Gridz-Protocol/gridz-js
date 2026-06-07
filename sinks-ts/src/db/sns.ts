import type { GridQuery, Sink, SinkCapabilities, WriteContext, WriteResult } from "../types.js";

/**
 * Solana Name Service sink — STATUS: PREVIEW. SNS Records V2 via
 * @bonfida/spl-name-service is not yet implemented. Methods throw rather than
 * silently no-op, so no caller mistakes this for a working projection (BRIEF §18).
 */
export class SnsSink implements Sink {
  readonly name = "sns";
  readonly status = "preview" as const;
  readonly capabilities: SinkCapabilities = {
    read: false,
    write: false,
    delete: false,
    project: false,
    enumerate: false,
  };

  private notImplemented(): never {
    throw new Error("@gridz/sink-sns is status: preview — SNS Records V2 is not implemented yet");
  }

  async health(): Promise<{ ok: boolean; latency_ms: number }> {
    return { ok: false, latency_ms: 0 };
  }
  async write(_cells: never[], _ctx: WriteContext): Promise<WriteResult[]> {
    return this.notImplemented();
  }
  async read(_query: GridQuery): Promise<never[]> {
    return this.notImplemented();
  }
  async delete(_ids: string[]): Promise<void> {
    return this.notImplemented();
  }
}
