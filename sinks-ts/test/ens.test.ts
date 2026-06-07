import { describe, it, expect } from "vitest";
import { verifyGrid } from "@gridz/core";
import { EnsSink, makeProbeGrid } from "../src/index.js";
import { FakeEnsBackend } from "./__fixtures__/fake-ens.js";

const NAME = "probe.eth";

describe("EnsSink (offline, fake backend)", () => {
  it("projects a full grid and reconstructs a verifiable grid", async () => {
    const grid = await makeProbeGrid();
    const sink = new EnsSink(new FakeEnsBackend(), NAME);

    const results = await sink.writeGrid(grid);
    expect(results).toHaveLength(grid.cells.length);
    expect(results[0]!.sink_native_uri).toBe(`ens://${NAME}/gridz.__probe__`);

    const round = await sink.readGrid();
    expect(round).not.toBeNull();
    const v = await verifyGrid(round!);
    expect(v.ok).toBe(true);
  });

  it("stores string values bare in their natural key (ENS passthrough)", async () => {
    const grid = await makeProbeGrid();
    const backend = new FakeEnsBackend();
    const sink = new EnsSink(backend, NAME);
    await sink.writeGrid(grid);

    // A plain ENS reader sees the bare handle, not a wrapped blob.
    expect(await backend.getText(NAME, "alias")).toBe("gridz-probe");
    // Object values are JSON-encoded.
    expect(await backend.getText(NAME, "gridz.__probe__")).toContain('"note"');
  });

  it("reads a key subset and skips keys missing their attestation", async () => {
    const grid = await makeProbeGrid();
    const sink = new EnsSink(new FakeEnsBackend(), NAME);
    await sink.writeGrid(grid);

    const subset = await sink.read({ subject: NAME, keys: ["alias", "does-not-exist"] });
    expect(subset.map((c) => c.key)).toEqual(["alias"]);
  });

  it("deletes a cell: it disappears from reads and the manifest", async () => {
    const grid = await makeProbeGrid();
    const sink = new EnsSink(new FakeEnsBackend(), NAME);
    await sink.writeGrid(grid);

    const target = grid.cells.find((c) => c.key === "alias")!;
    await sink.delete([target.id]);

    const remaining = await sink.read({ subject: NAME });
    expect(remaining.map((c) => c.key)).not.toContain("alias");
    expect(remaining.map((c) => c.key)).toContain("gridz.__probe__");
  });

  it("returns null from readGrid when nothing is stored", async () => {
    const sink = new EnsSink(new FakeEnsBackend(), "empty.eth");
    expect(await sink.readGrid()).toBeNull();
    expect((await sink.health()).ok).toBe(true);
  });
});
