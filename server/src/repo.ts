import type { Cell, Grid } from "@gridz/core";

/**
 * Grid storage for the reference server. Keyed by the subject identifier used in
 * the URL (typically the subject DID). This is server state, not a source of
 * truth — the signed attestations the grids carry are.
 */
export interface GridRepository {
  get(subject: string): Grid | null;
  put(subject: string, grid: Grid): void;
  getCell(subject: string, key: string): Cell | null;
  /** Upsert a single cell into an existing grid. Returns false if no grid exists. */
  putCell(subject: string, cell: Cell): boolean;
  deleteCell(subject: string, key: string): boolean;
}

export class MemoryGridRepository implements GridRepository {
  private grids = new Map<string, Grid>();

  get(subject: string): Grid | null {
    return this.grids.get(subject) ?? null;
  }

  put(subject: string, grid: Grid): void {
    this.grids.set(subject, grid);
  }

  getCell(subject: string, key: string): Cell | null {
    return this.grids.get(subject)?.cells.find((c) => c.key === key) ?? null;
  }

  putCell(subject: string, cell: Cell): boolean {
    const grid = this.grids.get(subject);
    if (!grid) return false;
    const idx = grid.cells.findIndex((c) => c.key === cell.key);
    if (idx >= 0) grid.cells[idx] = cell;
    else grid.cells.push(cell);
    return true;
  }

  deleteCell(subject: string, key: string): boolean {
    const grid = this.grids.get(subject);
    if (!grid) return false;
    const before = grid.cells.length;
    grid.cells = grid.cells.filter((c) => c.key !== key);
    return grid.cells.length < before;
  }
}
