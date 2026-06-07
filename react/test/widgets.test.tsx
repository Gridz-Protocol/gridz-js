import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import type { Cell } from "@gridz/core";
import {
  StatsWidget,
  ClockWidget,
  VerificationBadge,
  GridCell,
  ensureReadableText,
} from "../src/index.js";

afterEach(cleanup);

const cell = (over: Partial<Cell>): Cell => ({
  id: "x",
  key: "k",
  value: null,
  position: { x: 0, y: 0, w: 1, h: 1 },
  size: "1x1",
  is_visible: true,
  attestation: {
    format: "eip712-raw",
    uid: "0x0",
    uri: "data://inline/x",
    attester: "did:web:example",
    iat: "2026-01-01T00:00:00.000Z",
    value_hash: `0x${"00".repeat(32)}`,
  },
  ...over,
});

describe("widgets", () => {
  it("StatsWidget renders array and object shapes", () => {
    const { rerender } = render(<StatsWidget cell={cell({ value: [{ label: "Followers", value: 10 }] })} />);
    expect(screen.getByTestId("widget-stats")).toHaveTextContent("Followers");
    rerender(<StatsWidget cell={cell({ value: { Stars: 3 } })} />);
    expect(screen.getByTestId("widget-stats")).toHaveTextContent("Stars");
  });

  it("ClockWidget shows the timezone", () => {
    render(<ClockWidget cell={cell({ value: "America/New_York" })} />);
    expect(screen.getByTestId("widget-clock")).toHaveAttribute("data-tz", "America/New_York");
  });
});

describe("VerificationBadge", () => {
  it("renders an HSM glyph for eip712-oneclaw and fires onClick", () => {
    const onClick = vi.fn();
    render(<VerificationBadge status="verified" format="eip712-oneclaw" onClick={onClick} />);
    const badge = screen.getByTestId("gridz-badge");
    expect(badge).toHaveTextContent("🔑");
    expect(badge).toHaveAttribute("aria-label", expect.stringContaining("HSM"));
    fireEvent.click(badge);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("renders each status tone", () => {
    for (const [status, tone] of [
      ["expired", "amber"],
      ["failed", "red"],
      ["unsupported", "amber"],
      ["loading", "muted"],
    ] as const) {
      cleanup();
      render(<VerificationBadge status={status} />);
      expect(screen.getByTestId("gridz-badge")).toHaveAttribute("data-tone", tone);
    }
  });
});

describe("GridCell badge click", () => {
  it("invokes onBadgeClick with the cell", () => {
    const onBadgeClick = vi.fn();
    render(<GridCell cell={cell({ key: "alias", value: "x" })} status="verified" onBadgeClick={onBadgeClick} />);
    fireEvent.click(screen.getByTestId("gridz-badge"));
    expect(onBadgeClick).toHaveBeenCalledWith(expect.objectContaining({ key: "alias" }));
  });
});

describe("theme contrast on non-hex backgrounds", () => {
  it("returns a usable text color for gradient backgrounds", () => {
    const result = ensureReadableText("#ffffff", "linear-gradient(#000,#111)");
    expect(typeof result).toBe("string");
  });
});
