import { describe, it, expect } from "vitest";
import { MemorySink, EnsSink, sinkRoundTripTest } from "../src/index.js";
import { FakeEnsBackend } from "./__fixtures__/fake-ens.js";

describe("sinkRoundTripTest (backs `gridz sink test`)", () => {
  it("passes against MemorySink", async () => {
    const report = await sinkRoundTripTest(new MemorySink());
    expect(report.ok).toBe(true);
    expect(report.steps.map((s) => s.name)).toEqual(["health", "write", "read", "verify", "delete"]);
  });

  it("passes against EnsSink with a fake backend", async () => {
    const report = await sinkRoundTripTest(new EnsSink(new FakeEnsBackend(), "probe.eth"));
    expect(report.ok).toBe(true);
    expect(report.steps.every((s) => s.ok)).toBe(true);
  });

  it("fails the read step when a sink corrupts values", async () => {
    // A deliberately broken sink that mangles values on read.
    const broken = new MemorySink();
    const orig = broken.read.bind(broken);
    broken.read = async (q) => {
      const cells = await orig(q);
      return cells.map((c) => ({ ...c, value: "corrupted" }));
    };
    const report = await sinkRoundTripTest(broken);
    expect(report.ok).toBe(false);
    expect(report.steps.find((s) => s.name === "read")!.ok).toBe(false);
  });
});
