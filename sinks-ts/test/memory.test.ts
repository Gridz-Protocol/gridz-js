import { describe, it, expect } from "vitest";
import { verifyCell } from "@gridz/core";
import { MemorySink, makeProbeGrid } from "../src/index.js";

describe("MemorySink", () => {
  it("writes, reads back with fidelity, and the cells still verify", async () => {
    const grid = await makeProbeGrid();
    const sink = new MemorySink();
    const written = await sink.write(grid.cells, { subject: grid.subject });
    expect(written).toHaveLength(grid.cells.length);
    expect(written[0]!.sink_native_uri.startsWith("memory://")).toBe(true);

    const read = await sink.read({ subject: grid.subject.did });
    expect(read).toHaveLength(grid.cells.length);
    for (const c of read) {
      expect((await verifyCell(c, { subjectDid: grid.subject.did })).ok).toBe(true);
    }
  });

  it("filters reads by key and by subject", async () => {
    const grid = await makeProbeGrid();
    const sink = new MemorySink();
    await sink.write(grid.cells, { subject: grid.subject });

    const filtered = await sink.read({ subject: grid.subject.did, keys: ["alias"] });
    expect(filtered.map((c) => c.key)).toEqual(["alias"]);

    const otherSubject = await sink.read({ subject: "did:web:nobody.example" });
    expect(otherSubject).toHaveLength(0);
  });

  it("deletes by cell id", async () => {
    const grid = await makeProbeGrid();
    const sink = new MemorySink();
    await sink.write(grid.cells, { subject: grid.subject });
    await sink.delete(grid.cells.map((c) => c.id));
    expect(await sink.read({ subject: grid.subject.did })).toHaveLength(0);
  });

  it("reports healthy and advertises capabilities", async () => {
    const sink = new MemorySink();
    expect((await sink.health()).ok).toBe(true);
    expect(sink.capabilities.write).toBe(true);
  });
});
