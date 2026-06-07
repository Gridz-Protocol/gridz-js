import type { EnsBackend } from "../../src/index.js";

/**
 * In-memory ENS backend mirroring on-chain text-record semantics: setting an
 * empty string clears the record (so getText returns null), exactly like ENS.
 */
export class FakeEnsBackend implements EnsBackend {
  private store = new Map<string, string>();
  public writes = 0;

  private k(name: string, key: string): string {
    return `${name}\n${key}`;
  }

  async getText(name: string, key: string): Promise<string | null> {
    return this.store.get(this.k(name, key)) ?? null;
  }

  async setText(name: string, key: string, value: string): Promise<{ txHash: string }> {
    this.writes += 1;
    if (value === "") this.store.delete(this.k(name, key));
    else this.store.set(this.k(name, key), value);
    return { txHash: `0x${this.writes.toString(16).padStart(64, "0")}` };
  }
}
