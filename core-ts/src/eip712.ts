/**
 * EIP-712 typed-data definitions. This is a runtime copy of
 * specs/eip712-types.ts; test/eip712-drift.test.ts asserts byte-equality so the
 * two never diverge. The specs file remains the source of truth.
 */
import type { Hex } from "./types.js";

export interface TypedDataField {
  name: string;
  type: string;
}

export interface GridzDomain {
  name: "Gridz";
  version: "1";
  chainId: number;
  verifyingContract: Hex;
}

export function gridzDomain(chainId: number, verifyingContract: Hex): GridzDomain {
  return { name: "Gridz", version: "1", chainId, verifyingContract };
}

export const GridzCell: TypedDataField[] = [
  { name: "gridId", type: "bytes32" },
  { name: "key", type: "string" },
  { name: "valueHashHex", type: "string" },
  { name: "widgetTypeHash", type: "bytes32" },
  { name: "expiresAt", type: "uint64" },
  { name: "nonce", type: "uint64" },
];

export const GridzRoot: TypedDataField[] = [
  { name: "gridId", type: "bytes32" },
  { name: "merkleRoot", type: "bytes32" },
  { name: "schemaVersion", type: "string" },
  { name: "cellCount", type: "uint64" },
  { name: "issuedAt", type: "uint64" },
];

export const EIP712_DOMAIN_TYPE: TypedDataField[] = [
  { name: "name", type: "string" },
  { name: "version", type: "string" },
  { name: "chainId", type: "uint256" },
  { name: "verifyingContract", type: "address" },
];

export const PRIMARY_TYPE_CELL = "GridzCell" as const;
export const PRIMARY_TYPE_ROOT = "GridzRoot" as const;

export const EAS_SCHEMAS = {
  cell: {
    name: "gridz.cell.v1",
    schema:
      "bytes32 gridId, string key, string valueHashHex, uint64 expiresAt, bytes32 widgetTypeHash",
    revocable: true,
  },
  root: {
    name: "gridz.root.v1",
    schema: "bytes32 gridId, bytes32 merkleRoot, string schemaVersion",
    revocable: true,
  },
} as const;

/** The concrete signed messages. uint64 fields are bigint for viem. */
export interface CellMessage {
  gridId: Hex;
  key: string;
  valueHashHex: Hex;
  widgetTypeHash: Hex;
  expiresAt: bigint;
  nonce: bigint;
}

export interface RootMessage {
  gridId: Hex;
  merkleRoot: Hex;
  schemaVersion: string;
  cellCount: bigint;
  issuedAt: bigint;
}

/** uint64 field names per primary type — used to (de)serialize bigints in payloads. */
export const UINT64_FIELDS = {
  GridzCell: ["expiresAt", "nonce"],
  GridzRoot: ["cellCount", "issuedAt"],
} as const;
