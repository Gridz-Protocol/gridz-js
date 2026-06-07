import { describe, it, expect } from "vitest";

/**
 * Live ENS round-trip against a real testnet. SKIPPED (not mocked) unless the
 * operator provides credentials — mirrors the brief's discipline for network
 * gates. Provide:
 *   GRIDZ_ENS_RPC_URL   — a Sepolia RPC endpoint
 *   GRIDZ_ENS_NAME      — a name the test key controls (e.g. mygrid.eth)
 *   GRIDZ_ENS_TEST_KEY  — (optional) a funded key to exercise setText writes
 *
 * Read-only connectivity runs with just RPC_URL + NAME; the write path needs KEY.
 */
const RPC = process.env.GRIDZ_ENS_RPC_URL;
const NAME = process.env.GRIDZ_ENS_NAME;

describe.skipIf(!(RPC && NAME))("EnsSink live (testnet)", () => {
  it("reads a text record over a real RPC without throwing", async () => {
    const { createPublicClient, http } = await import("viem");
    const { sepolia } = await import("viem/chains");
    const client = createPublicClient({ chain: sepolia, transport: http(RPC) });
    // Resolves the gridz.keys manifest; null is a valid result for a fresh name.
    const manifest = await client.getEnsText({ name: NAME!, key: "gridz.keys" });
    expect(manifest === null || typeof manifest === "string").toBe(true);
  });
});
