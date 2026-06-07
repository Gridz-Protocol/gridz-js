import type { Grid, Theme, VerifyStatus } from "@gridz/core";
export type BadgeStatus = VerifyStatus | "loading";
export declare const TONES: Record<BadgeStatus, {
    icon: string;
    tone: string;
}>;
export declare function radius(style: Theme["card_style"]): string;
export declare function themeVars(theme: Theme): Record<string, string>;
export declare function valueText(value: unknown): string;
export declare function headerName(grid: Grid): string;
