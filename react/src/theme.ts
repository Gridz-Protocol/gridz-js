import type { CSSProperties } from "react";
import type { Theme } from "@gridz/core";

const FONT_STACKS: Record<string, string> = {
  sans: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  serif: "ui-serif, Georgia, 'Times New Roman', serif",
  mono: "ui-monospace, 'JetBrains Mono', 'SF Mono', Menlo, monospace",
};

function fontFamily(f: string): string {
  return FONT_STACKS[f] ?? `'${f}', ${FONT_STACKS.sans}`;
}

function radius(style: Theme["card_style"]): string {
  return style === "sharp" ? "0px" : style === "soft" ? "24px" : "14px";
}

/** Relative luminance per WCAG. */
function luminance(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return 0.5; // non-hex (gradient/rgb) → assume mid; contrast guard is best-effort
  const n = parseInt(m[1]!, 16);
  const chan = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * chan[0]! + 0.7152 * chan[1]! + 0.0722 * chan[2]!;
}

export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Enforce WCAG 4.5:1: fall back to black/white text if the configured pair fails. */
export function ensureReadableText(text: string, background: string): string {
  if (contrastRatio(text, background) >= 4.5) return text;
  return contrastRatio("#ffffff", background) >= contrastRatio("#000000", background)
    ? "#ffffff"
    : "#000000";
}

/** Map a Theme to CSS custom properties consumed by styles.css. */
export function themeToCssVars(theme: Theme): CSSProperties {
  const text = ensureReadableText(theme.text_color, theme.card_background);
  return {
    "--gridz-bg": theme.background_value,
    "--gridz-accent": theme.accent_color,
    "--gridz-secondary": theme.secondary_color ?? theme.accent_color,
    "--gridz-text": text,
    "--gridz-card-bg": theme.card_background,
    "--gridz-card-border": theme.card_border ?? "transparent",
    "--gridz-card-radius": radius(theme.card_style),
    fontFamily: fontFamily(theme.font_family),
  } as CSSProperties;
}
