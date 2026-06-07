import type { Grid, Theme, VerifyStatus } from "@gridz/core";

export type BadgeStatus = VerifyStatus | "loading";

export const TONES: Record<BadgeStatus, { icon: string; tone: string }> = {
  verified: { icon: "✓", tone: "green" },
  expired: { icon: "⚠", tone: "amber" },
  failed: { icon: "✗", tone: "red" },
  unsupported: { icon: "?", tone: "amber" },
  loading: { icon: "…", tone: "muted" },
};

export function radius(style: Theme["card_style"]): string {
  return style === "sharp" ? "0px" : style === "soft" ? "24px" : "14px";
}

export function themeVars(theme: Theme): Record<string, string> {
  return {
    "--gridz-bg": theme.background_value,
    "--gridz-accent": theme.accent_color,
    "--gridz-text": theme.text_color,
    "--gridz-card-bg": theme.card_background,
    "--gridz-card-radius": radius(theme.card_style),
  };
}

export function valueText(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value);
}

export function headerName(grid: Grid): string {
  const alias = grid.cells.find((c) => c.key === "alias" && typeof c.value === "string");
  if (alias) return alias.value as string;
  if (grid.subject.display_name) return grid.subject.display_name;
  const did = grid.subject.ens ?? grid.subject.did;
  return did.length > 24 ? `${did.slice(0, 16)}…${did.slice(-6)}` : did;
}
