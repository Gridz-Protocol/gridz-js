import type { Theme } from "@gridz/core";

/** Authoring config: a Grid draft before signing. Mirrors gridz.yaml. */
export interface ConfigCell {
  key: string;
  value: unknown;
  widget_type?: string;
  size?: string;
  is_visible?: boolean;
  /** Set by templates; `gridz grid validate` fails until the operator fills it. */
  _needs_input?: boolean;
  /** Set by import flows for records the operator has not yet signed. */
  _unattested?: boolean;
}

export interface GridzConfig {
  schema_version: "gridz/1.0.0";
  subject: { type: "human" | "agent" | "organization"; did?: string | null; ens?: string };
  theme: Theme;
  cells: ConfigCell[];
  /** Only present on org templates. */
  signers?: { did: string; weight?: number }[];
}

export const DEFAULT_THEME: Theme = {
  background_type: "solid",
  background_value: "#0b0b0f",
  accent_color: "#7c5cff",
  text_color: "#f4f4f5",
  card_style: "rounded",
  card_background: "#16161c",
  font_family: "sans",
  show_gridz_badge: true,
};

const needs = (key: string, size = "1x1", extra: Partial<ConfigCell> = {}): ConfigCell => ({
  key,
  value: null,
  _needs_input: true,
  size,
  ...extra,
});

/**
 * Bundled bootstrap templates. They carry field SHAPE only — never content. Every
 * value is null + _needs_input until the operator fills it (BRIEF §8). No examples,
 * no placeholders, no suggested values.
 */
export const TEMPLATES: Record<string, GridzConfig> = {
  minimal: {
    schema_version: "gridz/1.0.0",
    subject: { type: "human", did: null },
    theme: DEFAULT_THEME,
    cells: [needs("alias"), needs("description", "2x1"), needs("url")],
  },
  "humans-basic": {
    schema_version: "gridz/1.0.0",
    subject: { type: "human", did: null },
    theme: DEFAULT_THEME,
    cells: [
      needs("alias"),
      needs("description", "2x1"),
      needs("avatar"),
      needs("header", "3x1"),
      needs("com.github"),
      needs("social.bsky"),
    ],
  },
  "humans-creator": {
    schema_version: "gridz/1.0.0",
    subject: { type: "human", did: null },
    theme: DEFAULT_THEME,
    cells: [
      needs("alias"),
      needs("description", "2x1"),
      needs("gridz.stats", "2x1", { widget_type: "gridz.stats" }),
      needs("gridz.currently", "2x1", { widget_type: "gridz.currently" }),
      needs("gridz.social_link", "1x1", { widget_type: "gridz.social_link" }),
      needs("gridz.message_me", "1x1", { widget_type: "gridz.message_me" }),
    ],
  },
  "agents-mcp": {
    schema_version: "gridz/1.0.0",
    subject: { type: "agent", did: null },
    theme: DEFAULT_THEME,
    cells: [
      needs("agent-context", "2x2"),
      needs("agent-endpoint[mcp]"),
      needs("agent-endpoint[a2a]"),
      needs("agent.capabilities", "2x1"),
    ],
  },
  "agents-erc8004": {
    schema_version: "gridz/1.0.0",
    subject: { type: "agent", did: null },
    theme: DEFAULT_THEME,
    cells: [
      needs("agent-context", "2x2"),
      needs("agent-endpoint[mcp]"),
      needs("agent-registration[]"),
      needs("agent.model"),
      needs("agent.version"),
      needs("agent.operator"),
    ],
  },
  "org-multisig": {
    schema_version: "gridz/1.0.0",
    subject: { type: "organization", did: null },
    theme: DEFAULT_THEME,
    cells: [needs("description", "2x1"), needs("url"), needs("primary-contact")],
    signers: [],
  },
};

export const TEMPLATE_NAMES = Object.keys(TEMPLATES);
