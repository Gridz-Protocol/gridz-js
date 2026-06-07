import { LocalEip712Signer, Ed25519Signer, type Hex, type Signer } from "@gridz/core";

export interface IdentityEnv {
  GRIDZ_SIGNER_KEY?: string;
  GRIDZ_SIGNER_TYPE?: string;
  GRIDZ_ED25519_SEED?: string;
  GRIDZ_CHAIN_ID?: string;
  GRIDZ_RESOLVER?: string;
}

export interface ResolvedIdentity {
  signer: Signer;
  chainId: number;
  resolver: Hex;
}

function hexToBytes(h: string): Uint8Array {
  const s = h.startsWith("0x") ? h.slice(2) : h;
  return Uint8Array.from((s.match(/.{2}/g) ?? []).map((b) => parseInt(b, 16)));
}

/**
 * Resolve a signer from environment. CI-only `--from env` path; production uses
 * keystore/ledger/webauthn/oneclaw (added with their adapters). Gridz never
 * stores a key on disk in cleartext.
 */
export function resolveIdentity(env: IdentityEnv = process.env): ResolvedIdentity | null {
  const chainId = Number(env.GRIDZ_CHAIN_ID ?? "11155111");
  const resolver = (env.GRIDZ_RESOLVER ?? "0x000000000000000000000000000000000000c0de") as Hex;

  if (env.GRIDZ_ED25519_SEED) {
    return { signer: new Ed25519Signer(hexToBytes(env.GRIDZ_ED25519_SEED)), chainId, resolver };
  }
  if (env.GRIDZ_SIGNER_KEY) {
    const key = (env.GRIDZ_SIGNER_KEY.startsWith("0x") ? env.GRIDZ_SIGNER_KEY : `0x${env.GRIDZ_SIGNER_KEY}`) as Hex;
    return { signer: LocalEip712Signer.fromPrivateKey(key, chainId), chainId, resolver };
  }
  return null;
}
