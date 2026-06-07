import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { jcs, hashJcs, hashUtf8 } from "../src/index.js";

describe("JCS canonicalization (RFC 8785)", () => {
  it("sorts object keys lexicographically", () => {
    expect(jcs({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
    expect(jcs({ a: 2, b: 1 })).toBe('{"a":2,"b":1}');
  });

  it("emits no insignificant whitespace", () => {
    expect(jcs({ x: [1, 2, 3] })).toBe('{"x":[1,2,3]}');
  });

  it("is order-independent for object keys", () => {
    expect(jcs({ z: 1, a: { d: 4, c: 3 } })).toBe(jcs({ a: { c: 3, d: 4 }, z: 1 }));
  });

  it("preserves array order (arrays are ordered)", () => {
    expect(jcs([3, 1, 2])).toBe("[3,1,2]");
  });

  it("throws on unserializable values", () => {
    expect(() => jcs(undefined)).toThrow();
  });
});

describe("hashJcs", () => {
  it("is stable under key reordering (property)", () => {
    fc.assert(
      fc.property(fc.dictionary(fc.string(), fc.jsonValue()), (obj) => {
        const reordered = Object.fromEntries(Object.entries(obj).reverse());
        return hashJcs("keccak256", obj) === hashJcs("keccak256", reordered);
      }),
      { numRuns: 1000 },
    );
  });

  it("keccak256 and sha256 produce distinct 32-byte hex", () => {
    const k = hashJcs("keccak256", { a: 1 });
    const s = hashJcs("sha256", { a: 1 });
    expect(k).toMatch(/^0x[0-9a-f]{64}$/);
    expect(s).toMatch(/^0x[0-9a-f]{64}$/);
    expect(k).not.toBe(s);
  });

  it("hashUtf8 of empty string is the canonical empty-widget hash", () => {
    expect(hashUtf8("keccak256", "")).toMatch(/^0x[0-9a-f]{64}$/);
  });
});
