import { describe, it, expect } from "vitest";
import * as core from "../src/eip712.js";
import * as spec from "../../../specs/eip712-types.js";

/**
 * The package's EIP-712 definitions are a runtime copy of specs/eip712-types.ts.
 * This guard fails the moment they diverge, keeping the spec as source of truth.
 */
describe("EIP-712 spec drift guard", () => {
  it("GridzCell struct matches the spec", () => {
    expect(core.GridzCell).toEqual(spec.GridzCell);
  });
  it("GridzRoot struct matches the spec", () => {
    expect(core.GridzRoot).toEqual(spec.GridzRoot);
  });
  it("EIP712Domain type matches the spec", () => {
    expect(core.EIP712_DOMAIN_TYPE).toEqual(spec.EIP712_DOMAIN_TYPE);
  });
  it("EAS schema registrations match the spec", () => {
    expect(core.EAS_SCHEMAS).toEqual(spec.EAS_SCHEMAS);
  });
  it("domain builder matches the spec", () => {
    const a = core.gridzDomain(1, "0x000000000000000000000000000000000000c0de");
    const b = spec.gridzDomain(1, "0x000000000000000000000000000000000000c0de");
    expect(a).toEqual(b);
  });
  it("primary type names match the spec", () => {
    expect(core.PRIMARY_TYPE_CELL).toBe(spec.PRIMARY_TYPE_CELL);
    expect(core.PRIMARY_TYPE_ROOT).toBe(spec.PRIMARY_TYPE_ROOT);
  });
});
