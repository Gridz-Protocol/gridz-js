import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { AddressInfo } from "node:net";
import { buildApp } from "@gridz/server";
import {
  GridzClient,
  GridzApiError,
  buildGrid,
  buildCellAttestation,
  LocalEip712Signer,
  type Grid,
} from "../src/index.js";
import { hashUtf8 } from "@gridz/core";

const CHAIN_ID = 11155111;
const RESOLVER = "0x000000000000000000000000000000000000c0de" as const;
const NOW = new Date("2026-01-01T00:00:00.000Z");
const POS = { x: 0, y: 0, w: 1, h: 1 };

const signer = LocalEip712Signer.fromPrivateKey(
  hashUtf8("keccak256", "gridz/__example__/sdk/1"),
  CHAIN_ID,
);

let app: Awaited<ReturnType<typeof buildApp>>;
let client: GridzClient;
let DID: string;
let GRID: Grid;

beforeAll(async () => {
  DID = await signer.did();
  app = await buildApp();
  await app.listen({ port: 0, host: "127.0.0.1" });
  const { port } = app.server.address() as AddressInfo;
  client = new GridzClient({ baseUrl: `http://127.0.0.1:${port}` });

  GRID = await buildGrid(signer, {
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
    cells: [{ id: "c1", key: "alias", value: "gridz-example", position: POS, size: "1x1" }],
  });
});

afterAll(async () => {
  await app.close();
});

describe("GridzClient against a live server", () => {
  it("publishes and reads back a grid", async () => {
    const put = await client.putGrid(GRID);
    expect(put.ok).toBe(true);
    expect(put.verify.ok).toBe(true);

    const got = await client.getGrid(DID);
    expect(got?.subject.did).toBe(DID);
    expect(await client.getGrid("did:web:absent.example")).toBeNull();
  });

  it("upserts, reads, and revokes a cell", async () => {
    await client.putGrid(GRID);
    const att = await buildCellAttestation(signer, {
      subjectDid: DID,
      key: "url",
      value: "https://gridz.dev",
      chainId: CHAIN_ID,
      verifyingContract: RESOLVER,
      now: NOW,
    });
    const put = await client.putCell(DID, {
      id: "c-url",
      key: "url",
      value: "https://gridz.dev",
      position: POS,
      size: "1x1",
      is_visible: true,
      attestation: att,
    });
    expect(put.result.ok).toBe(true);
    expect((await client.getCell(DID, "url"))?.value).toBe("https://gridz.dev");

    const revocation = await buildCellAttestation(signer, {
      subjectDid: DID,
      key: "__revoke__",
      value: { revoke: "url" },
      chainId: CHAIN_ID,
      verifyingContract: RESOLVER,
      now: NOW,
    });
    const del = await client.deleteCell(DID, "url", { attestation: revocation, value: { revoke: "url" } });
    expect(del.deleted).toBe(true);
    expect(await client.getCell(DID, "url")).toBeNull();
  });

  it("verifies, lists sinks/templates/schemas, and publishes", async () => {
    await client.putGrid(GRID);
    const v = (await client.verify({ grid: GRID })) as { ok: boolean };
    expect(v.ok).toBe(true);

    expect((await client.listSinks()).sinks.map((s) => s.name)).toContain("memory");
    expect((await client.listTemplates()).templates.map((t) => t.name)).toContain("minimal");
    expect(await client.getSchema("alias")).not.toBeNull();
    expect(await client.getSchema("totally.unknown")).toBeNull();
    expect(await client.getTemplate("minimal")).not.toBeNull();
    expect(await client.getTemplate("nope")).toBeNull();

    const pub = await client.publish("memory", { subject: DID });
    expect(pub.results.length).toBeGreaterThan(0);
  });

  it("surfaces API errors as GridzApiError", async () => {
    const bad = structuredClone(GRID);
    bad.cells[0]!.value = "tampered";
    await expect(client.putGrid(bad)).rejects.toBeInstanceOf(GridzApiError);
  });
});
