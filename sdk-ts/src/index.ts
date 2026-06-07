export { GridzClient, GridzApiError, type GridzClientOptions } from "./client.js";
export type { paths } from "./openapi-types.js";

// Re-export the core build/verify surface so the SDK is one import: sign locally,
// then push with the client. Gridz never custodies a key.
export {
  buildGrid,
  buildCellAttestation,
  buildRootAttestation,
  verifyGrid,
  verifyCell,
  verifyAttestation,
  LocalEip712Signer,
  Ed25519Signer,
  type Signer,
  type Grid,
  type Cell,
  type Subject,
  type Theme,
  type AttestationRef,
} from "@gridz/core";
