import { valueHash, algoForFormat, verifyCell, type Cell } from "@gridz/core";
import type { Sink } from "./types.js";
import { makeProbeGrid } from "./probe.js";

export interface SinkTestStep {
  name: string;
  ok: boolean;
  detail?: string;
}

export interface SinkTestReport {
  sink: string;
  ok: boolean;
  steps: SinkTestStep[];
}

function cellValueHash(cell: Cell): string {
  return valueHash(algoForFormat(cell.attestation.format), cell.value);
}

/**
 * Round-trips a deterministic probe Grid through a sink: health → write → read
 * → cryptographic re-verify → delete. Backs `gridz sink test <name>`. A sink that
 * mangles a value fails the read step (value_hash mismatch) before verify even runs.
 */
export async function sinkRoundTripTest(sink: Sink): Promise<SinkTestReport> {
  const steps: SinkTestStep[] = [];
  const grid = await makeProbeGrid();
  const subject = grid.subject;
  const keys = grid.cells.map((c) => c.key);
  const ids = grid.cells.map((c) => c.id);

  const health = await sink.health();
  steps.push({ name: "health", ok: health.ok, detail: `${health.latency_ms}ms` });

  const written = await sink.write(grid.cells, { subject });
  steps.push({ name: "write", ok: written.length === grid.cells.length });

  const readBack = await sink.read({ subject: subject.did, keys });
  const expected = new Map(grid.cells.map((c) => [c.key, cellValueHash(c)]));
  const fidelity =
    readBack.length === grid.cells.length &&
    readBack.every((c) => cellValueHash(c) === expected.get(c.key));
  steps.push({
    name: "read",
    ok: fidelity,
    detail: `${readBack.length}/${grid.cells.length} cells, values intact`,
  });

  const verified = (
    await Promise.all(readBack.map((c) => verifyCell(c, { subjectDid: subject.did })))
  ).every((r) => r.ok);
  steps.push({ name: "verify", ok: verified, detail: "read-back cells still verify" });

  await sink.delete(ids);
  const afterDelete = await sink.read({ subject: subject.did, keys });
  steps.push({ name: "delete", ok: afterDelete.length === 0 });

  return { sink: sink.name, ok: steps.every((s) => s.ok), steps };
}
