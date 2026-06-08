import { describe, it, expect } from "vitest";
import { valueHash } from "../src/hash.js";
import { verifyEasOnchainCell, cellDisplayValue } from "../src/verifyEas.js";
import type { Cell, Hex } from "../src/types.js";

const CHAIN_ID = 8453;
const EAS = "0x4200000000000000000000000000000000000021" as Hex;
const SCHEMA = "0x394d8e67b1470cbdb7fa6c7d15d15d295ca81d822b55267939751a8a686abb87" as Hex;
const RESOLVER = "0x73c5e3944B780D4927c403d351A4F94875DC57B3" as Hex;
const UID = `0x${"a".repeat(64)}` as Hex;
const ATTESTER = "0xEBE4ceb499Ad95DC1e5662E3a223Ec8cc0a555d9" as Hex;
const GRID_ID = `0x${"b".repeat(64)}` as Hex;
const WIDGET_HASH = `0x${"0".repeat(64)}` as Hex;

function mockCell(value = "Alice"): Cell {
  return {
    id: "alias",
    key: "alias",
    value,
    position: { x: 0, y: 0, w: 1, h: 1 },
    size: "1x1",
    is_visible: true,
    attestation: {
      format: "eas-onchain",
      uid: UID,
      uri: `eas://${UID}`,
      attester: `did:pkh:eip155:${CHAIN_ID}:${ATTESTER.toLowerCase()}`,
      iat: "2024-01-01T00:00:00.000Z",
      value_hash: "0x" + "0".repeat(64),
    },
  };
}

describe("verifyEasOnchainCell", () => {
  it("rejects when value hash does not match", async () => {
    const cell = mockCell();
    const result = await verifyEasOnchainCell(cell, {
      chainId: CHAIN_ID,
      easAddress: EAS,
      readContract: async () => ({}),
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("value-hash-mismatch");
  });

  it("verifies EAS + resolver when RPC data matches", async () => {
    const { encodeAbiParameters, parseAbiParameters } = await import("viem");
    const value = "Alice";
    const cell = mockCell(value);
    cell.attestation.value_hash = valueHash("keccak256", value);

    const data = encodeAbiParameters(
      parseAbiParameters(
        "bytes32 gridId, string key, string valueHashHex, uint64 expiresAt, bytes32 widgetTypeHash",
      ),
      [GRID_ID, "alias", value, 0n, WIDGET_HASH],
    );

    const readContract = async (args: {
      address: Hex;
      functionName: string;
      args?: readonly unknown[];
    }) => {
      if (args.functionName === "getAttestation") {
        return {
          schema: SCHEMA,
          expirationTime: 0n,
          revocationTime: 0n,
          attester: ATTESTER,
          data,
        };
      }
      if (args.functionName === "cellAttestation") return UID;
      if (args.functionName === "text") return value;
      throw new Error(`unexpected call ${args.functionName}`);
    };

    const result = await verifyEasOnchainCell(cell, {
      chainId: CHAIN_ID,
      easAddress: EAS,
      cellSchemaUid: SCHEMA,
      resolverAddress: RESOLVER,
      subjectEns: "alice.gridz.eth",
      readContract,
    });

    expect(result.ok).toBe(true);
    expect(result.status).toBe("verified");
    expect(result.proof).toBe("eas-onchain");
  });

  it("cellDisplayValue stringifies objects", () => {
    expect(cellDisplayValue({ a: 1 })).toBe('{"a":1}');
    expect(cellDisplayValue("plain")).toBe("plain");
  });

  it("rejects revoked EAS attestations", async () => {
    const value = "Alice";
    const cell = mockCell(value);
    cell.attestation.value_hash = valueHash("keccak256", value);

    const result = await verifyEasOnchainCell(cell, {
      chainId: CHAIN_ID,
      easAddress: EAS,
      readContract: async () => ({
        schema: SCHEMA,
        expirationTime: 0n,
        revocationTime: 1n,
        attester: ATTESTER,
        data: "0x",
      }),
    });

    expect(result.status).toBe("expired");
    expect(result.reason).toBe("eas-revoked");
  });

  it("rejects EAS key mismatches", async () => {
    const { encodeAbiParameters, parseAbiParameters } = await import("viem");
    const value = "Alice";
    const cell = mockCell(value);
    cell.attestation.value_hash = valueHash("keccak256", value);
    const data = encodeAbiParameters(
      parseAbiParameters(
        "bytes32 gridId, string key, string valueHashHex, uint64 expiresAt, bytes32 widgetTypeHash",
      ),
      [GRID_ID, "wrong-key", value, 0n, WIDGET_HASH],
    );

    const result = await verifyEasOnchainCell(cell, {
      chainId: CHAIN_ID,
      easAddress: EAS,
      readContract: async () => ({
        schema: SCHEMA,
        expirationTime: 0n,
        revocationTime: 0n,
        attester: ATTESTER,
        data,
      }),
    });

    expect(result.reason).toBe("eas-key-mismatch");
  });

  it("rejects schema UID mismatches", async () => {
    const value = "Alice";
    const cell = mockCell(value);
    cell.attestation.value_hash = valueHash("keccak256", value);

    const result = await verifyEasOnchainCell(cell, {
      chainId: CHAIN_ID,
      easAddress: EAS,
      cellSchemaUid: SCHEMA,
      readContract: async () => ({
        schema: `0x${"c".repeat(64)}`,
        expirationTime: 0n,
        revocationTime: 0n,
        attester: ATTESTER,
        data: "0x",
      }),
    });

    expect(result.ok).toBe(false);
    expect(result.reason).toBe("eas-schema-mismatch");
  });
});
