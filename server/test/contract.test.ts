import { describe, it, expect, beforeAll } from "vitest";
import type { FastifyInstance } from "fastify";
import {
  LocalEip712Signer,
  buildGrid,
  buildCellAttestation,
  hashUtf8,
  type Cell,
  type Grid,
} from "@gridz/core";
import { buildApp } from "../src/index.js";

const CHAIN_ID = 11155111;
const RESOLVER = "0x000000000000000000000000000000000000c0de" as const;
const NOW = new Date("2026-01-01T00:00:00.000Z");
const POS = { x: 0, y: 0, w: 1, h: 1 };

const signer = LocalEip712Signer.fromPrivateKey(
  hashUtf8("keccak256", "gridz/__example__/server/1"),
  CHAIN_ID,
);

let DID: string;
let GRID: Grid;

async function freshGrid(): Promise<Grid> {
  return buildGrid(signer, {
    subject: { type: "human", did: DID },
    theme: {
      background_type: "solid",
      background_value: "#0b0b0f",
      accent_color: "#7c5cff",
      text_color: "#fff",
      card_style: "rounded",
      card_background: "#16161c",
      font_family: "sans",
    },
    chainId: CHAIN_ID,
    verifyingContract: RESOLVER,
    now: NOW,
    cells: [
      { id: "c1", key: "alias", value: "gridz-example", position: POS, size: "1x1" },
      { id: "c2", key: "description", value: "an example grid", position: POS, size: "2x1" },
    ],
  });
}

async function freshCell(key: string, value: unknown): Promise<Cell> {
  const att = await buildCellAttestation(signer, {
    subjectDid: DID,
    key,
    value,
    chainId: CHAIN_ID,
    verifyingContract: RESOLVER,
    now: NOW,
  });
  return { id: `cell-${key}`, key, value, position: POS, size: "1x1", is_visible: true, attestation: att };
}

beforeAll(async () => {
  DID = await signer.did();
  GRID = await freshGrid();
});

function newApp(): Promise<FastifyInstance> {
  return buildApp();
}

describe("system + openapi", () => {
  it("healthz/readyz/openapi", async () => {
    const app = await newApp();
    expect((await app.inject({ method: "GET", url: "/healthz" })).json()).toEqual({ status: "ok" });
    expect((await app.inject({ method: "GET", url: "/readyz" })).json()).toEqual({ status: "ready" });
    const doc = (await app.inject({ method: "GET", url: "/openapi.json" })).json();
    expect(doc.openapi).toBe("3.1.0");
    expect(Object.keys(doc.paths)).toContain("/grids/{subject}");
  });
});

describe("grids", () => {
  it("upserts a verified grid and fetches it back", async () => {
    const app = await newApp();
    const enc = encodeURIComponent(DID);
    const post = await app.inject({ method: "POST", url: `/grids/${enc}`, payload: GRID });
    expect(post.statusCode).toBe(200);
    expect(post.json()).toMatchObject({ ok: true, stored: true, verify: { ok: true } });

    const get = await app.inject({ method: "GET", url: `/grids/${enc}` });
    expect(get.statusCode).toBe(200);
    expect(get.json().subject.did).toBe(DID);
  });

  it("rejects a subject/path mismatch", async () => {
    const app = await newApp();
    const res = await app.inject({ method: "POST", url: `/grids/did%3Awrong`, payload: GRID });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("subject_mismatch");
  });

  it("rejects a tampered grid with 422", async () => {
    const app = await newApp();
    const enc = encodeURIComponent(DID);
    const tampered = structuredClone(GRID);
    tampered.cells[0]!.value = "tampered";
    const res = await app.inject({ method: "POST", url: `/grids/${enc}`, payload: tampered });
    expect(res.statusCode).toBe(422);
    expect(res.json().error).toBe("verification_failed");
  });

  it("404s an unknown grid", async () => {
    const app = await newApp();
    const res = await app.inject({ method: "GET", url: `/grids/${encodeURIComponent("did:web:nobody.example")}` });
    expect(res.statusCode).toBe(404);
  });
});

describe("cells", () => {
  it("upserts and fetches a cell, then revokes it", async () => {
    const app = await newApp();
    const enc = encodeURIComponent(DID);
    await app.inject({ method: "POST", url: `/grids/${enc}`, payload: GRID });

    const cell = await freshCell("url", "https://gridz.dev");
    const put = await app.inject({ method: "PUT", url: `/grids/${enc}/cells/url`, payload: cell });
    expect(put.statusCode).toBe(200);
    expect(put.json().result.ok).toBe(true);

    const get = await app.inject({ method: "GET", url: `/grids/${enc}/cells/url` });
    expect(get.json().value).toBe("https://gridz.dev");

    const revocation = await buildCellAttestation(signer, {
      subjectDid: DID,
      key: "__revoke__",
      value: { revoke: "url" },
      chainId: CHAIN_ID,
      verifyingContract: RESOLVER,
      now: NOW,
    });
    const del = await app.inject({
      method: "DELETE",
      url: `/grids/${enc}/cells/url`,
      payload: { attestation: revocation, value: { revoke: "url" } },
    });
    expect(del.statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: `/grids/${enc}/cells/url` })).statusCode).toBe(404);
  });

  it("rejects a cell with a key/path mismatch", async () => {
    const app = await newApp();
    const enc = encodeURIComponent(DID);
    await app.inject({ method: "POST", url: `/grids/${enc}`, payload: GRID });
    const cell = await freshCell("url", "x");
    const res = await app.inject({ method: "PUT", url: `/grids/${enc}/cells/alias`, payload: cell });
    expect(res.statusCode).toBe(400);
  });

  it("rejects a PUT when the grid does not exist", async () => {
    const app = await newApp();
    const cell = await freshCell("url", "x");
    const res = await app.inject({ method: "PUT", url: `/grids/${encodeURIComponent("did:web:ghost.example")}/cells/url`, payload: cell });
    expect(res.statusCode).toBe(404);
  });

  it("rejects a revocation that does not target the key", async () => {
    const app = await newApp();
    const enc = encodeURIComponent(DID);
    await app.inject({ method: "POST", url: `/grids/${enc}`, payload: GRID });
    const att = await buildCellAttestation(signer, {
      subjectDid: DID,
      key: "__revoke__",
      value: { revoke: "description" },
      chainId: CHAIN_ID,
      verifyingContract: RESOLVER,
      now: NOW,
    });
    const res = await app.inject({
      method: "DELETE",
      url: `/grids/${enc}/cells/alias`,
      payload: { attestation: att, value: { revoke: "description" } },
    });
    expect(res.statusCode).toBe(422);
  });
});

describe("verify / sinks / schemas / templates", () => {
  it("verifies a grid via /verify", async () => {
    const app = await newApp();
    const ok = await app.inject({ method: "POST", url: "/verify", payload: { grid: GRID } });
    expect(ok.json().ok).toBe(true);
    const bad = await app.inject({ method: "POST", url: "/verify", payload: {} });
    expect(bad.statusCode).toBe(400);
  });

  it("verifies a single attestation via /verify", async () => {
    const app = await newApp();
    const cell = await freshCell("alias", "gridz-example");
    const res = await app.inject({
      method: "POST",
      url: "/verify",
      payload: { attestation: cell.attestation, value: "gridz-example" },
    });
    expect(res.json().ok).toBe(true);
    expect(res.json().status).toBe("verified");
  });

  it("lists sinks and publishes to the memory sink", async () => {
    const app = await newApp();
    const enc = encodeURIComponent(DID);
    await app.inject({ method: "POST", url: `/grids/${enc}`, payload: GRID });

    const sinks = (await app.inject({ method: "GET", url: "/sinks" })).json();
    expect(sinks.sinks.map((s: { name: string }) => s.name)).toContain("memory");

    const pub = await app.inject({ method: "POST", url: "/sinks/memory/publish", payload: { subject: DID } });
    expect(pub.statusCode).toBe(200);
    expect(pub.json().results).toHaveLength(GRID.cells.length);

    const ens = await app.inject({ method: "POST", url: "/sinks/ens/publish", payload: { subject: DID } });
    expect(ens.statusCode).toBe(400);
    expect(ens.json().detail).toContain("client-side");
  });

  it("serves key schemas and 404s unknown keys", async () => {
    const app = await newApp();
    expect((await app.inject({ method: "GET", url: "/schemas/alias" })).json().source).toBe("ensip-18");
    expect((await app.inject({ method: "GET", url: "/schemas/totally.unknown" })).statusCode).toBe(404);
  });

  it("lists templates (shape only) and fetches one", async () => {
    const app = await newApp();
    const list = (await app.inject({ method: "GET", url: "/templates" })).json();
    expect(list.templates.map((t: { name: string }) => t.name)).toContain("minimal");
    const minimal = (await app.inject({ method: "GET", url: "/templates/minimal" })).json();
    expect(minimal.keys).toEqual(["alias", "description", "url"]);
    expect((await app.inject({ method: "GET", url: "/templates/nope" })).statusCode).toBe(404);
  });
});
