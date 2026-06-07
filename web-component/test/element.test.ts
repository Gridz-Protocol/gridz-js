import { describe, it, expect, beforeAll } from "vitest";
import { LocalEip712Signer, buildGrid, type Grid } from "@gridz/core";
import { GridzProfileElement, renderGrid } from "../src/index.js";

const CHAIN_ID = 11155111;
const RESOLVER = "0x000000000000000000000000000000000000c0de" as const;
const NOW = new Date("2026-01-01T00:00:00.000Z");
const POS = { x: 0, y: 0, w: 1, h: 1 };
const signer = LocalEip712Signer.fromPrivateKey(`0x${"44".repeat(32)}`, CHAIN_ID);

let GRID: Grid;

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
    ],
  });
});

function waitFor(fn: () => boolean, timeout = 1000): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = () => {
      if (fn()) return resolve();
      if (Date.now() - start > timeout) return reject(new Error("timeout"));
      setTimeout(tick, 10);
    };
    tick();
  });
}

describe("<gridz-profile>", () => {
  it("is registered as a custom element", () => {
    expect(customElements.get("gridz-profile")).toBe(GridzProfileElement);
  });

  it("renders cells and resolves verification badges", async () => {
    const el = document.createElement("gridz-profile") as GridzProfileElement;
    el.verifyContext = { now: NOW };
    el.grid = GRID;
    document.body.append(el);

    await waitFor(() => (el.shadowRoot?.querySelectorAll("[data-status='verified']").length ?? 0) === 2);
    const root = el.shadowRoot!;
    expect(root.querySelector("[data-testid='name']")?.textContent).toBe("gridz-example");
    expect(root.querySelectorAll("[data-testid='cell']")).toHaveLength(2);
    el.remove();
  });

  it("emits gridz:badge on badge click", async () => {
    const el = document.createElement("gridz-profile") as GridzProfileElement;
    el.verifyContext = { now: NOW };
    el.grid = GRID;
    document.body.append(el);
    // Wait for the post-verification render (when click listeners are attached).
    await waitFor(() => (el.shadowRoot?.querySelectorAll("[data-status='verified']").length ?? 0) === 2);

    let clicked: unknown = null;
    el.addEventListener("gridz:badge", (e) => {
      clicked = (e as CustomEvent).detail.cell;
    });
    el.shadowRoot!.querySelector<HTMLButtonElement>("[data-testid='badge']")!.click();
    expect(clicked).toBeTruthy();
    el.remove();
  });

  it("renders a failed badge for a tampered grid (pure renderGrid)", () => {
    const html = renderGrid(GRID, { c1: "failed", c2: "verified" });
    expect(html).toContain('data-status="failed"');
    expect(html).toContain('data-tone="red"');
  });

  it("falls back to a shortened DID when no alias", () => {
    const noAlias = structuredClone(GRID);
    noAlias.cells = noAlias.cells.filter((c) => c.key !== "alias");
    expect(renderGrid(noAlias, {})).toContain("…");
  });
});
