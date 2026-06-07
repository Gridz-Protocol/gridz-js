import Fastify, { type FastifyInstance } from "fastify";
import swagger from "@fastify/swagger";
import {
  verifyGrid,
  verifyCell,
  verifyAttestation,
  type AttestationRef,
  type Cell,
  type Grid,
} from "@gridz/core";
import { MemorySink, type Sink, type WriteResult } from "@gridz/sinks";
import { MemoryGridRepository, type GridRepository } from "./repo.js";
import { KEY_REGISTRY, TEMPLATES } from "./registry.js";

export interface BuildAppOptions {
  repo?: GridRepository;
  sinks?: Map<string, Sink>;
}

const bodyObject = { type: "object", additionalProperties: true } as const;

/**
 * The Gridz reference API. There is no traditional auth: write endpoints require
 * a valid signed attestation in the body, which the server verifies against the
 * subject's DID. The server never holds a private key.
 */
export async function buildApp(opts: BuildAppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  const repo = opts.repo ?? new MemoryGridRepository();
  const sinks = opts.sinks ?? new Map<string, Sink>([["memory", new MemorySink()]]);

  await app.register(swagger, {
    openapi: {
      openapi: "3.1.0",
      info: {
        title: "Gridz API",
        version: "0.1.0",
        description:
          "Cryptographically-attested social graphs. Write endpoints require a signed attestation; the server validates it against the subject DID and never custodies keys.",
      },
      tags: [
        { name: "grids" },
        { name: "cells" },
        { name: "verify" },
        { name: "sinks" },
        { name: "schemas" },
        { name: "templates" },
        { name: "system" },
      ],
    },
  });

  // --- system ---
  app.get("/healthz", { schema: { tags: ["system"], summary: "Liveness" } }, async () => ({ status: "ok" }));
  app.get("/readyz", { schema: { tags: ["system"], summary: "Readiness" } }, async () => ({ status: "ready" }));
  app.get("/openapi.json", { schema: { tags: ["system"], summary: "OpenAPI document" } }, async () => app.swagger());

  // --- grids ---
  app.get(
    "/grids/:subject",
    { schema: { tags: ["grids"], summary: "Fetch a grid", params: subjectParams } },
    async (req, reply) => {
      const { subject } = req.params as { subject: string };
      const grid = repo.get(subject);
      if (!grid) return reply.code(404).send({ error: "not_found" });
      return grid;
    },
  );

  app.post(
    "/grids/:subject",
    { schema: { tags: ["grids"], summary: "Upsert a grid (requires a signed root attestation)", params: subjectParams, body: bodyObject } },
    async (req, reply) => {
      const { subject } = req.params as { subject: string };
      const grid = req.body as Grid;
      if (subject !== grid.subject?.did && subject !== grid.subject?.ens) {
        return reply.code(400).send({ error: "subject_mismatch", detail: "path subject must match grid.subject.did or .ens" });
      }
      const verify = await verifyGrid(grid);
      if (!verify.ok) return reply.code(422).send({ error: "verification_failed", verify });
      repo.put(subject, grid);
      return reply.code(200).send({ ok: true, stored: true, verify });
    },
  );

  // --- cells ---
  app.get(
    "/grids/:subject/cells/:key",
    { schema: { tags: ["cells"], summary: "Fetch a single cell", params: cellParams } },
    async (req, reply) => {
      const { subject, key } = req.params as { subject: string; key: string };
      const cell = repo.getCell(subject, key);
      if (!cell) return reply.code(404).send({ error: "not_found" });
      return cell;
    },
  );

  app.put(
    "/grids/:subject/cells/:key",
    { schema: { tags: ["cells"], summary: "Upsert a cell (requires a signed cell attestation)", params: cellParams, body: bodyObject } },
    async (req, reply) => {
      const { subject, key } = req.params as { subject: string; key: string };
      const cell = req.body as Cell;
      if (cell.key !== key) return reply.code(400).send({ error: "key_mismatch" });
      const grid = repo.get(subject);
      if (!grid) return reply.code(404).send({ error: "grid_not_found", detail: "POST the grid first to establish the subject" });
      const result = await verifyCell(cell, { subjectDid: grid.subject.did });
      if (!result.ok) return reply.code(422).send({ error: "verification_failed", result });
      repo.putCell(subject, cell);
      return reply.code(200).send({ ok: true, result });
    },
  );

  app.delete(
    "/grids/:subject/cells/:key",
    { schema: { tags: ["cells"], summary: "Tombstone a cell (requires a revocation attestation)", params: cellParams, body: bodyObject } },
    async (req, reply) => {
      const { subject, key } = req.params as { subject: string; key: string };
      const body = (req.body ?? {}) as { attestation?: AttestationRef; value?: unknown };
      const grid = repo.get(subject);
      if (!grid) return reply.code(404).send({ error: "grid_not_found" });
      if (!body.attestation) return reply.code(400).send({ error: "revocation_required" });
      const result = await verifyAttestation(body.attestation, body.value, { subjectDid: grid.subject.did });
      const revokesThisKey = (body.value as { revoke?: string } | undefined)?.revoke === key;
      if (!result.ok || !revokesThisKey) {
        return reply.code(422).send({ error: "invalid_revocation", result });
      }
      const deleted = repo.deleteCell(subject, key);
      if (!deleted) return reply.code(404).send({ error: "cell_not_found" });
      return reply.code(200).send({ ok: true, deleted: true });
    },
  );

  // --- verify ---
  app.post(
    "/verify",
    { schema: { tags: ["verify"], summary: "Verify a grid or a single attestation", body: bodyObject } },
    async (req, reply) => {
      const body = req.body as { grid?: Grid; attestation?: AttestationRef; value?: unknown };
      if (body.grid) return verifyGrid(body.grid);
      if (body.attestation) return verifyAttestation(body.attestation, body.value);
      return reply.code(400).send({ error: "nothing_to_verify", detail: "provide { grid } or { attestation, value }" });
    },
  );

  // --- sinks ---
  app.get("/sinks", { schema: { tags: ["sinks"], summary: "List configured sinks" } }, async () => ({
    sinks: [...sinks.values()].map((s) => ({ name: s.name, capabilities: s.capabilities })),
  }));

  app.post(
    "/sinks/:name/publish",
    { schema: { tags: ["sinks"], summary: "Publish a stored grid's cells to a sink", params: { type: "object", properties: { name: { type: "string" } } }, body: bodyObject } },
    async (req, reply) => {
      const { name } = req.params as { name: string };
      const { subject, cell_ids } = (req.body ?? {}) as { subject?: string; cell_ids?: string[] };
      const sink = sinks.get(name);
      if (!sink) {
        return reply.code(400).send({
          error: "unsupported_sink",
          detail:
            name === "ens"
              ? "ENS publishing is client-side: the server does not custody wallets/keys"
              : `no server-side sink named ${name}`,
        });
      }
      if (!subject) return reply.code(400).send({ error: "subject_required" });
      const grid = repo.get(subject);
      if (!grid) return reply.code(404).send({ error: "grid_not_found" });
      const cells = cell_ids ? grid.cells.filter((c) => cell_ids.includes(c.id)) : grid.cells;
      const results: WriteResult[] = await sink.write(cells, { subject: grid.subject });
      return { ok: true, results };
    },
  );

  // --- schemas ---
  app.get(
    "/schemas/:key",
    { schema: { tags: ["schemas"], summary: "Fetch the value schema for a standard key", params: { type: "object", properties: { key: { type: "string" } } } } },
    async (req, reply) => {
      const { key } = req.params as { key: string };
      const desc = KEY_REGISTRY[key];
      if (!desc) {
        return reply.code(404).send({ error: "unknown_key", detail: "dynamic keys are valid but have no registered schema; values fall back to the Generic renderer" });
      }
      return desc;
    },
  );

  // --- templates ---
  app.get("/templates", { schema: { tags: ["templates"], summary: "List bootstrap templates (shape only)" } }, async () => ({ templates: TEMPLATES }));
  app.get(
    "/templates/:name",
    { schema: { tags: ["templates"], summary: "Fetch a template's shape", params: { type: "object", properties: { name: { type: "string" } } } } },
    async (req, reply) => {
      const { name } = req.params as { name: string };
      const tmpl = TEMPLATES.find((t) => t.name === name);
      if (!tmpl) return reply.code(404).send({ error: "not_found" });
      return tmpl;
    },
  );

  return app;
}

const subjectParams = {
  type: "object",
  required: ["subject"],
  properties: { subject: { type: "string", description: "Subject DID (or ENS name)" } },
} as const;

const cellParams = {
  type: "object",
  required: ["subject", "key"],
  properties: { subject: { type: "string" }, key: { type: "string" } },
} as const;
