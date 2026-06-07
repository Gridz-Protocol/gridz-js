import { defineComponent, h, onMounted, ref, type PropType } from "vue";
import { verifyGrid, type Cell, type Grid, type VerifyContext } from "@gridz/core";
import { TONES, headerName, themeVars, valueText, type BadgeStatus } from "./helpers.js";

/**
 * Gridz Vue renderer. Render-function component (no SFC compiler needed). Applies
 * the theme as CSS variables, runs client-side verification on mount, and renders
 * each visible cell with a verification badge.
 */
export const GridzGrid = defineComponent({
  name: "GridzGrid",
  props: {
    grid: { type: Object as PropType<Grid>, required: true },
    verifyContext: { type: Object as PropType<VerifyContext>, default: undefined },
    onBadgeClick: { type: Function as PropType<(cell: Cell) => void>, default: undefined },
  },
  setup(props) {
    const statuses = ref<Record<string, BadgeStatus>>({});
    onMounted(async () => {
      const result = await verifyGrid(props.grid, props.verifyContext);
      const next: Record<string, BadgeStatus> = {};
      for (const c of result.cells) next[c.id] = c.result.status;
      statuses.value = next;
    });

    const cell = (c: Cell) => {
      const status = statuses.value[c.id] ?? "loading";
      const t = TONES[status];
      const hsm = status === "verified" && c.attestation.format === "eip712-oneclaw";
      return h("div", { class: "gridz-cell", "data-testid": "cell", "data-key": c.key }, [
        h("div", { class: "gridz-cell__head" }, [
          h("span", { class: "gridz-cell__key" }, c.key),
          h(
            "button",
            {
              class: `gridz-badge ${t.tone}`,
              "data-testid": "badge",
              "data-status": status,
              "data-tone": t.tone,
              "aria-label": status,
              onClick: () => props.onBadgeClick?.(c),
            },
            `${t.icon}${hsm ? "🔑" : ""}`,
          ),
        ]),
        h("div", { class: "gridz-cell__body" }, valueText(c.value)),
      ]);
    };

    return () =>
      h("div", { class: "gridz-root", "data-testid": "root", style: themeVars(props.grid.theme) }, [
        h("header", { class: "gridz-header" }, [
          h("span", { class: "gridz-header__name", "data-testid": "name" }, headerName(props.grid)),
          h("span", { class: "gridz-header__subject" }, props.grid.subject.type),
        ]),
        h(
          "main",
          { class: "gridz-grid", "data-testid": "grid" },
          props.grid.cells.filter((c) => c.is_visible).map(cell),
        ),
      ]);
  },
});
