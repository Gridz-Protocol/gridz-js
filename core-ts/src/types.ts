/**
 * Hand-written TypeScript mirror of specs/grid.schema.json and
 * specs/attestation.schema.json. The JSON Schemas remain the source of truth;
 * these types are kept in sync (drift is caught by schema-validation tests).
 */

export type Hex = `0x${string}`;

export type SubjectType = "human" | "agent" | "organization";

export interface Subject {
  type: SubjectType;
  /** Canonical DID. See specs/grid.schema.json for supported methods. */
  did: string;
  ens?: string;
  sns?: string;
  display_name?: string;
}

export interface Theme {
  background_type: "solid" | "gradient" | "image";
  background_value: string;
  accent_color: string;
  secondary_color?: string;
  text_color: string;
  card_style: "rounded" | "sharp" | "soft";
  card_background: string;
  card_border?: string;
  /** "sans" | "serif" | "mono" or a Google Fonts family name. */
  font_family: string;
  show_gridz_badge?: boolean;
}

export interface CellPosition {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type AttestationFormat =
  | "eas-onchain"
  | "eas-offchain"
  | "eip712-raw"
  | "eip712-oneclaw"
  | "jws-ed25519"
  | "cose-webauthn";

export interface AttestationRef {
  format: AttestationFormat;
  uid: string;
  uri: string;
  attester: string;
  iat: string;
  nbf?: string;
  exp?: string;
  value_hash: Hex;
  revocation?: { method: "eas" | "status-list-2021"; uri: string };
  /** base64url(JSON(verification bundle)). Lets a verifier work fully offline. */
  payload?: string;
}

export interface Cell<T = unknown> {
  id: string;
  key: string;
  value: T;
  widget_type?: string;
  position: CellPosition;
  size: string;
  is_visible: boolean;
  attestation: AttestationRef;
  expires_at?: string;
  /** Authoring-only flags; must be absent on a published Grid. */
  _needs_input?: boolean;
  _unattested?: boolean;
}

export interface Grid {
  schema_version: "gridz/1.0.0";
  subject: Subject;
  theme: Theme;
  cells: Cell[];
  root_attestation: AttestationRef;
}

export const SCHEMA_VERSION = "gridz/1.0.0" as const;
