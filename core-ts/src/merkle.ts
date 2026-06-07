import { concatHex, isHex, size } from "viem";
import type { Hex } from "./types.js";
import { hashBytes, hashUtf8, type HashAlgo } from "./canonicalize.js";
import { hexToBytes } from "viem";

export const ZERO32: Hex = `0x${"00".repeat(32)}`;

/**
 * Normalize a cell attestation `uid` to a 32-byte leaf (§4):
 *  - 0x-prefixed 32-byte hex (EAS uid) → used directly (lowercased)
 *  - anything else → H(utf8(uid))
 */
export function normalizeLeaf(algo: HashAlgo, uid: string): Hex {
  if (isHex(uid) && size(uid) === 32) {
    return uid.toLowerCase() as Hex;
  }
  return hashUtf8(algo, uid);
}

/** Big-endian compare of two equal-width 0x-hex values. */
function compareHex(a: Hex, b: Hex): number {
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  return x < y ? -1 : x > y ? 1 : 0;
}

/** parent(a,b) = H(min(a,b) ‖ max(a,b)) — sorted-pair, OZ-compatible (§4). */
function hashPair(algo: HashAlgo, a: Hex, b: Hex): Hex {
  const [lo, hi] = compareHex(a, b) <= 0 ? [a, b] : [b, a];
  return hashBytes(algo, hexToBytes(concatHex([lo, hi])));
}

/**
 * Sorted-pair merkle root over cell attestation UIDs (§4).
 * Empty → 32 zero bytes. Single leaf → itself. Odd node promoted unchanged.
 */
export function merkleRoot(algo: HashAlgo, uids: readonly string[]): Hex {
  if (uids.length === 0) return ZERO32;

  let level = uids.map((u) => normalizeLeaf(algo, u)).sort(compareHex);

  while (level.length > 1) {
    const next: Hex[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const a = level[i]!;
      if (i + 1 === level.length) {
        next.push(a); // odd one out, promote unchanged
        continue;
      }
      next.push(hashPair(algo, a, level[i + 1]!));
    }
    level = next;
  }
  return level[0]!;
}
