import { describe, it, expect, beforeAll, afterEach, vi } from "vitest";
import { render, waitFor, fireEvent, cleanup } from "@testing-library/svelte";
import { LocalEip712Signer, buildGrid, type Grid } from "@gridz/core";
import GridzGrid from "../src/Grid.svelte";

const CHAIN_ID = 11155111;
const RESOLVER = "0x000000000000000000000000000000000000c0de" as const;
const NOW = new Date("2026-01-01T00:00:00.000Z");
const POS = { x: 0, y: 0, w: 1, h: 1 };
const signer = LocalEip712Signer.fromPrivateKey(`0x${"66".repeat(32)}`, CHAIN_ID);

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

afterEach(cleanup);

describe("GridzGrid (Svelte)", () => {
  it("renders header + cells and resolves verification badges", async () => {
    const { getByTestId, getAllByTestId } = render(GridzGrid, { props: { grid: GRID, verifyContext: { now: NOW } } });
    expect(getByTestId("name").textContent).toBe("gridz-example");
    expect(getAllByTestId("cell")).toHaveLength(2);
    await waitFor(() => {
      const verified = getAllByTestId("badge").filter((b) => b.getAttribute("data-status") === "verified");
      expect(verified).toHaveLength(2);
    });
    expect(getByTestId("root").getAttribute("style")).toContain("--gridz-accent");
  });

  it("shows a failed badge when a cell is tampered", async () => {
    const tampered = structuredClone(GRID);
    (tampered.cells[0] as { value: unknown }).value = "tampered";
    const { getAllByTestId } = render(GridzGrid, { props: { grid: tampered, verifyContext: { now: NOW } } });
    await waitFor(() => {
      const failed = getAllByTestId("badge").find((b) => b.getAttribute("data-status") === "failed");
      expect(failed?.getAttribute("data-tone")).toBe("red");
    });
  });

  it("fires onBadgeClick", async () => {
    const onBadgeClick = vi.fn();
    const { getAllByTestId } = render(GridzGrid, { props: { grid: GRID, verifyContext: { now: NOW }, onBadgeClick } });
    await waitFor(() => expect(getAllByTestId("badge")[0]?.getAttribute("data-status")).toBe("verified"));
    await fireEvent.click(getAllByTestId("badge")[0]!);
    expect(onBadgeClick).toHaveBeenCalledOnce();
  });
});
