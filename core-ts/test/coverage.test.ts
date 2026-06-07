import { describe, it, expect } from "vitest";
import { base58 } from "@scure/base";
import {
  algoForFormat,
  buildCellAttestation,
  buildRootAttestation,
  buildGrid,
  verifyGrid,
  verifyAttestation,
  verifyCell,
  valueHash,
  widgetTypeHash,
  gridId,
  gridzDomain,
  GridzCell,
  PRIMARY_TYPE_CELL,
  eip712CellAttestation,
  publicKeyFromDidKey,
  Ed25519Signer,
  GridzError,
  ZERO32,
  SCHEMA_VERSION,
  type Signer,
  type AttestationRef,
  type Cell,
} from "../src/index.js";
import {
  exampleEip712Signer,
  exampleEd25519Signer,
  exampleSubject,
  exampleTheme,
  EXAMPLE_CHAIN_ID,
  EXAMPLE_RESOLVER,
  NOW,
} from "./__fixtures__/seed.js";

const pos = { x: 0, y: 0, w: 1, h: 1 };

describe("algoForFormat covers every format", () => {
  it("maps EVM formats to keccak256 and non-EVM to sha256", () => {
    expect(algoForFormat("eas-onchain")).toBe("keccak256");
    expect(algoForFormat("eas-offchain")).toBe("keccak256");
    expect(algoForFormat("eip712-raw")).toBe("keccak256");
    expect(algoForFormat("eip712-oneclaw")).toBe("keccak256");
    expect(algoForFormat("jws-ed25519")).toBe("sha256");
    expect(algoForFormat("cose-webauthn")).toBe("sha256");
  });
});

describe("signer adapters — error & message paths", () => {
  it("LocalEip712Signer signs raw messages (string and bytes)", async () => {
    const s = exampleEip712Signer();
    expect(await s.signMessage("hello")).toMatch(/^0x[0-9a-f]+$/);
    expect(await s.signMessage(new Uint8Array([1, 2, 3]))).toMatch(/^0x[0-9a-f]+$/);
    expect(s.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
  });

  it("Ed25519Signer rejects EIP-712 and a bad seed length", async () => {
    const s = exampleEd25519Signer();
    await expect(s.signTypedData()).rejects.toBeInstanceOf(GridzError);
    expect(await s.signMessage("hi")).toMatch(/^0x[0-9a-f]+$/);
    expect(() => new Ed25519Signer(new Uint8Array(31))).toThrow(GridzError);
  });

  it("publicKeyFromDidKey rejects non-did:key and wrong multicodec", () => {
    expect(() => publicKeyFromDidKey("did:web:gridz.dev")).toThrow(GridzError);
    const wrongCodec = `did:key:z${base58.encode(new Uint8Array([0x01, 0x02, ...new Array(32).fill(0)]))}`;
    expect(() => publicKeyFromDidKey(wrongCodec)).toThrow(GridzError);
  });
});

describe("authoring guards", () => {
  it("EIP-712 cell attestation requires a domain", async () => {
    const s = exampleEip712Signer();
    await expect(
      buildCellAttestation(s, { subjectDid: await s.did(), key: "alias", value: "x", now: NOW }),
    ).rejects.toMatchObject({ code: "attest/missing-domain" });
  });

  it("EIP-712 root attestation requires a domain", async () => {
    const s = exampleEip712Signer();
    await expect(
      buildRootAttestation(s, { subjectDid: await s.did(), merkleRoot: ZERO32, cellCount: 0, now: NOW }),
    ).rejects.toMatchObject({ code: "attest/missing-domain" });
  });

  it("an unsupported signer format cannot author", async () => {
    const fake: Signer = {
      did: async () => "did:web:gridz.dev",
      signTypedData: async () => ({ signature: "0x", signerAddress: "0x" }),
      signMessage: async () => "0x",
      format: () => "cose-webauthn",
    };
    await expect(
      buildCellAttestation(fake, { subjectDid: "did:web:gridz.dev", key: "alias", value: "x", now: NOW }),
    ).rejects.toMatchObject({ code: "attest/unsupported-format" });
    await expect(
      buildRootAttestation(fake, { subjectDid: "did:web:gridz.dev", merkleRoot: ZERO32, cellCount: 0, now: NOW }),
    ).rejects.toMatchObject({ code: "attest/unsupported-format" });
  });
});

describe("verifier — unsupported, time bounds, and cell-level expiry", () => {
  it("returns 'unsupported' for a format with no inline payload", async () => {
    const value = { a: 1 };
    const att: AttestationRef = {
      format: "eas-onchain",
      uid: "0x" + "ab".repeat(32),
      uri: "eas://11155111/0x" + "ab".repeat(32),
      attester: "did:pkh:eip155:1:0x0000000000000000000000000000000000000001",
      iat: NOW.toISOString(),
      value_hash: valueHash("keccak256", value),
    };
    const r = await verifyAttestation(att, value);
    expect(r.status).toBe("unsupported");
  });

  it("returns not-yet-valid when nbf is in the future", async () => {
    const s = exampleEip712Signer();
    const did = await s.did();
    const att = await buildCellAttestation(s, {
      subjectDid: did,
      key: "alias",
      value: "x",
      chainId: EXAMPLE_CHAIN_ID,
      verifyingContract: EXAMPLE_RESOLVER,
      now: NOW,
    });
    const withNbf = { ...att, nbf: "2030-01-01T00:00:00.000Z" };
    const r = await verifyAttestation(withNbf, "x", { now: NOW });
    expect(r).toMatchObject({ ok: false, reason: "not-yet-valid" });
  });

  it("flags a cell whose own expires_at is past even if the attestation is valid", async () => {
    const s = exampleEip712Signer();
    const did = await s.did();
    const att = await buildCellAttestation(s, {
      subjectDid: did,
      key: "alias",
      value: "x",
      chainId: EXAMPLE_CHAIN_ID,
      verifyingContract: EXAMPLE_RESOLVER,
      now: NOW,
    });
    const cell: Cell = {
      id: "c1",
      key: "alias",
      value: "x",
      position: pos,
      size: "1x1",
      is_visible: true,
      attestation: att,
      expires_at: "2026-02-01T00:00:00.000Z",
    };
    const r = await verifyCell(cell, { subjectDid: did, now: new Date("2026-03-01T00:00:00Z") });
    expect(r).toMatchObject({ ok: false, status: "expired", reason: "cell-expired" });
  });

  it("rejects a root payload that was swapped for a different signature", async () => {
    const s = exampleEip712Signer();
    const subject = await exampleSubject(s);
    const grid = await buildGrid(s, {
      subject,
      theme: exampleTheme,
      chainId: EXAMPLE_CHAIN_ID,
      verifyingContract: EXAMPLE_RESOLVER,
      now: NOW,
      cells: [{ id: "c1", key: "alias", value: "a", position: pos, size: "1x1" }],
    });
    const broken = { ...grid, root_attestation: { ...grid.root_attestation, payload: undefined } };
    const r = await verifyGrid(broken);
    expect(r.root.status).toBe("unsupported");
    expect(r.ok).toBe(false);
  });
});

describe("eip712CellAttestation (detached-signature / MCP flow)", () => {
  it("assembles a verifiable attestation from a detached signature", async () => {
    const signer = exampleEip712Signer();
    const did = await signer.did();
    const value = { hello: "world" };
    const message = {
      gridId: gridId("keccak256", did, SCHEMA_VERSION),
      key: "gridz.note",
      valueHashHex: valueHash("keccak256", value),
      widgetTypeHash: widgetTypeHash("keccak256", undefined),
      expiresAt: 0n,
      nonce: 0n,
    };
    const domain = gridzDomain(EXAMPLE_CHAIN_ID, EXAMPLE_RESOLVER);
    const { signature } = await signer.signTypedData({
      domain,
      types: { GridzCell },
      primaryType: PRIMARY_TYPE_CELL,
      message: message as unknown as Record<string, unknown>,
    });
    const att = eip712CellAttestation({ domain, message, signature, attester: did, now: NOW });
    const r = await verifyAttestation(att, value, { subjectDid: did });
    expect(r.ok).toBe(true);
  });
});

describe("Ed25519 full-grid path", () => {
  it("builds and verifies a grid with hidden cells, widget types, and expiry", async () => {
    const s = exampleEd25519Signer();
    const subject = await exampleSubject(s);
    const grid = await buildGrid(s, {
      subject,
      theme: exampleTheme,
      now: NOW,
      cells: [
        {
          id: "c1",
          key: "gridz.poll",
          value: { q: "ship?", options: ["yes", "also yes"] },
          widget_type: "gridz.poll",
          position: pos,
          size: "2x2",
          is_visible: false,
          expires_at: new Date("2030-01-01T00:00:00Z"),
          nonce: 7n,
        },
        { id: "c2", key: "agent-context", value: "example agent", position: pos, size: "1x1" },
      ],
    });
    const r = await verifyGrid(grid);
    expect(r.ok).toBe(true);
    expect(r.cells.map((c) => c.result.ok)).toEqual([true, true]);
  });

  it("detects a dropped cell in an Ed25519 grid (jws root path)", async () => {
    const s = exampleEd25519Signer();
    const subject = await exampleSubject(s);
    const grid = await buildGrid(s, {
      subject,
      theme: exampleTheme,
      now: NOW,
      cells: [
        { id: "c1", key: "alias", value: "a", position: pos, size: "1x1" },
        { id: "c2", key: "url", value: "https://gridz.dev", position: pos, size: "1x1" },
      ],
    });
    const tampered = { ...grid, cells: grid.cells.slice(0, 1) };
    const r = await verifyGrid(tampered);
    expect(r.ok).toBe(false);
    expect(r.root.ok).toBe(false);
  });
});
