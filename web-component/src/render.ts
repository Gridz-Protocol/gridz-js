import type { Grid, Theme, VerifyStatus } from "@gridz/core";

export type BadgeStatus = VerifyStatus | "loading";

const TONES: Record<BadgeStatus, { icon: string; tone: string }> = {
  verified: { icon: "✓", tone: "green" },
  expired: { icon: "⚠", tone: "amber" },
  failed: { icon: "✗", tone: "red" },
  unsupported: { icon: "?", tone: "amber" },
  loading: { icon: "…", tone: "muted" },
};

function radius(style: Theme["card_style"]): string {
  return style === "sharp" ? "0px" : style === "soft" ? "24px" : "14px";
}

export function themeStyle(theme: Theme): string {
  return [
    `--gridz-bg:${theme.background_value}`,
    `--gridz-accent:${theme.accent_color}`,
    `--gridz-text:${theme.text_color}`,
    `--gridz-card-bg:${theme.card_background}`,
    `--gridz-card-radius:${radius(theme.card_style)}`,
  ].join(";");
}

function esc(s: unknown): string {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

function valueText(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value);
}

const CSS = `
:host{display:block}
.root{background:var(--gridz-bg);color:var(--gridz-text);padding:20px;max-width:640px;margin:0 auto;font-family:system-ui,sans-serif}
.header{display:flex;align-items:center;gap:10px;margin-bottom:16px}
.name{font-size:22px;font-weight:700}
.subject{font-size:11px;text-transform:uppercase;opacity:.6}
.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
.cell{background:var(--gridz-card-bg);border-radius:var(--gridz-card-radius);padding:14px;display:flex;flex-direction:column;gap:8px}
.cell-head{display:flex;justify-content:space-between;align-items:center}
.key{font-size:11px;opacity:.6}
.badge{border:none;border-radius:999px;width:22px;height:22px;font-size:12px;background:transparent;cursor:pointer}
.badge.green{color:#28c76f}.badge.amber{color:#ffab00}.badge.red{color:#ea5455}.badge.muted{color:var(--gridz-text);opacity:.4}
`;

function headerName(grid: Grid): string {
  const alias = grid.cells.find((c) => c.key === "alias" && typeof c.value === "string");
  if (alias) return alias.value as string;
  if (grid.subject.display_name) return grid.subject.display_name;
  const did = grid.subject.ens ?? grid.subject.did;
  return did.length > 24 ? `${did.slice(0, 16)}…${did.slice(-6)}` : did;
}

/** Render a Grid to shadow-DOM HTML, given per-cell verification statuses. */
export function renderGrid(grid: Grid, statuses: Record<string, BadgeStatus>): string {
  const cells = grid.cells
    .filter((c) => c.is_visible)
    .map((c) => {
      const s = statuses[c.id] ?? "loading";
      const t = TONES[s];
      const hsm = s === "verified" && c.attestation.format === "eip712-oneclaw";
      return `<div class="cell" data-testid="cell" data-key="${esc(c.key)}">
        <div class="cell-head"><span class="key">${esc(c.key)}</span>
        <button class="badge ${t.tone}" data-testid="badge" data-status="${s}" data-tone="${t.tone}" aria-label="${s}">${t.icon}${hsm ? "🔑" : ""}</button></div>
        <div class="body">${esc(valueText(c.value))}</div></div>`;
    })
    .join("");
  return `<style>${CSS}</style><div class="root" data-testid="root" style="${themeStyle(grid.theme)}">
    <div class="header"><span class="name" data-testid="name">${esc(headerName(grid))}</span><span class="subject">${esc(grid.subject.type)}</span></div>
    <div class="grid" data-testid="grid">${cells}</div></div>`;
}
