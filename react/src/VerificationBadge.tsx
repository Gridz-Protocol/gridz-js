import type { VerifyStatus } from "@gridz/core";

export type BadgeStatus = VerifyStatus | "loading";

export interface BadgeProps {
  status: BadgeStatus;
  /** eip712-oneclaw renders an HSM key glyph on the verified badge. */
  format?: string;
  onClick?: () => void;
}

const META: Record<BadgeStatus, { icon: string; label: string; tone: string }> = {
  verified: { icon: "✓", label: "Verified", tone: "green" },
  expired: { icon: "⚠", label: "Expired", tone: "amber" },
  failed: { icon: "✗", label: "Failed", tone: "red" },
  unsupported: { icon: "?", label: "Unverifiable here", tone: "amber" },
  loading: { icon: "…", label: "Verifying", tone: "muted" },
};

/**
 * Per-cell verification badge. Green = verified (EIP-712 inline or EAS on-chain),
 * with an HSM key glyph for eip712-oneclaw; amber = expired/unverifiable; red = failed.
 */
export function VerificationBadge({ status, format, onClick }: BadgeProps): JSX.Element {
  const meta = META[status];
  const hsm = status === "verified" && format === "eip712-oneclaw";
  return (
    <button
      type="button"
      className={`gridz-badge gridz-badge--${meta.tone}`}
      data-testid="gridz-badge"
      data-status={status}
      data-tone={meta.tone}
      aria-label={`${meta.label}${hsm ? " (HSM-signed)" : ""}`}
      title={`${meta.label}${hsm ? " · HSM-signed" : ""}`}
      onClick={onClick}
    >
      <span aria-hidden>{meta.icon}</span>
      {hsm ? <span aria-hidden>🔑</span> : null}
    </button>
  );
}
