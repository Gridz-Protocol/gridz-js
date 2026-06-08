import { recoverTypedDataAddress, stringToBytes } from "viem";
import { base64urlnopad } from "@scure/base";
import { ed25519 } from "@noble/curves/ed25519";
import type { AttestationRef, Cell, Grid, Hex } from "./types.js";
import { algoForFormat, valueHash } from "./hash.js";
import { merkleRoot, ZERO32 } from "./merkle.js";
import { decodeBundle, deserializeMessage, type Bundle } from "./attest.js";
import { publicKeyFromDidKey } from "./signer.js";
import { verifyEasOnchainCell, type EasVerifyContext } from "./verifyEas.js";

export type VerifyStatus = "verified" | "failed" | "expired" | "unsupported";

export type VerifyProof = "inline" | "eas-onchain" | "manifest";

export interface VerifyResult {
  ok: boolean;
  status: VerifyStatus;
  reason?: string;
  attester?: string;
  proof?: VerifyProof;
}

export interface VerifyContext {
  /** When set, the attester must equal this DID (self-issued) unless allowDelegated. */
  subjectDid?: string;
  allowDelegated?: boolean;
  /** Override "now" for deterministic tests. */
  now?: Date;
  /** When set, `eas-onchain` cells are verified via EAS + resolver RPC reads. */
  eas?: EasVerifyContext;
}

function fail(reason: string, attester?: string): VerifyResult {
  return { ok: false, status: "failed", reason, attester };
}

function decodeJwsClaims(jws: string): {
  claims: Record<string, unknown>;
  signingInput: string;
  sig: Uint8Array;
} {
  const parts = jws.split(".");
  if (parts.length !== 3) throw new Error("malformed compact JWS");
  const claims = JSON.parse(new TextDecoder().decode(base64urlnopad.decode(parts[1]!)));
  return { claims, signingInput: `${parts[0]}.${parts[1]}`, sig: base64urlnopad.decode(parts[2]!) };
}

/**
 * Authenticate the signer of a bundle and return their DID. Does NOT check what
 * was signed — callers bind the payload to the expected value/root separately.
 */
async function authenticate(
  bundle: Bundle,
  attesterDid: string,
): Promise<{ ok: true; attester: string } | { ok: false; reason: string }> {
  if (bundle.kind === "eip712") {
    const message = deserializeMessage(bundle.message, bundle.primaryType as "GridzCell" | "GridzRoot");
    const recovered = await recoverTypedDataAddress({
      domain: bundle.domain,
      types: bundle.types,
      primaryType: bundle.primaryType,
      message,
      signature: bundle.signature,
    } as never);
    return { ok: true, attester: `did:pkh:eip155:${bundle.domain.chainId}:${recovered.toLowerCase()}` };
  }
  const { signingInput, sig } = decodeJwsClaims(bundle.jws);
  const pubkey = publicKeyFromDidKey(attesterDid);
  if (!ed25519.verify(sig, stringToBytes(signingInput), pubkey)) {
    return { ok: false, reason: "bad-signature" };
  }
  return { ok: true, attester: attesterDid };
}

function timeCheck(att: AttestationRef, now: Date): VerifyResult | null {
  if (att.nbf && new Date(att.nbf) > now) return fail("not-yet-valid", att.attester);
  if (att.exp && new Date(att.exp) < now) {
    return { ok: false, status: "expired", reason: "expired", attester: att.attester };
  }
  return null;
}

/** Pull the value the bundle's signature commits to (valueHashHex for cells, merkleRoot for roots). */
function boundHash(bundle: Bundle): Hex | undefined {
  if (bundle.kind === "eip712") {
    return (bundle.message["valueHashHex"] ?? bundle.message["merkleRoot"]) as Hex | undefined;
  }
  const { claims } = decodeJwsClaims(bundle.jws);
  return (claims["valueHashHex"] ?? claims["merkleRoot"]) as Hex | undefined;
}

/**
 * Verify an attestation envelope against a known value. No sink/server/vault is
 * consulted — verification is fully local given the embedded payload (§6 of
 * specs/canonicalization.md). Formats without an inlined payload (e.g. bare
 * eas-onchain, cose-webauthn) return status "unsupported" — never a fake pass.
 */
export async function verifyAttestation(
  att: AttestationRef,
  value: unknown,
  ctx: VerifyContext = {},
): Promise<VerifyResult> {
  const algo = algoForFormat(att.format);
  if (valueHash(algo, value) !== att.value_hash) return fail("value-hash-mismatch", att.attester);

  if (!att.payload) {
    return { ok: false, status: "unsupported", reason: `no inline payload for ${att.format}`, attester: att.attester };
  }

  try {
    const bundle = decodeBundle(att.payload);
    if (boundHash(bundle) !== att.value_hash) return fail("bound-hash-mismatch", att.attester);

    const auth = await authenticate(bundle, att.attester);
    if (!auth.ok) return fail(auth.reason, att.attester);
    if (auth.attester !== att.attester) return fail("attester-mismatch", att.attester);
  } catch {
    return fail("malformed-payload", att.attester);
  }

  if (ctx.subjectDid && !ctx.allowDelegated && att.attester !== ctx.subjectDid) {
    return fail("unauthorized-signer", att.attester);
  }

  const t = timeCheck(att, ctx.now ?? new Date());
  if (t) return t;

  return { ok: true, status: "verified", attester: att.attester, proof: "inline" };
}

function isResolverManifestRoot(att: AttestationRef): boolean {
  return (
    !att.payload &&
    att.format === "eip712-raw" &&
    att.uid === ZERO32 &&
    att.value_hash === ZERO32
  );
}

/** Verify a single cell. Also enforces the cell-level expires_at. */
export async function verifyCell(cell: Cell, ctx: VerifyContext = {}): Promise<VerifyResult> {
  const att = cell.attestation;
  if (!att.payload && att.format === "eas-onchain" && ctx.eas) {
    const easResult = await verifyEasOnchainCell(cell, ctx.eas, ctx.now);
    if (!easResult.ok) return easResult;
    if (cell.expires_at && new Date(cell.expires_at) < (ctx.now ?? new Date())) {
      return { ok: false, status: "expired", reason: "cell-expired", attester: easResult.attester };
    }
    return easResult;
  }

  const base = await verifyAttestation(cell.attestation, cell.value, ctx);
  if (!base.ok) return base;
  if (cell.expires_at && new Date(cell.expires_at) < (ctx.now ?? new Date())) {
    return { ok: false, status: "expired", reason: "cell-expired", attester: base.attester };
  }
  return base;
}

export interface GridVerifyResult {
  ok: boolean;
  cells: { id: string; key: string; result: VerifyResult }[];
  root: VerifyResult;
}

/** Verify every cell independently, then verify the root commits to exactly this cell set. */
export async function verifyGrid(grid: Grid, ctx: VerifyContext = {}): Promise<GridVerifyResult> {
  const subjectCtx: VerifyContext = { subjectDid: grid.subject.did, ...ctx };
  const cells = await Promise.all(
    grid.cells.map(async (c) => ({ id: c.id, key: c.key, result: await verifyCell(c, subjectCtx) })),
  );
  const root = await verifyRoot(grid, subjectCtx);
  return { ok: root.ok && cells.every((c) => c.result.ok), cells, root };
}

async function verifyRoot(grid: Grid, ctx: VerifyContext): Promise<VerifyResult> {
  const att = grid.root_attestation;
  if (isResolverManifestRoot(att)) {
    return {
      ok: true,
      status: "verified",
      proof: "manifest",
      reason: "per-cell EAS attestations (resolver manifest; no bundled root)",
      attester: att.attester,
    };
  }

  const algo = algoForFormat(att.format);
  const computed = merkleRoot(
    algo,
    grid.cells.map((c) => c.attestation.uid),
  );

  if (computed !== att.value_hash) return fail("merkle-root-mismatch", att.attester);
  if (!att.payload) {
    return { ok: false, status: "unsupported", reason: "no inline root payload", attester: att.attester };
  }

  try {
    const bundle = decodeBundle(att.payload);
    if (boundHash(bundle) !== computed) return fail("root-bound-mismatch", att.attester);

    // cellCount guards against a root that silently dropped cells.
    const count =
      bundle.kind === "eip712"
        ? Number(bundle.message["cellCount"])
        : Number(decodeJwsClaims(bundle.jws).claims["cellCount"]);
    if (count !== grid.cells.length) return fail("cell-count-mismatch", att.attester);

    const auth = await authenticate(bundle, att.attester);
    if (!auth.ok) return fail(auth.reason, att.attester);
    if (auth.attester !== att.attester) return fail("attester-mismatch", att.attester);
  } catch {
    return fail("malformed-payload", att.attester);
  }

  if (ctx.subjectDid && !ctx.allowDelegated && att.attester !== ctx.subjectDid) {
    return fail("unauthorized-signer", att.attester);
  }

  const t = timeCheck(att, ctx.now ?? new Date());
  if (t) return t;
  return { ok: true, status: "verified", attester: att.attester, proof: "inline" };
}
