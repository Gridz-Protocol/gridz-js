import type { AttestationFormat, Hex } from "./types.js";
import { hashJcs, hashUtf8, type HashAlgo } from "./canonicalize.js";

/** specs/canonicalization.md §2: format determines the hash domain. */
export function algoForFormat(format: AttestationFormat): HashAlgo {
  switch (format) {
    case "eas-onchain":
    case "eas-offchain":
    case "eip712-raw":
    case "eip712-oneclaw":
      return "keccak256";
    case "jws-ed25519":
    case "cose-webauthn":
      return "sha256";
  }
}

/** value_hash = H(JCS(value)) — §3.1 */
export function valueHash(algo: HashAlgo, value: unknown): Hex {
  return hashJcs(algo, value);
}

/** gridId = H(JCS({did, schema_version})) — §3.2 (stable across edits) */
export function gridId(algo: HashAlgo, did: string, schemaVersion: string): Hex {
  return hashJcs(algo, { did, schema_version: schemaVersion });
}

/** widgetTypeHash = H(utf8(widget_type ?? "")) — §3.3 */
export function widgetTypeHash(algo: HashAlgo, widgetType?: string): Hex {
  return hashUtf8(algo, widgetType ?? "");
}
