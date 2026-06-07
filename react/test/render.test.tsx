import { describe, it, expect, beforeAll } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
import { LocalEip712Signer, buildGrid, type Grid as GridType } from "@gridz/core";
import { Grid, contrastRatio, ensureReadableText, resolveWidget } from "../src/index.js";

const CHAIN_ID = 11155111;
const RESOLVER = "0x000000000000000000000000000000000000c0de" as const;
const NOW = new Date("2026-01-01T00:00:00.000Z");
const POS = { x: 0, y: 0, w: 1, h: 1 };
const signer = LocalEip712Signer.fromPrivateKey(`0x${"33".repeat(32)}`, CHAIN_ID);

let GRID: GridType;

beforeAll(async () => {
  GRID = await buildGrid(signer, {
    subject: { type: "human", did: await signer.did() },
    theme: {
      background_type: "solid",
      background_value: "#0b0b0f",
      accent_color: "#7c5cff",
      text_color: "#f4f4f5",
      card_style: "rounded",
      card_background: "#16161c",
      font_family: "sans",
    },
    chainId: CHAIN_ID,
    verifyingContract: RESOLVER,
    now: NOW,
    cells: [
      { id: "c1", key: "alias", value: "gridz-example", position: POS, size: "1x1" },
      { id: "c2", key: "url", value: "https://gridz.dev", position: POS, size: "1x1" },
      { id: "c3", key: "com.github", value: "octocat", position: POS, size: "1x1" },
      { id: "c4", key: "gridz.poll", value: { q: "ship?", options: ["yes", "also yes"] }, widget_type: "gridz.poll", position: POS, size: "2x2" },
      { id: "c5", key: "gridz.fun_counter", value: 5, position: POS, size: "1x1" },
    ],
  });
});

afterEach(cleanup);

describe("<Grid>", () => {
  it("renders the header name from the alias cell and applies theme vars", () => {
    render(<Grid grid={GRID} verifyContext={{ now: NOW }} />);
    expect(screen.getByRole("heading")).toHaveTextContent("gridz-example");
    const root = screen.getByTestId("gridz-root");
    expect(root.style.getPropertyValue("--gridz-accent")).toBe("#7c5cff");
    expect(screen.getByTestId("gridz-attribution")).toBeInTheDocument();
  });

  it("renders one cell per visible cell with the right widgets", () => {
    render(<Grid grid={GRID} verifyContext={{ now: NOW }} />);
    expect(screen.getAllByTestId("gridz-cell")).toHaveLength(5);
    expect(screen.getByTestId("widget-url")).toHaveTextContent("gridz.dev");
    expect(screen.getByTestId("widget-poll")).toHaveTextContent("ship?");
    expect(screen.getByTestId("widget-social")).toHaveTextContent("octocat");
    // unknown widget → generic fallback
    expect(screen.getByTestId("widget-generic")).toBeInTheDocument();
  });

  it("shows a verified badge on every cell after verification settles", async () => {
    render(<Grid grid={GRID} verifyContext={{ now: NOW }} />);
    await waitFor(() => {
      const verified = screen.getAllByTestId("gridz-badge").filter((b) => b.getAttribute("data-status") === "verified");
      expect(verified).toHaveLength(5);
    });
  });

  it("shows a failed (red) badge when a cell value is tampered", async () => {
    const tampered = structuredClone(GRID);
    (tampered.cells[0] as { value: unknown }).value = "tampered";
    render(<Grid grid={tampered} verifyContext={{ now: NOW }} />);
    await waitFor(() => {
      const failed = screen.getAllByTestId("gridz-badge").find((b) => b.getAttribute("data-status") === "failed");
      expect(failed).toBeDefined();
      expect(failed).toHaveAttribute("data-tone", "red");
    });
  });

  it("falls back to display_name then a shortened DID for the header", () => {
    const noAlias = structuredClone(GRID);
    noAlias.cells = noAlias.cells.filter((c) => c.key !== "alias");
    noAlias.subject.display_name = "Display Name";
    render(<Grid grid={noAlias} verifyContext={{ now: NOW }} />);
    expect(screen.getByRole("heading")).toHaveTextContent("Display Name");
    cleanup();

    const noName = structuredClone(noAlias);
    delete noName.subject.display_name;
    render(<Grid grid={noName} verifyContext={{ now: NOW }} />);
    expect(screen.getByRole("heading").textContent).toContain("…");
  });

  it("hides cells with is_visible: false", async () => {
    const withHidden = structuredClone(GRID);
    withHidden.cells[1]!.is_visible = false;
    render(<Grid grid={withHidden} verifyContext={{ now: NOW }} />);
    expect(screen.getAllByTestId("gridz-cell")).toHaveLength(4);
  });
});

describe("theme contrast guard (WCAG 4.5:1)", () => {
  it("keeps a high-contrast pair and rescues a low-contrast one", () => {
    expect(contrastRatio("#ffffff", "#000000")).toBeGreaterThan(4.5);
    expect(ensureReadableText("#f4f4f5", "#16161c")).toBe("#f4f4f5"); // already readable
    expect(ensureReadableText("#161616", "#161616")).toBe("#ffffff"); // unreadable → rescued
  });
});

describe("resolveWidget", () => {
  it("falls back to Generic for unknown gridz.* widgets", () => {
    const cell = { key: "gridz.zodiac", value: "leo" } as never;
    expect(resolveWidget(cell).name).toBe("GenericWidget");
  });
});
