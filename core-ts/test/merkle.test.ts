import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { keccak256, stringToBytes, concatHex, hexToBytes } from "viem";
import { merkleRoot, normalizeLeaf, ZERO32 } from "../src/index.js";

const uid = (s: string) => `0x${s.padStart(64, "0")}` as const;

describe("merkleRoot", () => {
  it("empty tree is 32 zero bytes", () => {
    expect(merkleRoot("keccak256", [])).toBe(ZERO32);
  });

  it("single leaf is the leaf itself", () => {
    const leaf = uid("ab");
    expect(merkleRoot("keccak256", [leaf])).toBe(leaf);
  });

  it("two leaves use sorted-pair hashing (lower ‖ higher)", () => {
    const a = uid("01");
    const b = uid("02");
    const expected = keccak256(hexToBytes(concatHex([a, b])));
    expect(merkleRoot("keccak256", [a, b])).toBe(expected);
    expect(merkleRoot("keccak256", [b, a])).toBe(expected); // order-independent
  });

  it("normalizes non-hex uids by hashing their utf8", () => {
    expect(normalizeLeaf("keccak256", "eas:abc")).toBe(keccak256(stringToBytes("eas:abc")));
  });

  it("promotes the odd node unchanged (3 leaves)", () => {
    const a = uid("01");
    const b = uid("02");
    const c = uid("03");
    // level0 sorted: [a,b,c] -> [hash(a,b), c] -> hash(min,max)
    const ab = keccak256(hexToBytes(concatHex([a, b])));
    const top =
      ab < c
        ? keccak256(hexToBytes(concatHex([ab, c])))
        : keccak256(hexToBytes(concatHex([c, ab])));
    expect(merkleRoot("keccak256", [a, b, c])).toBe(top);
  });

  it("is invariant to input order (property)", () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.hexaString({ minLength: 64, maxLength: 64 }), { minLength: 1, maxLength: 20 }),
        (hexes) => {
          const uids = hexes.map((h) => `0x${h}`);
          const shuffled = [...uids].reverse();
          return merkleRoot("keccak256", uids) === merkleRoot("keccak256", shuffled);
        },
      ),
      { numRuns: 1000 },
    );
  });
});
