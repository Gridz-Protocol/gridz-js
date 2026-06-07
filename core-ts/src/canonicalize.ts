import canonicalizeLib from "canonicalize";
import { keccak256, sha256, stringToBytes } from "viem";
import type { Hex } from "./types.js";
import { GridzError } from "./errors.js";

/**
 * Hash domain per specs/canonicalization.md §2: keccak256 on EVM,
 * sha256 on non-EVM. A Grid's domain is fixed by the attestation format.
 */
export type HashAlgo = "keccak256" | "sha256";

/** RFC 8785 JSON Canonicalization Scheme. We do not hand-roll JCS. */
export function jcs(value: unknown): string {
  const out = (canonicalizeLib as (v: unknown) => string | undefined)(value);
  if (out === undefined) {
    throw new GridzError("jcs/unserializable", "value is not JCS-serializable (undefined output)");
  }
  return out;
}

export function hashBytes(algo: HashAlgo, bytes: Uint8Array): Hex {
  return algo === "keccak256" ? keccak256(bytes) : sha256(bytes);
}

/** Hash of the UTF-8 bytes of a string (not JCS — input is already primitive). */
export function hashUtf8(algo: HashAlgo, s: string): Hex {
  return hashBytes(algo, stringToBytes(s));
}

/** Hash of JCS(value). The canonical "hash a JSON value" primitive. */
export function hashJcs(algo: HashAlgo, value: unknown): Hex {
  return hashUtf8(algo, jcs(value));
}
