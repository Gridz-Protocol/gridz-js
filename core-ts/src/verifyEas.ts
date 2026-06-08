import { decodeAbiParameters, namehash, parseAbiParameters } from "viem";
import type { Cell, Hex } from "./types.js";
import { algoForFormat, valueHash } from "./hash.js";
import { ZERO32 } from "./merkle.js";
import type { VerifyResult } from "./verify.js";

const CELL_SCHEMA_PARAMS = parseAbiParameters(
  "bytes32 gridId, string key, string valueHashHex, uint64 expiresAt, bytes32 widgetTypeHash",
);

const EAS_ABI = [
  {
    name: "getAttestation",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "uid", type: "bytes32" }],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "uid", type: "bytes32" },
          { name: "schema", type: "bytes32" },
          { name: "time", type: "uint64" },
          { name: "expirationTime", type: "uint64" },
          { name: "revocationTime", type: "uint64" },
          { name: "refUID", type: "bytes32" },
          { name: "recipient", type: "address" },
          { name: "attester", type: "address" },
          { name: "revocable", type: "bool" },
          { name: "data", type: "bytes" },
        ],
      },
    ],
  },
] as const;

const RESOLVER_ABI = [
  {
    name: "text",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "node", type: "bytes32" },
      { name: "key", type: "string" },
    ],
    outputs: [{ type: "string" }],
  },
  {
    name: "cellAttestation",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "node", type: "bytes32" },
      { name: "key", type: "string" },
    ],
    outputs: [{ type: "bytes32" }],
  },
] as const;

export interface EasReadContract {
  (args: {
    address: Hex;
    abi: readonly unknown[];
    functionName: string;
    args?: readonly unknown[];
  }): Promise<unknown>;
}

/** RPC context for verifying `eas-onchain` cells against Base EAS + GridzResolver. */
export interface EasVerifyContext {
  chainId: number;
  easAddress: Hex;
  cellSchemaUid?: Hex;
  resolverAddress?: Hex;
  subjectEns?: string;
  readContract: EasReadContract;
}

function fail(reason: string, attester?: string): VerifyResult {
  return { ok: false, status: "failed", reason, attester };
}

export function cellDisplayValue(value: unknown): string {
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

export function easAttesterDid(chainId: number, address: string): string {
  return `did:pkh:eip155:${chainId}:${address.toLowerCase()}`;
}

/**
 * Verify a cell backed by an on-chain EAS attestation (no inline EIP-712 payload).
 * Fetches the attestation from RPC and cross-checks resolver pointers when configured.
 */
export async function verifyEasOnchainCell(
  cell: Cell,
  ctx: EasVerifyContext,
  now: Date = new Date(),
): Promise<VerifyResult> {
  const att = cell.attestation;
  const algo = algoForFormat(att.format);
  if (valueHash(algo, cell.value) !== att.value_hash) {
    return fail("value-hash-mismatch", att.attester);
  }

  const uid = att.uid;
  if (!uid || uid === ZERO32) return fail("missing-eas-uid", att.attester);

  type EasAttestation = {
    schema: Hex;
    expirationTime: bigint;
    revocationTime: bigint;
    attester: Hex;
    data: Hex;
  };

  let onChain: EasAttestation;
  try {
    onChain = (await ctx.readContract({
      address: ctx.easAddress,
      abi: EAS_ABI,
      functionName: "getAttestation",
      args: [uid],
    })) as EasAttestation;
  } catch {
    return fail("eas-fetch-failed", att.attester);
  }

  if (onChain.revocationTime > 0n) {
    return { ok: false, status: "expired", reason: "eas-revoked", attester: att.attester };
  }

  if (onChain.expirationTime > 0n && Number(onChain.expirationTime) * 1000 < now.getTime()) {
    return { ok: false, status: "expired", reason: "eas-expired", attester: att.attester };
  }

  if (ctx.cellSchemaUid && onChain.schema.toLowerCase() !== ctx.cellSchemaUid.toLowerCase()) {
    return fail("eas-schema-mismatch", att.attester);
  }

  const attesterDid = easAttesterDid(ctx.chainId, onChain.attester);
  if (att.attester && attesterDid !== att.attester) {
    return fail("eas-attester-mismatch", att.attester);
  }

  let decoded: readonly [Hex, string, string, bigint, Hex];
  try {
    decoded = decodeAbiParameters(CELL_SCHEMA_PARAMS, onChain.data) as typeof decoded;
  } catch {
    return fail("eas-data-decode-failed", attesterDid);
  }

  const [, key, onChainValue, expiresAt] = decoded;
  if (key !== cell.key) return fail("eas-key-mismatch", attesterDid);

  if (onChainValue !== cellDisplayValue(cell.value)) {
    return fail("eas-value-mismatch", attesterDid);
  }

  if (expiresAt > 0n && Number(expiresAt) * 1000 < now.getTime()) {
    return { ok: false, status: "expired", reason: "cell-expires-at", attester: attesterDid };
  }

  if (ctx.resolverAddress && ctx.subjectEns) {
    try {
      const node = namehash(ctx.subjectEns);
      const linkedUid = (await ctx.readContract({
        address: ctx.resolverAddress,
        abi: RESOLVER_ABI,
        functionName: "cellAttestation",
        args: [node, cell.key],
      })) as Hex;
      if (linkedUid.toLowerCase() !== uid.toLowerCase()) {
        return fail("resolver-uid-mismatch", attesterDid);
      }

      const resolverText = (await ctx.readContract({
        address: ctx.resolverAddress,
        abi: RESOLVER_ABI,
        functionName: "text",
        args: [node, cell.key],
      })) as string;
      if (resolverText !== onChainValue) {
        return fail("resolver-text-mismatch", attesterDid);
      }
    } catch {
      return fail("resolver-check-failed", attesterDid);
    }
  }

  return { ok: true, status: "verified", attester: attesterDid, proof: "eas-onchain" };
}
