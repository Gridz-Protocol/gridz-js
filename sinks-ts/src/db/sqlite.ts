import { createRequire } from "node:module";
import type { Cell } from "@gridz/core";
import { decodeCell, encodeCell, type CellStore } from "./store.js";

// node:sqlite is a newer builtin that bundlers/test loaders mis-resolve. Loading
// it through Node's own require bypasses the loader entirely.
const nodeRequire = createRequire(import.meta.url);


/**
 * SQLite cell store (Node's built-in node:sqlite). Real, dependency-free, and
 * fully testable offline — the reference implementation of the SQL projection
 * pattern that Postgres/MySQL reuse. JSON cell payload in a TEXT column, indexed
 * on key.
 */
export class SqliteCellStore implements CellStore {
  readonly name = "sqlite";
  private db: any;

  constructor(private readonly path = ":memory:") {}

  private async ensure(): Promise<any> {
    if (this.db) return this.db;
    const { DatabaseSync } = nodeRequire("node:sqlite") as { DatabaseSync: new (p: string) => any };
    this.db = new DatabaseSync(this.path);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS gridz_cells (
        subject TEXT NOT NULL,
        key TEXT NOT NULL,
        id TEXT NOT NULL,
        value_hash TEXT NOT NULL,
        cell_json TEXT NOT NULL,
        written_at TEXT NOT NULL,
        PRIMARY KEY (subject, key)
      );
      CREATE INDEX IF NOT EXISTS gridz_cells_key ON gridz_cells (key);
      CREATE INDEX IF NOT EXISTS gridz_cells_id ON gridz_cells (id);
    `);
    return this.db;
  }

  async init(): Promise<void> {
    await this.ensure();
  }

  async ping(): Promise<boolean> {
    const db = await this.ensure();
    return db.prepare("SELECT 1 AS ok").get() !== undefined;
  }

  async put(subject: string, cell: Cell): Promise<string> {
    const db = await this.ensure();
    db.prepare(
      `INSERT INTO gridz_cells (subject, key, id, value_hash, cell_json, written_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(subject, key) DO UPDATE SET
         id=excluded.id, value_hash=excluded.value_hash,
         cell_json=excluded.cell_json, written_at=excluded.written_at`,
    ).run(subject, cell.key, cell.id, cell.attestation.value_hash, encodeCell(cell), new Date().toISOString());
    return `sqlite://gridz_cells/${encodeURIComponent(subject)}/${cell.key}`;
  }

  async list(subject: string, keys?: string[]): Promise<Cell[]> {
    const db = await this.ensure();
    let rows: { cell_json: string }[];
    if (keys && keys.length > 0) {
      const placeholders = keys.map(() => "?").join(",");
      rows = db
        .prepare(`SELECT cell_json FROM gridz_cells WHERE subject=? AND key IN (${placeholders})`)
        .all(subject, ...keys);
    } else {
      rows = db.prepare("SELECT cell_json FROM gridz_cells WHERE subject=?").all(subject);
    }
    return rows.map((r) => decodeCell(r.cell_json));
  }

  async removeByIds(_subject: string, ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const db = await this.ensure();
    const placeholders = ids.map(() => "?").join(",");
    db.prepare(`DELETE FROM gridz_cells WHERE id IN (${placeholders})`).run(...ids);
  }

  close(): void {
    if (this.db) this.db.close();
  }
}
