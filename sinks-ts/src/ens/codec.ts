/**
 * Pure mapping between Gridz cells and ENS text records. No chain access — this
 * is what makes the ENS sink fully testable offline. The on-chain projection is:
 *
 *   <key>                  → the cell value (bare string for passthrough, else JSON)
 *   gridz.att[<key>]       → base64url(JSON(attestation))
 *   gridz.keys             → JSON string[] of cell keys (manifest; ENS can't enumerate)
 *   gridz.layout           → JSON map key → { id, position, size, ... , value_type }
 *   gridz.root             → base64url(JSON(root_attestation))
 *   gridz.theme            → JSON(theme)
 *   gridz.subject          → JSON(subject)
 *
 * Storing the value in its natural key keeps a Gridz name a valid ENS profile:
 * a plain ENS reader sees `com.github` → "alice", not a wrapped blob.
 */
import { base64urlnopad } from "@scure/base";
import type { AttestationRef, Cell, CellPosition } from "@gridz/core";

export interface LayoutEntry {
  id: string;
  position: CellPosition;
  size: string;
  is_visible: boolean;
  value_type: "string" | "json";
  widget_type?: string;
  expires_at?: string;
}

const enc = new TextEncoder();
const dec = new TextDecoder();

export function b64uJson(value: unknown): string {
  return base64urlnopad.encode(enc.encode(JSON.stringify(value)));
}

export function unb64uJson<T>(s: string): T {
  return JSON.parse(dec.decode(base64urlnopad.decode(s))) as T;
}

export function attKey(key: string): string {
  return `gridz.att[${key}]`;
}

export function encodeValue(value: unknown): { text: string; valueType: "string" | "json" } {
  if (typeof value === "string") return { text: value, valueType: "string" };
  return { text: JSON.stringify(value), valueType: "json" };
}

export function decodeValue(text: string, valueType: "string" | "json"): unknown {
  return valueType === "string" ? text : JSON.parse(text);
}

export function layoutEntry(cell: Cell, valueType: "string" | "json"): LayoutEntry {
  return {
    id: cell.id,
    position: cell.position,
    size: cell.size,
    is_visible: cell.is_visible,
    value_type: valueType,
    ...(cell.widget_type ? { widget_type: cell.widget_type } : {}),
    ...(cell.expires_at ? { expires_at: cell.expires_at } : {}),
  };
}

/** Reconstruct a cell from its stored parts. */
export function decodeCell(
  key: string,
  valueText: string,
  attB64: string,
  entry: LayoutEntry,
): Cell {
  return {
    id: entry.id,
    key,
    value: decodeValue(valueText, entry.value_type),
    position: entry.position,
    size: entry.size,
    is_visible: entry.is_visible,
    attestation: unb64uJson<AttestationRef>(attB64),
    ...(entry.widget_type ? { widget_type: entry.widget_type } : {}),
    ...(entry.expires_at ? { expires_at: entry.expires_at } : {}),
  };
}
