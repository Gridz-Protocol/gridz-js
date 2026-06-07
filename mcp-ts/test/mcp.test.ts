import { describe, it, expect } from "vitest";
import { LocalEip712Signer, buildGrid, verifyCell, type Grid, type Hex } from "@gridz/core";
import {
  MemoryStore,
  cellPrepareWrite,
  cellAttachSignature,
  gridVerify,
  sinkPublish,
  schemaSuggestKey,
  bootstrapListTemplates,
  bootstrapFromTemplate,
  identityListSigners,
  createServer,
} from "../src/index.js";

const CHAIN_ID = 11155111;
const RESOLVER = "0x000000000000000000000000000000000000c0de" as Hex;
const signer = LocalEip712Signer.fromPrivateKey(`0x${"22".repeat(32)}`, CHAIN_ID);

describe("cell.prepare_write → sign → attach_signature → verify", () => {
  it("never signs server-side, yet yields a verifiable cell", async () => {
    const did = await signer.did();
    const prepared = cellPrepareWrite({
      subject_did: did,
      key: "alias",
      value: "gridz-agent",
      chain_id: CHAIN_ID,
      verifying_contract: RESOLVER,
    });
    expect(prepared.next_action).toBeUndefined();

    // Client signs the prepared typed data (uint64 fields → bigint).
    const { signature } = await signer.signTypedData({
      domain: prepared.typed_data.domain,
      types: prepared.typed_data.types,
      primaryType: prepared.typed_data.primaryType,
      message: {
        ...prepared.typed_data.message,
        expiresAt: BigInt(prepared.typed_data.message.expiresAt),
        nonce: BigInt(prepared.typed_data.message.nonce),
      },
    });

    const cell = cellAttachSignature({ prepared, signature, attester: did });
    expect(cell.key).toBe("alias");
    const r = await verifyCell(cell, { subjectDid: did });
    expect(r.ok).toBe(true);
  });

  it("returns a 1claw chaining hint when configured", () => {
    const prepared = cellPrepareWrite({
      subject_did: "did:oneclaw:agent_1",
      key: "agent-context",
      value: "ctx",
      chain_id: CHAIN_ID,
      verifying_contract: RESOLVER,
      oneclaw: { agent_id: "agent_1" },
    });
    expect(prepared.next_action).toMatchObject({ next_action: "sign_typed_data", server: "1claw" });
  });
});

describe("store-backed reads + sink publish", () => {
  const grid: Grid = {
    schema_version: "gridz/1.0.0",
    subject: { type: "human", did: "did:web:example" },
    theme: {
      background_type: "solid",
      background_value: "#000",
      accent_color: "#fff",
      text_color: "#fff",
      card_style: "rounded",
      card_background: "#111",
      font_family: "sans",
    },
    cells: [],
    root_attestation: {
      format: "eip712-raw",
      uid: `0x${"00".repeat(32)}`,
      uri: "data://inline/x",
      attester: "did:web:example",
      iat: "2026-01-01T00:00:00.000Z",
      value_hash: `0x${"00".repeat(32)}`,
    },
  };

  it("reads grids/cells from the store and publishes to memory", async () => {
    const store = new MemoryStore();
    expect(store.getGrid("did:web:example")).toBeNull();
    store.putGrid("did:web:example", grid);
    expect(store.getGrid("did:web:example")?.subject.did).toBe("did:web:example");
    expect(store.getCell("did:web:example", "missing")).toBeNull();

    const pub = await sinkPublish(store, { subject: "did:web:example", sink: "memory" });
    expect(pub.ok).toBe(true);
    expect((await sinkPublish(store, { subject: "did:web:example", sink: "ens" })).ok).toBe(false);
    expect((await sinkPublish(store, { subject: "nope", sink: "memory" })).ok).toBe(false);
  });

  it("verifies a real grid via the handler", async () => {
    const real = await buildGrid(signer, {
      subject: { type: "human", did: await signer.did() },
      theme: grid.theme,
      chainId: CHAIN_ID,
      verifyingContract: RESOLVER,
      now: new Date("2026-01-01T00:00:00.000Z"),
      cells: [{ id: "c1", key: "alias", value: "a", position: { x: 0, y: 0, w: 1, h: 1 }, size: "1x1" }],
    });
    const v = await gridVerify(real);
    expect(v.ok).toBe(true);
  });
});

describe("schema/bootstrap/identity helpers", () => {
  it("suggests keys from descriptions", () => {
    expect(schemaSuggestKey("my github profile").suggested_key).toBe("com.github");
    expect(schemaSuggestKey("a poll for visitors").suggested_key).toBe("gridz.poll");
    expect(schemaSuggestKey("something totally novel").suggested_key.startsWith("gridz.")).toBe(true);
  });

  it("lists and materializes templates (shape only)", () => {
    expect(bootstrapListTemplates().some((t) => t.name === "minimal")).toBe(true);
    const tmpl = bootstrapFromTemplate("minimal") as { cells: { _needs_input?: boolean }[] };
    expect(tmpl.cells.every((c) => c._needs_input)).toBe(true);
    expect(bootstrapFromTemplate("nope")).toMatchObject({ error: "unknown_template" });
  });

  it("never reports server-side signers", () => {
    expect(identityListSigners().signers).toHaveLength(0);
  });
});

describe("server wiring", () => {
  it("constructs without throwing", () => {
    const server = createServer();
    expect(server).toBeTruthy();
  });
});
