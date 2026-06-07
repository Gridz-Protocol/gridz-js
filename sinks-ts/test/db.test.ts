import { describe, it, expect } from "vitest";
import { verifyCell } from "@gridz/core";
import { sqliteSink, SqliteCellStore, SnsSink, sinkRoundTripTest, makeProbeGrid } from "../src/index.js";

describe("SQLite sink (real node:sqlite)", () => {
  it("passes the full round-trip harness", async () => {
    const report = await sinkRoundTripTest(sqliteSink());
    expect(report.ok).toBe(true);
    expect(report.steps.every((s) => s.ok)).toBe(true);
  });

  it("stores, reads with fidelity, and the cells still verify", async () => {
    const grid = await makeProbeGrid();
    const store = new SqliteCellStore();
    await store.init();
    for (const cell of grid.cells) {
      const uri = await store.put(grid.subject.did, cell);
      expect(uri.startsWith("sqlite://")).toBe(true);
    }
    const all = await store.list(grid.subject.did);
    expect(all).toHaveLength(grid.cells.length);
    for (const c of all) expect((await verifyCell(c, { subjectDid: grid.subject.did })).ok).toBe(true);

    const subset = await store.list(grid.subject.did, ["alias"]);
    expect(subset.map((c) => c.key)).toEqual(["alias"]);

    await store.removeByIds("", [grid.cells[0]!.id]);
    expect(await store.list(grid.subject.did)).toHaveLength(grid.cells.length - 1);
    expect(await store.ping()).toBe(true);
    store.close();
  });

  it("upserts (no duplicate rows on re-put)", async () => {
    const grid = await makeProbeGrid();
    const store = new SqliteCellStore();
    const cell = grid.cells[0]!;
    await store.put(grid.subject.did, cell);
    await store.put(grid.subject.did, cell);
    expect(await store.list(grid.subject.did, [cell.key])).toHaveLength(1);
  });
});

describe("SNS sink (preview)", () => {
  it("advertises preview status and refuses operations (never silently no-ops)", async () => {
    const sns = new SnsSink();
    expect(sns.status).toBe("preview");
    expect(sns.capabilities.write).toBe(false);
    expect((await sns.health()).ok).toBe(false);
    await expect(sns.write([], { subject: { type: "human", did: "did:web:x" } })).rejects.toThrow(/preview/);
    await expect(sns.read({ subject: "x" })).rejects.toThrow(/preview/);
    await expect(sns.delete([])).rejects.toThrow(/preview/);
  });
});
