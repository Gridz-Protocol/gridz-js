/**
 * Static metadata served by /schemas and /templates. Templates carry field
 * SHAPE only — never content/values (see BRIEF §8). Per-key value schemas are
 * stubs here; the full widget schemas land with the renderer step.
 */

export interface KeyDescriptor {
  key: string;
  source: "ensip-5" | "ensip-18" | "ensip-25" | "ensip-26" | "gridz";
  value_schema: Record<string, unknown>;
  description: string;
}

const STRING = { type: "string" } as const;

export const KEY_REGISTRY: Record<string, KeyDescriptor> = {
  alias: { key: "alias", source: "ensip-18", value_schema: { ...STRING, maxLength: 50 }, description: "Short display name." },
  description: { key: "description", source: "ensip-5", value_schema: STRING, description: "Biography / summary." },
  avatar: { key: "avatar", source: "ensip-5", value_schema: { ...STRING, format: "uri" }, description: "Avatar image URL or NFT URI." },
  url: { key: "url", source: "ensip-5", value_schema: { ...STRING, format: "uri" }, description: "Website URL." },
  "com.github": { key: "com.github", source: "ensip-5", value_schema: STRING, description: "GitHub username (bare)." },
  "agent-context": { key: "agent-context", source: "ensip-26", value_schema: STRING, description: "Free-form context for agentic systems." },
  "gridz.poll": {
    key: "gridz.poll",
    source: "gridz",
    value_schema: {
      type: "object",
      required: ["q", "options"],
      properties: { q: STRING, options: { type: "array", items: STRING } },
    },
    description: "A poll widget.",
  },
};

export interface TemplateMeta {
  name: string;
  for: string;
  description: string;
  /** Key SHAPE only — values are the operator's to fill (never invented). */
  keys: string[];
}

export const TEMPLATES: TemplateMeta[] = [
  { name: "minimal", for: "anyone", description: "3 cells, no widgets.", keys: ["alias", "description", "url"] },
  { name: "humans-basic", for: "individuals", description: "Profile basics.", keys: ["avatar", "header", "com.github", "social.bsky"] },
  {
    name: "humans-creator",
    for: "creators",
    description: "Adds creator widgets.",
    keys: ["gridz.stats", "gridz.currently", "gridz.social_link", "gridz.message_me"],
  },
  {
    name: "agents-mcp",
    for: "AI agents",
    description: "Agent discovery basics.",
    keys: ["agent-context", "agent-endpoint[mcp]", "agent-endpoint[a2a]", "agent.capabilities"],
  },
  {
    name: "agents-erc8004",
    for: "trustless agents",
    description: "Agent registry + metadata.",
    keys: ["agent-context", "agent-endpoint[mcp]", "agent-registration[]", "agent.model", "agent.version", "agent.operator"],
  },
  {
    name: "org-multisig",
    for: "organizations",
    description: "Multi-signer subject.",
    keys: ["description", "url", "primary-contact"],
  },
];
