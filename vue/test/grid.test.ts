import { describe, it, expect, beforeAll, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { LocalEip712Signer, buildGrid, type Grid } from "@gridz/core";
import { GridzGrid } from "../src/index.js";

const CHAIN_ID = 11155111;
const RESOLVER = "0x000000000000000000000000000000000000c0de" as const;
const NOW = new Date("2026-01-01T00:00:00.000Z");
const POS = { x: 0, y: 0, w: 1, h: 1 };
const signer = LocalEip712Signer.fromPrivateKey(`0x${"55".repeat(32)}`, CHAIN_ID);

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

describe("GridzGrid (Vue)", () => {
  it("renders header + cells and resolves verification badges", async () => {
    const wrapper = mount(GridzGrid, { props: { grid: GRID, verifyContext: { now: NOW } } });
    expect(wrapper.find("[data-testid='name']").text()).toBe("gridz-example");
    expect(wrapper.findAll("[data-testid='cell']")).toHaveLength(2);

    await flushPromises();
    expect(wrapper.findAll("[data-status='verified']")).toHaveLength(2);
    expect(wrapper.find("[data-testid='root']").attributes("style")).toContain("--gridz-accent");
  });

  it("shows a failed badge when a cell is tampered", async () => {
    const tampered = structuredClone(GRID);
    (tampered.cells[0] as { value: unknown }).value = "tampered";
    const wrapper = mount(GridzGrid, { props: { grid: tampered, verifyContext: { now: NOW } } });
    await flushPromises();
    expect(wrapper.find("[data-status='failed']").attributes("data-tone")).toBe("red");
  });

  it("fires onBadgeClick", async () => {
    const onBadgeClick = vi.fn();
    const wrapper = mount(GridzGrid, { props: { grid: GRID, verifyContext: { now: NOW }, onBadgeClick } });
    await flushPromises();
    await wrapper.find("[data-testid='badge']").trigger("click");
    expect(onBadgeClick).toHaveBeenCalledOnce();
  });
});
