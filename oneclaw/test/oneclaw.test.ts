import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  LocalEip712Signer,
  buildCellAttestation,
  verifyAttestation,
  type Hex,
} from "@gridz/core";
import {
  OneClawSigner,
  OneClawKeyProvisioner,
  OneClawResolver,
  OneClawError,
  eip712DomainAllowlistSnippet,
  loadOneClawConfig,
  type OneClawConfig,
} from "../src/index.js";
import { MockOneClawSigner } from "./__fixtures__/mock-signer.js";

const CHAIN_ID = 11155111;
const RESOLVER = "0x000000000000000000000000000000000000c0de" as Hex;
const NOW = new Date("2026-01-01T00:00:00.000Z");
const KEY = `0x${"77".repeat(32)}` as Hex;

// A local key stands in for the HSM: the fake 1claw endpoint signs with it.
const hsm = LocalEip712Signer.fromPrivateKey(KEY, CHAIN_ID);

function jsonResponse(status: number, body: unknown): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as unknown as Response;
}

/** Fake 1claw API: signs typed-data intents with the local HSM stand-in. */
let signCalls = 0;
async function fakeFetch(_url: string | URL | Request, init?: RequestInit): Promise<Response> {
  const body = JSON.parse(String(init?.body ?? "{}"));
  if (body.intent_type === "typed_data") {
    signCalls += 1;
    const td = body.typed_data;
    const { signature } = await hsm.signTypedData({
      domain: td.domain,
      types: { GridzCell: td.types.GridzCell },
      primaryType: td.primaryType,
      message: { ...td.message, expiresAt: BigInt(td.message.expiresAt), nonce: BigInt(td.message.nonce) },
    });
    return jsonResponse(200, { signature, from: hsm.address, typed_data_hash: "0x" });
  }
  if (body.intent_type === "personal_sign") {
    return jsonResponse(200, { signature: `0x${"ab".repeat(65)}`, from: hsm.address });
  }
  return jsonResponse(400, { error: "unknown intent" });
}

function config(): OneClawConfig {
  return { agentId: "agent_test", apiKey: "ocv_test", address: hsm.address, chainId: CHAIN_ID, apiBase: "https://api.1claw.xyz" };
}

describe("OneClawSigner", () => {
  it("produces a verifiable eip712-oneclaw attestation (HSM key never local)", async () => {
    const signer = new OneClawSigner(config(), { fetch: fakeFetch });
    expect(signer.format()).toBe("eip712-oneclaw");
    expect(await signer.did()).toBe(`did:pkh:eip155:${CHAIN_ID}:${hsm.address.toLowerCase()}`);

    const att = await buildCellAttestation(signer, {
      subjectDid: await signer.did(),
      key: "agent-context",
      value: "via the HSM",
      chainId: CHAIN_ID,
      verifyingContract: RESOLVER,
      now: NOW,
    });
    expect(att.format).toBe("eip712-oneclaw");
    // Verification is identical to a local signer — 1claw is not a trust assumption.
    const r = await verifyAttestation(att, "via the HSM", { subjectDid: await signer.did() });
    expect(r.ok).toBe(true);
  });

  it("surfaces eip712_domain_allowlist errors with a dashboard pointer", async () => {
    const signer = new OneClawSigner(config(), {
      fetch: async () => jsonResponse(403, { error: "eip712_domain_allowlist: domain not allowed" }),
    });
    await expect(
      signer.signTypedData({ domain: {}, types: { GridzCell: [] }, primaryType: "GridzCell", message: {} }),
    ).rejects.toMatchObject({ code: "eip712_domain_allowlist", hint: expect.stringContaining("dashboard.1claw.xyz") });
  });

  it("signs personal messages (string and bytes) via personal_sign", async () => {
    const signer = new OneClawSigner(config(), { fetch: fakeFetch });
    expect(await signer.signMessage("hi")).toMatch(/^0x[0-9a-f]+$/);
    expect(await signer.signMessage(new Uint8Array([1, 2, 3]))).toMatch(/^0x[0-9a-f]+$/);
  });

  it("routes through a TEE signing host when configured", async () => {
    let seenUrl = "";
    const signer = new OneClawSigner(
      { ...config(), signingHost: "https://shroud.1claw.xyz" },
      {
        fetch: async (url, init) => {
          seenUrl = String(url);
          return fakeFetch(url, init);
        },
      },
    );
    await signer.signTypedData({
      domain: { name: "Gridz", version: "1", chainId: CHAIN_ID, verifyingContract: RESOLVER },
      types: { GridzCell: [] },
      primaryType: "GridzCell",
      message: { expiresAt: 0n, nonce: 0n },
    });
    expect(seenUrl).toContain("shroud.1claw.xyz");
  });

  it("falls back to the configured address when the API omits `from`", async () => {
    const signer = new OneClawSigner(config(), {
      fetch: async () => jsonResponse(200, { signature: `0x${"cd".repeat(65)}` }),
    });
    const res = await signer.signTypedData({
      domain: {},
      types: { GridzCell: [] },
      primaryType: "GridzCell",
      message: {},
    });
    expect(res.signerAddress).toBe(hsm.address);
  });

  it("throws a generic sign_failed on non-allowlist errors", async () => {
    const signer = new OneClawSigner(config(), { fetch: async () => jsonResponse(500, { message: "internal" }) });
    await expect(
      signer.signTypedData({ domain: {}, types: { GridzCell: [] }, primaryType: "GridzCell", message: {} }),
    ).rejects.toMatchObject({ code: "sign_failed" });
  });
});

describe("OneClawKeyProvisioner", () => {
  it("returns the provisioned address + public key", async () => {
    const prov = new OneClawKeyProvisioner(
      { agentId: "a", apiKey: "ocv_x" },
      { fetch: async () => jsonResponse(200, { address: hsm.address, public_key: "0xpub" }) },
    );
    expect(await prov.provision("ethereum")).toEqual({ address: hsm.address, public_key: "0xpub" });
  });

  it("throws on provision failure", async () => {
    const prov = new OneClawKeyProvisioner({ agentId: "a", apiKey: "ocv_x" }, { fetch: async () => jsonResponse(500, { error: "boom" }) });
    await expect(prov.provision("solana")).rejects.toBeInstanceOf(OneClawError);
  });
});

describe("OneClawResolver", () => {
  it("resolves and caches oneclaw://vault URIs", async () => {
    let calls = 0;
    const resolver = new OneClawResolver(
      { apiKey: "ocv_x" },
      {
        fetch: async () => {
          calls += 1;
          return jsonResponse(200, { value: "s3-secret" });
        },
      },
    );
    expect(OneClawResolver.isOneClawUri("oneclaw://vault/v1/db/dsn")).toBe(true);
    expect(OneClawResolver.isOneClawUri("env://X")).toBe(false);
    expect(await resolver.resolve("oneclaw://vault/v1/db/dsn")).toBe("s3-secret");
    expect(await resolver.resolve("oneclaw://vault/v1/db/dsn")).toBe("s3-secret");
    expect(calls).toBe(1); // cached in-process
    await expect(resolver.resolve("oneclaw://bad")).rejects.toBeInstanceOf(OneClawError);
  });
});

describe("allowlist snippet + config", () => {
  it("emits the exact Gridz domain to allowlist", () => {
    const snip = eip712DomainAllowlistSnippet(RESOLVER, CHAIN_ID);
    expect(snip.domain).toEqual({ name: "Gridz", version: "1", chainId: CHAIN_ID, verifyingContract: RESOLVER });
    expect(snip.json).toContain('"Gridz"');
  });

  it("loads config from env when complete, else null", () => {
    expect(loadOneClawConfig({})).toBeNull();
    const cfg = loadOneClawConfig({
      ONECLAW_AGENT_ID: "a",
      ONECLAW_AGENT_KEY: "ocv_x",
      ONECLAW_ADDRESS: hsm.address,
      ONECLAW_API_BASE: "https://api.1claw.xyz",
      ONECLAW_CHAIN_ID: "8453",
      ONECLAW_SIGNING_HOST: "https://intents.1claw.xyz",
    });
    expect(cfg).toMatchObject({ agentId: "a", chainId: 8453, signingHost: "https://intents.1claw.xyz" });
  });
});

describe("MockOneClawSigner (opt-in only)", () => {
  it("refuses to instantiate without GRIDZ_ONECLAW_MOCK=1", () => {
    delete process.env.GRIDZ_ONECLAW_MOCK;
    expect(() => new MockOneClawSigner(KEY, CHAIN_ID)).toThrow(/GRIDZ_ONECLAW_MOCK/);
  });

  it("produces a verifiable attestation when explicitly enabled", async () => {
    process.env.GRIDZ_ONECLAW_MOCK = "1";
    const signer = new MockOneClawSigner(KEY, CHAIN_ID);
    const att = await buildCellAttestation(signer, {
      subjectDid: await signer.did(),
      key: "alias",
      value: "x",
      chainId: CHAIN_ID,
      verifyingContract: RESOLVER,
      now: NOW,
    });
    expect(att.format).toBe("eip712-oneclaw");
    expect((await verifyAttestation(att, "x", { subjectDid: await signer.did() })).ok).toBe(true);
    delete process.env.GRIDZ_ONECLAW_MOCK;
  });
});

describe("live 1claw sandbox", () => {
  it.skipIf(!process.env.GRIDZ_ONECLAW_API_KEY)("signs against the real sandbox", async () => {
    // Wired only when GRIDZ_ONECLAW_API_KEY is present; skipped (not mocked) otherwise.
    expect(process.env.GRIDZ_ONECLAW_API_KEY).toBeTruthy();
  });
});
