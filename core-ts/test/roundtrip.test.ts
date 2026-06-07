import { describe, it, expect } from "vitest";
import {
  buildCellAttestation,
  verifyAttestation,
  buildGrid,
  verifyGrid,
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

describe("EIP-712 cell attestation round-trip", () => {
  it("signs and verifies a cell", async () => {
    const signer = exampleEip712Signer();
    const did = await signer.did();
    const att = await buildCellAttestation(signer, {
      subjectDid: did,
      key: "alias",
      value: "gridz-example",
      chainId: EXAMPLE_CHAIN_ID,
      verifyingContract: EXAMPLE_RESOLVER,
      now: NOW,
    });
    expect(att.format).toBe("eip712-raw");
    const r = await verifyAttestation(att, "gridz-example", { subjectDid: did });
    expect(r).toMatchObject({ ok: true, status: "verified", attester: did });
  });

  it("fails when the value is tampered", async () => {
    const signer = exampleEip712Signer();
    const did = await signer.did();
    const att = await buildCellAttestation(signer, {
      subjectDid: did,
      key: "alias",
      value: "original",
      chainId: EXAMPLE_CHAIN_ID,
      verifyingContract: EXAMPLE_RESOLVER,
      now: NOW,
    });
    const r = await verifyAttestation(att, "tampered", {});
    expect(r).toMatchObject({ ok: false, status: "failed", reason: "value-hash-mismatch" });
  });

  it("rejects an unauthorized signer when subjectDid differs", async () => {
    const signer = exampleEip712Signer();
    const att = await buildCellAttestation(signer, {
      subjectDid: await signer.did(),
      key: "alias",
      value: "x",
      chainId: EXAMPLE_CHAIN_ID,
      verifyingContract: EXAMPLE_RESOLVER,
      now: NOW,
    });
    const r = await verifyAttestation(att, "x", { subjectDid: "did:pkh:eip155:1:0xsomeoneelse" });
    expect(r).toMatchObject({ ok: false, reason: "unauthorized-signer" });
  });

  it("reports expired when exp is in the past", async () => {
    const signer = exampleEip712Signer();
    const did = await signer.did();
    const att = await buildCellAttestation(signer, {
      subjectDid: did,
      key: "alias",
      value: "x",
      expiresAt: new Date("2026-02-01T00:00:00Z"),
      chainId: EXAMPLE_CHAIN_ID,
      verifyingContract: EXAMPLE_RESOLVER,
      now: NOW,
    });
    const r = await verifyAttestation(att, "x", { now: new Date("2026-03-01T00:00:00Z") });
    expect(r).toMatchObject({ ok: false, status: "expired" });
  });
});

describe("Ed25519 / JWS cell attestation round-trip", () => {
  it("signs and verifies a cell via did:key", async () => {
    const signer = exampleEd25519Signer();
    const did = await signer.did();
    expect(did.startsWith("did:key:z")).toBe(true);
    const att = await buildCellAttestation(signer, {
      subjectDid: did,
      key: "agent-context",
      value: { role: "example" },
      now: NOW,
    });
    expect(att.format).toBe("jws-ed25519");
    const r = await verifyAttestation(att, { role: "example" }, { subjectDid: did });
    expect(r.ok).toBe(true);
  });

  it("fails on a corrupted JWS signature", async () => {
    const signer = exampleEd25519Signer();
    const did = await signer.did();
    const att = await buildCellAttestation(signer, {
      subjectDid: did,
      key: "agent-context",
      value: "v",
      now: NOW,
    });
    // Flip one byte of the decoded signature, re-encode as valid base64url:
    // exercises the genuine ed25519 bad-signature branch, not a parse error.
    const bundle = JSON.parse(
      Buffer.from(att.payload!, "base64url").toString("utf8"),
    ) as { jws: string };
    const parts = bundle.jws.split(".");
    const sig = Buffer.from(parts[2]!, "base64url");
    sig[0] = sig[0]! ^ 0xff;
    parts[2] = sig.toString("base64url");
    bundle.jws = parts.join(".");
    const tampered = {
      ...att,
      payload: Buffer.from(JSON.stringify(bundle), "utf8").toString("base64url"),
    };
    const r = await verifyAttestation(tampered, "v", {});
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("bad-signature");
  });
});

describe("full Grid build + verify", () => {
  it("builds a 3-cell grid and verifies it end to end", async () => {
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
        { id: "c2", key: "description", value: "a seed-derived example grid", position: { ...pos, x: 1 }, size: "2x1" },
        { id: "c3", key: "url", value: "https://gridz.dev", position: { ...pos, y: 1 }, size: "1x1" },
      ],
    });
    const r = await verifyGrid(grid);
    expect(r.ok).toBe(true);
    expect(r.cells.every((c) => c.result.ok)).toBe(true);
    expect(r.root.ok).toBe(true);
  });

  it("detects a dropped cell via the root merkle/count mismatch", async () => {
    const signer = exampleEip712Signer();
    const subject = await exampleSubject(signer);
    const grid = await buildGrid(signer, {
      subject,
      theme: exampleTheme,
      chainId: EXAMPLE_CHAIN_ID,
      verifyingContract: EXAMPLE_RESOLVER,
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

  it("builds and verifies an empty grid (zero cells)", async () => {
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
    const r = await verifyGrid(grid);
    expect(r.ok).toBe(true);
  });
});
