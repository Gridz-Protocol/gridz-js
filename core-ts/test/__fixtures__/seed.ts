/**
 * Deterministic, cryptographically-seeded test fixtures. No real-person or
 * placeholder data — every identity here is derived from a fixed seed string in
 * the clearly-labelled "__example__" namespace, per the brief's no-mock-data rule.
 */
import { keccak256, sha256, stringToBytes, type Hex } from "viem";
import { LocalEip712Signer, Ed25519Signer } from "../../src/index.js";
import type { Subject, Theme } from "../../src/index.js";

/** Sepolia. */
export const EXAMPLE_CHAIN_ID = 11155111;

/** Example GridzResolver address (deterministic constant, not a deployment). */
export const EXAMPLE_RESOLVER: Hex = "0x000000000000000000000000000000000000c0de";

/** Frozen instant so every signed fixture is byte-stable. */
export const NOW = new Date("2026-01-01T00:00:00.000Z");

const EIP712_PK: Hex = keccak256(stringToBytes("gridz/__example__/signer/1"));
const ED25519_SEED = sha256(stringToBytes("gridz/__example__/ed/1"), "bytes");

export function exampleEip712Signer(chainId = EXAMPLE_CHAIN_ID): LocalEip712Signer {
  return LocalEip712Signer.fromPrivateKey(EIP712_PK, chainId);
}

export function exampleEd25519Signer(): Ed25519Signer {
  return new Ed25519Signer(ED25519_SEED);
}

export const exampleTheme: Theme = {
  background_type: "solid",
  background_value: "#0b0b0f",
  accent_color: "#7c5cff",
  text_color: "#f4f4f5",
  card_style: "rounded",
  card_background: "#16161c",
  font_family: "sans",
  show_gridz_badge: true,
};

export async function exampleSubject(signer: {
  did(): Promise<string>;
}): Promise<Subject> {
  return { type: "human", did: await signer.did() };
}
