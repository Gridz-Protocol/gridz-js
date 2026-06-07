import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import Ajv2020, { type ValidateFunction } from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { buildGrid } from "../src/index.js";
import {
  exampleEip712Signer,
  exampleSubject,
  exampleTheme,
  EXAMPLE_CHAIN_ID,
  EXAMPLE_RESOLVER,
  NOW,
} from "./__fixtures__/seed.js";

const specPath = (name: string) =>
  fileURLToPath(new URL(`../../../specs/${name}`, import.meta.url));

const load = (name: string) => JSON.parse(readFileSync(specPath(name), "utf8"));

const pos = { x: 0, y: 0, w: 1, h: 1 };

/**
 * Step-1 gate: a Grid produced by the code (step 2) must validate against the
 * canonical JSON Schemas (the spec). This binds implementation to spec.
 */
describe("spec ↔ runtime: built grids validate against grid.schema.json", () => {
  let validate: ValidateFunction;

  beforeAll(() => {
    const ajv = new Ajv2020({ strict: false, allErrors: true });
    addFormats(ajv);
    ajv.addSchema(load("attestation.schema.json"));
    validate = ajv.compile(load("grid.schema.json"));
  });

  it("validates a signed multi-cell grid", async () => {
    const signer = exampleEip712Signer();
    const subject = await exampleSubject(signer);
    const grid = await buildGrid(signer, {
      subject,
      theme: exampleTheme,
      chainId: EXAMPLE_CHAIN_ID,
      verifyingContract: EXAMPLE_RESOLVER,
      now: NOW,
      cells: [
        { id: "c1", key: "alias", value: "gridz-example", position: pos, size: "1x1" },
        {
          id: "c2",
          key: "gridz.poll",
          value: { q: "ship?", options: ["yes"] },
          widget_type: "gridz.poll",
          position: { ...pos, x: 1 },
          size: "2x2",
        },
      ],
    });
    const ok = validate(grid);
    if (!ok) console.error(validate.errors);
    expect(ok).toBe(true);
  });

  it("rejects a grid with an invalid key", async () => {
    const signer = exampleEip712Signer();
    const subject = await exampleSubject(signer);
    const grid = await buildGrid(signer, {
      subject,
      theme: exampleTheme,
      chainId: EXAMPLE_CHAIN_ID,
      verifyingContract: EXAMPLE_RESOLVER,
      now: NOW,
      cells: [{ id: "c1", key: "alias", value: "x", position: pos, size: "1x1" }],
    });
    // "Bad Key" violates the key regex (uppercase + space).
    (grid.cells[0] as { key: string }).key = "Bad Key";
    expect(validate(grid)).toBe(false);
  });

  it("rejects a grid with the wrong schema_version", async () => {
    const signer = exampleEip712Signer();
    const subject = await exampleSubject(signer);
    const grid = await buildGrid(signer, {
      subject,
      theme: exampleTheme,
      chainId: EXAMPLE_CHAIN_ID,
      verifyingContract: EXAMPLE_RESOLVER,
      now: NOW,
      cells: [],
    });
    (grid as { schema_version: string }).schema_version = "gridz/9.9.9";
    expect(validate(grid)).toBe(false);
  });
});
