import { FastMCP } from "fastmcp";
import { z } from "zod";
import {
  MemoryStore,
  cellPrepareWrite,
  cellAttachSignature,
  gridVerify,
  sinkPublish,
  schemaSuggestKey,
  bootstrapListTemplates,
  bootstrapFromTemplate,
  identityListSigners,
  type GridStore,
  type Prepared,
  type PrepareWriteInput,
} from "./handlers.js";
import type { Hex } from "@gridz/core";

const j = (v: unknown): string => JSON.stringify(v);

/**
 * Build the Gridz MCP server. Identical tool surface to the Python server. The
 * server never signs: cell.prepare_write returns an unsigned EIP-712 payload and
 * cell.attach_signature stitches in a signature produced by the agent host.
 */
export function createServer(store: GridStore = new MemoryStore()): FastMCP {
  const server = new FastMCP({ name: "gridz", version: "0.1.0" });

  server.addTool({
    name: "grid.read",
    description: "Read a Grid by subject (DID or ENS).",
    parameters: z.object({ subject: z.string() }),
    execute: async ({ subject }) => j(store.getGrid(subject)),
  });

  server.addTool({
    name: "grid.verify",
    description: "Verify a Grid; returns per-cell and root status.",
    parameters: z.object({ grid: z.any() }),
    execute: async ({ grid }) => j(await gridVerify(grid)),
  });

  server.addTool({
    name: "cell.read",
    description: "Read a single cell by subject + key.",
    parameters: z.object({ subject: z.string(), key: z.string() }),
    execute: async ({ subject, key }) => j(store.getCell(subject, key)),
  });

  server.addTool({
    name: "cell.prepare_write",
    description: "Prepare an unsigned EIP-712 payload for a cell. Signing is client-side.",
    parameters: z.object({
      subject_did: z.string(),
      key: z.string(),
      value: z.any(),
      widget_type: z.string().optional(),
      size: z.string().optional(),
      chain_id: z.number(),
      verifying_contract: z.string(),
      nonce: z.number().optional(),
      expires_at: z.string().optional(),
      oneclaw: z.object({ agent_id: z.string() }).optional(),
    }),
    execute: async (args) =>
      j(cellPrepareWrite({ ...args, verifying_contract: args.verifying_contract as Hex } as PrepareWriteInput)),
  });

  server.addTool({
    name: "cell.attach_signature",
    description: "Attach a detached signature to a prepared payload, yielding a verifiable cell.",
    parameters: z.object({ prepared: z.any(), signature: z.string(), attester: z.string() }),
    execute: async ({ prepared, signature, attester }) =>
      j(cellAttachSignature({ prepared: prepared as Prepared, signature: signature as Hex, attester })),
  });

  server.addTool({
    name: "sink.publish",
    description: "Publish a stored grid's cells to a sink (memory only server-side).",
    parameters: z.object({ subject: z.string(), sink: z.string(), cell_ids: z.array(z.string()).optional() }),
    execute: async (args) => j(await sinkPublish(store, args)),
  });

  server.addTool({
    name: "schema.suggest_key",
    description: "Suggest a standard key for a free-text field description.",
    parameters: z.object({ description: z.string() }),
    execute: async ({ description }) => j(schemaSuggestKey(description)),
  });

  server.addTool({
    name: "identity.list_signers",
    description: "List signers configured server-side (always empty — no key custody).",
    parameters: z.object({}),
    execute: async () => j(identityListSigners()),
  });

  server.addTool({
    name: "bootstrap.list_templates",
    description: "List bootstrap templates (shape only).",
    parameters: z.object({}),
    execute: async () => j(bootstrapListTemplates()),
  });

  server.addTool({
    name: "bootstrap.from_template",
    description: "Return a template's config draft (shape only).",
    parameters: z.object({ template_name: z.string() }),
    execute: async ({ template_name }) => j(bootstrapFromTemplate(template_name)),
  });

  // --- resources ---
  server.addResourceTemplate({
    uriTemplate: "grid://{subject}",
    name: "Grid",
    mimeType: "application/json",
    arguments: [{ name: "subject", description: "Subject DID or ENS", required: true }],
    load: async ({ subject }) => ({ text: j(store.getGrid(subject)) }),
  });

  server.addResourceTemplate({
    uriTemplate: "grid-cell://{subject}/{key}",
    name: "Grid cell",
    mimeType: "application/json",
    arguments: [
      { name: "subject", required: true },
      { name: "key", required: true },
    ],
    load: async ({ subject, key }) => ({ text: j(store.getCell(subject, key)) }),
  });

  server.addResourceTemplate({
    uriTemplate: "bootstrap-template://{name}",
    name: "Bootstrap template",
    mimeType: "application/json",
    arguments: [{ name: "name", required: true }],
    load: async ({ name }) => ({ text: j(bootstrapFromTemplate(name)) }),
  });

  // --- prompts ---
  server.addPrompt({
    name: "compose_profile",
    description: "Draft a starter Grid for a subject. Asks before inventing any value.",
    arguments: [{ name: "subject_type", description: "human | agent | organization", required: true }],
    load: async ({ subject_type }) =>
      `You are composing a Gridz profile for a ${subject_type}. Offer field SHAPE suggestions only. ` +
      `Do NOT invent values (names, bios, links). Ask the operator for each value, and confirm before writing.`,
  });

  server.addPrompt({
    name: "verify_and_explain",
    description: "Verify a Grid and explain any failures in plain English.",
    arguments: [{ name: "subject", description: "Subject to read + verify", required: true }],
    load: async ({ subject }) =>
      `Read grid://${subject}, call grid.verify, and explain each cell's status (verified/expired/failed) plainly.`,
  });

  return server;
}
