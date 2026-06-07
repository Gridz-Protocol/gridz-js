import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { parse, stringify } from "yaml";
import type { CellDraft } from "@gridz/core";
import type { ConfigCell, GridzConfig } from "./templates.js";

export const KEY_REGEX = /^[a-z0-9]([a-z0-9._\-[\]])*[a-z0-9\]]$/;

export function loadConfig(path: string): GridzConfig {
  return parse(readFileSync(path, "utf8")) as GridzConfig;
}

export function saveConfig(path: string, config: GridzConfig): void {
  writeFileSync(path, stringify(config));
}

export function configExists(path: string): boolean {
  return existsSync(path);
}

export interface ValidationError {
  cell?: string;
  message: string;
}

/**
 * Validates an authoring config. A cell with _needs_input (or a null value) is a
 * hard failure — templates MUST be filled before they validate (BRIEF §8/§15).
 */
export function validateConfig(config: GridzConfig): { ok: boolean; errors: ValidationError[] } {
  const errors: ValidationError[] = [];
  if (config.schema_version !== "gridz/1.0.0") {
    errors.push({ message: `unsupported schema_version: ${config.schema_version}` });
  }
  if (!config.subject?.did) {
    errors.push({ message: "subject.did is required — run `gridz identity import` first" });
  }
  for (const cell of config.cells ?? []) {
    if (!KEY_REGEX.test(cell.key)) errors.push({ cell: cell.key, message: "invalid key syntax" });
    if (cell._needs_input) errors.push({ cell: cell.key, message: "_needs_input: fill this value before publishing" });
    else if (cell.value === null || cell.value === undefined) {
      errors.push({ cell: cell.key, message: "value is empty" });
    }
  }
  return { ok: errors.length === 0, errors };
}

function parseSize(size: string | undefined): { w: number; h: number } {
  const m = /^(\d+)x(\d+)$/.exec(size ?? "1x1");
  return m ? { w: Number(m[1]), h: Number(m[2]) } : { w: 1, h: 1 };
}

/** Deterministic row-packing layout (max width 3 units). */
export function configToDrafts(cells: ConfigCell[]): CellDraft[] {
  const MAX = 3;
  let x = 0;
  let y = 0;
  let rowH = 0;
  return cells.map((cell, i) => {
    const { w, h } = parseSize(cell.size);
    if (x + w > MAX) {
      x = 0;
      y += rowH;
      rowH = 0;
    }
    const position = { x, y, w, h };
    x += w;
    rowH = Math.max(rowH, h);
    return {
      id: `cell-${i + 1}`,
      key: cell.key,
      value: cell.value,
      ...(cell.widget_type ? { widget_type: cell.widget_type } : {}),
      position,
      size: cell.size ?? "1x1",
      is_visible: cell.is_visible ?? true,
    };
  });
}
