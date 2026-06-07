export const TONES = {
    verified: { icon: "✓", tone: "green" },
    expired: { icon: "⚠", tone: "amber" },
    failed: { icon: "✗", tone: "red" },
    unsupported: { icon: "?", tone: "amber" },
    loading: { icon: "…", tone: "muted" },
};
export function radius(style) {
    return style === "sharp" ? "0px" : style === "soft" ? "24px" : "14px";
}
export function themeVars(theme) {
    return {
        "--gridz-bg": theme.background_value,
        "--gridz-accent": theme.accent_color,
        "--gridz-text": theme.text_color,
        "--gridz-card-bg": theme.card_background,
        "--gridz-card-radius": radius(theme.card_style),
    };
}
export function valueText(value) {
    return typeof value === "string" ? value : JSON.stringify(value);
}
export function headerName(grid) {
    const alias = grid.cells.find((c) => c.key === "alias" && typeof c.value === "string");
    if (alias)
        return alias.value;
    if (grid.subject.display_name)
        return grid.subject.display_name;
    const did = grid.subject.ens ?? grid.subject.did;
    return did.length > 24 ? `${did.slice(0, 16)}…${did.slice(-6)}` : did;
}
