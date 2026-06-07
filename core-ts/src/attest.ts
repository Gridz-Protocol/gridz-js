import { keccak256, sha256, stringToBytes } from "viem";
import { base64urlnopad } from "@scure/base";
import type { AttestationRef, Hex } from "./types.js";
import { SCHEMA_VERSION } from "./types.js";
import { algoForFormat, gridId, valueHash, widgetTypeHash } from "./hash.js";
import {
  gridzDomain,
  GridzCell,
  GridzRoot,
  PRIMARY_TYPE_CELL,
  PRIMARY_TYPE_ROOT,
  UINT64_FIELDS,
  type CellMessage,
  type RootMessage,
} from "./eip712.js";
import { Ed25519Signer, type Signer } from "./signer.js";
import { GridzError } from "./errors.js";

/** The self-contained verification bundle stored (base64url) in attestation.payload. */
export type Bundle =
  | {
      kind: "eip712";
      domain: { name: string; version: string; chainId: number; verifyingContract: Hex };
      types: Record<string, { name: string; type: string }[]>;
      primaryType: string;
      message: Record<string, string>;
      signature: Hex;
    }
  | { kind: "jws"; jws: string };

function encodeBundle(b: Bundle): string {
  return base64urlnopad.encode(stringToBytes(JSON.stringify(b)));
}

export function decodeBundle(payload: string): Bundle {
  return JSON.parse(new TextDecoder().decode(base64urlnopad.decode(payload))) as Bundle;
}

/** Serialize a message's bigint (uint64) fields to decimal strings for JSON. */
function serializeMessage(
  msg: Record<string, unknown>,
  primaryType: keyof typeof UINT64_FIELDS,
): Record<string, string> {
  const out: Record<string, string> = {};
  const u64 = new Set<string>(UINT64_FIELDS[primaryType]);
  for (const [k, v] of Object.entries(msg)) {
    out[k] = u64.has(k) ? (v as bigint).toString() : String(v);
  }
  return out;
}

/** Inverse of serializeMessage: revive uint64 fields as bigint. */
export function deserializeMessage(
  obj: Record<string, string>,
  primaryType: keyof typeof UINT64_FIELDS,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...obj };
  for (const f of UINT64_FIELDS[primaryType]) out[f] = BigInt(obj[f]!);
  return out;
}

function isoToSec(d: Date): bigint {
  return BigInt(Math.floor(d.getTime() / 1000));
}

export interface CellAttestInput {
  subjectDid: string;
  key: string;
  value: unknown;
  widgetType?: string;
  expiresAt?: Date;
  nonce?: bigint;
  /** Required for EIP-712 signers. */
  chainId?: number;
  verifyingContract?: Hex;
  /** Override "now" for deterministic tests. */
  now?: Date;
}

export async function buildCellAttestation(
  signer: Signer,
  input: CellAttestInput,
): Promise<AttestationRef> {
  const format = signer.format();
  const algo = algoForFormat(format);
  const now = input.now ?? new Date();

  const gid = gridId(algo, input.subjectDid, SCHEMA_VERSION);
  const vHash = valueHash(algo, input.value);
  const wHash = widgetTypeHash(algo, input.widgetType);
  const expiresSec = input.expiresAt ? isoToSec(input.expiresAt) : 0n;
  const nonce = input.nonce ?? 0n;
  const attester = await signer.did();

  const base: Omit<AttestationRef, "format" | "uid" | "uri" | "payload"> = {
    attester,
    iat: now.toISOString(),
    value_hash: vHash,
    ...(input.expiresAt ? { exp: input.expiresAt.toISOString() } : {}),
  };

  if (format === "eip712-raw" || format === "eip712-oneclaw") {
    if (input.chainId === undefined || input.verifyingContract === undefined) {
      throw new GridzError("attest/missing-domain", "EIP-712 cell attestation requires chainId + verifyingContract");
    }
    const domain = gridzDomain(input.chainId, input.verifyingContract);
    const message: CellMessage = {
      gridId: gid,
      key: input.key,
      valueHashHex: vHash,
      widgetTypeHash: wHash,
      expiresAt: expiresSec,
      nonce,
    };
    const types = { GridzCell };
    const { signature } = await signer.signTypedData({
      domain,
      types,
      primaryType: PRIMARY_TYPE_CELL,
      message: message as unknown as Record<string, unknown>,
    });
    const payload = encodeBundle({
      kind: "eip712",
      domain,
      types,
      primaryType: PRIMARY_TYPE_CELL,
      message: serializeMessage(message as unknown as Record<string, unknown>, "GridzCell"),
      signature,
    });
    const uid = keccak256(signature);
    return { ...base, format, uid, uri: `data://inline/${uid}`, payload };
  }

  if (format === "jws-ed25519") {
    if (!(signer instanceof Ed25519Signer)) {
      throw new GridzError("attest/signer-mismatch", "jws-ed25519 requires an Ed25519Signer");
    }
    const claims = {
      iss: attester,
      gridId: gid,
      key: input.key,
      valueHashHex: vHash,
      widgetTypeHash: wHash,
      expiresAt: Number(expiresSec),
      nonce: nonce.toString(),
      iat: Number(isoToSec(now)),
    };
    const jws = await signer.signJWS(claims);
    const uid = sha256(stringToBytes(jws));
    const payload = encodeBundle({ kind: "jws", jws });
    return { ...base, format, uid, uri: `data://inline/${uid}`, payload };
  }

  throw new GridzError("attest/unsupported-format", `core cannot author format ${format}`);
}

/**
 * Assemble a cell AttestationRef from a DETACHED EIP-712 signature (the message
 * was signed elsewhere — a passkey host, an HSM, or an MCP client). This is the
 * server-/agent-side counterpart to cell.prepare_write: Gridz prepares the typed
 * data, something else signs it, and this stitches the verifiable envelope back
 * together. The verifier cannot tell whether buildCellAttestation or this made it.
 */
export function eip712CellAttestation(opts: {
  domain: { name: string; version: string; chainId: number; verifyingContract: Hex };
  message: CellMessage;
  signature: Hex;
  attester: string;
  format?: "eip712-raw" | "eip712-oneclaw";
  now?: Date;
}): AttestationRef {
  const { message } = opts;
  const payload = encodeBundle({
    kind: "eip712",
    domain: opts.domain,
    types: { GridzCell },
    primaryType: PRIMARY_TYPE_CELL,
    message: serializeMessage(message as unknown as Record<string, unknown>, "GridzCell"),
    signature: opts.signature,
  });
  const uid = keccak256(opts.signature);
  const now = opts.now ?? new Date();
  return {
    format: opts.format ?? "eip712-raw",
    uid,
    uri: `data://inline/${uid}`,
    attester: opts.attester,
    iat: now.toISOString(),
    value_hash: message.valueHashHex,
    payload,
    ...(message.expiresAt > 0n
      ? { exp: new Date(Number(message.expiresAt) * 1000).toISOString() }
      : {}),
  };
}

export interface RootAttestInput {
  subjectDid: string;
  merkleRoot: Hex;
  cellCount: number;
  chainId?: number;
  verifyingContract?: Hex;
  now?: Date;
}

export async function buildRootAttestation(
  signer: Signer,
  input: RootAttestInput,
): Promise<AttestationRef> {
  const format = signer.format();
  const algo = algoForFormat(format);
  const now = input.now ?? new Date();
  const gid = gridId(algo, input.subjectDid, SCHEMA_VERSION);
  const attester = await signer.did();

  const base = {
    attester,
    iat: now.toISOString(),
    value_hash: input.merkleRoot,
  };

  if (format === "eip712-raw" || format === "eip712-oneclaw") {
    if (input.chainId === undefined || input.verifyingContract === undefined) {
      throw new GridzError("attest/missing-domain", "EIP-712 root attestation requires chainId + verifyingContract");
    }
    const domain = gridzDomain(input.chainId, input.verifyingContract);
    const message: RootMessage = {
      gridId: gid,
      merkleRoot: input.merkleRoot,
      schemaVersion: SCHEMA_VERSION,
      cellCount: BigInt(input.cellCount),
      issuedAt: isoToSec(now),
    };
    const types = { GridzRoot };
    const { signature } = await signer.signTypedData({
      domain,
      types,
      primaryType: PRIMARY_TYPE_ROOT,
      message: message as unknown as Record<string, unknown>,
    });
    const payload = encodeBundle({
      kind: "eip712",
      domain,
      types,
      primaryType: PRIMARY_TYPE_ROOT,
      message: serializeMessage(message as unknown as Record<string, unknown>, "GridzRoot"),
      signature,
    });
    const uid = keccak256(signature);
    return { ...base, format, uid, uri: `data://inline/${uid}`, payload };
  }

  if (format === "jws-ed25519") {
    if (!(signer instanceof Ed25519Signer)) {
      throw new GridzError("attest/signer-mismatch", "jws-ed25519 requires an Ed25519Signer");
    }
    const claims = {
      iss: attester,
      gridId: gid,
      merkleRoot: input.merkleRoot,
      schemaVersion: SCHEMA_VERSION,
      cellCount: input.cellCount,
      iat: Number(isoToSec(now)),
    };
    const jws = await signer.signJWS(claims);
    const uid = sha256(stringToBytes(jws));
    const payload = encodeBundle({ kind: "jws", jws });
    return { ...base, format, uid, uri: `data://inline/${uid}`, payload };
  }

  throw new GridzError("attest/unsupported-format", `core cannot author format ${format}`);
}
