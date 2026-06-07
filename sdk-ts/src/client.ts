import type { AttestationRef, Cell, Grid, GridVerifyResult, VerifyResult } from "@gridz/core";

export interface GridzClientOptions {
  baseUrl: string;
  /** Inject a fetch implementation (default: global fetch). */
  fetch?: typeof fetch;
}

export class GridzApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown,
  ) {
    super(`Gridz API error ${status}`);
    this.name = "GridzApiError";
  }
}

interface PublishResult {
  ok: boolean;
  results: { cell_id: string; sink_id: string; written_at: string; sink_native_uri: string }[];
}

/**
 * High-level client over the Gridz API. Returns @gridz/core types. Pair with the
 * re-exported `buildGrid`/`verifyGrid` from @gridz/sdk to sign locally then push —
 * the client never sees a private key.
 */
export class GridzClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: GridzClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, "");
    this.fetchImpl = opts.fetch ?? fetch;
  }

  private async req<T>(
    method: string,
    path: string,
    body?: unknown,
    okStatuses: number[] = [200],
  ): Promise<{ status: number; data: T }> {
    const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method,
      headers: body !== undefined ? { "content-type": "application/json" } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    const data = text ? (JSON.parse(text) as T) : (null as T);
    if (!okStatuses.includes(res.status)) throw new GridzApiError(res.status, data);
    return { status: res.status, data };
  }

  private enc(s: string): string {
    return encodeURIComponent(s);
  }

  async getGrid(subject: string): Promise<Grid | null> {
    const res = await this.req<Grid>("GET", `/grids/${this.enc(subject)}`, undefined, [200, 404]);
    return res.status === 404 ? null : res.data;
  }

  async putGrid(grid: Grid): Promise<{ ok: boolean; verify: GridVerifyResult }> {
    const subject = grid.subject.ens ?? grid.subject.did;
    const { data } = await this.req<{ ok: boolean; verify: GridVerifyResult }>(
      "POST",
      `/grids/${this.enc(subject)}`,
      grid,
    );
    return data;
  }

  async getCell(subject: string, key: string): Promise<Cell | null> {
    const res = await this.req<Cell>(
      "GET",
      `/grids/${this.enc(subject)}/cells/${this.enc(key)}`,
      undefined,
      [200, 404],
    );
    return res.status === 404 ? null : res.data;
  }

  async putCell(subject: string, cell: Cell): Promise<{ ok: boolean; result: VerifyResult }> {
    const { data } = await this.req<{ ok: boolean; result: VerifyResult }>(
      "PUT",
      `/grids/${this.enc(subject)}/cells/${this.enc(cell.key)}`,
      cell,
    );
    return data;
  }

  async deleteCell(
    subject: string,
    key: string,
    revocation: { attestation: AttestationRef; value: unknown },
  ): Promise<{ ok: boolean; deleted: boolean }> {
    const { data } = await this.req<{ ok: boolean; deleted: boolean }>(
      "DELETE",
      `/grids/${this.enc(subject)}/cells/${this.enc(key)}`,
      revocation,
    );
    return data;
  }

  async verify(input: { grid: Grid } | { attestation: AttestationRef; value: unknown }): Promise<unknown> {
    const { data } = await this.req<unknown>("POST", "/verify", input);
    return data;
  }

  async listSinks(): Promise<{ sinks: { name: string; capabilities: unknown }[] }> {
    return (await this.req<{ sinks: { name: string; capabilities: unknown }[] }>("GET", "/sinks")).data;
  }

  async publish(sink: string, body: { subject: string; cell_ids?: string[] }): Promise<PublishResult> {
    return (await this.req<PublishResult>("POST", `/sinks/${this.enc(sink)}/publish`, body)).data;
  }

  async getSchema(key: string): Promise<unknown | null> {
    const res = await this.req<unknown>("GET", `/schemas/${this.enc(key)}`, undefined, [200, 404]);
    return res.status === 404 ? null : res.data;
  }

  async listTemplates(): Promise<{ templates: { name: string; keys: string[] }[] }> {
    return (await this.req<{ templates: { name: string; keys: string[] }[] }>("GET", "/templates")).data;
  }

  async getTemplate(name: string): Promise<unknown | null> {
    const res = await this.req<unknown>("GET", `/templates/${this.enc(name)}`, undefined, [200, 404]);
    return res.status === 404 ? null : res.data;
  }
}
