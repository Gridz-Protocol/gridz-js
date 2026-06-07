import { verifyGrid, type Grid, type VerifyContext } from "@gridz/core";
import { renderGrid, type BadgeStatus } from "./render.js";

// Guarded base so the module (and its pure renderGrid export) can be imported in
// Node/SSR where HTMLElement is undefined. The element is only ever instantiated
// in a browser, where this resolves to the real HTMLElement.
/* v8 ignore next 2 -- the Node fallback can't be exercised under jsdom */
const ElementBase: typeof HTMLElement =
  typeof HTMLElement !== "undefined" ? HTMLElement : (class {} as unknown as typeof HTMLElement);

/**
 * <gridz-profile> — a framework-agnostic custom element. Set the `.grid`
 * property to a Grid object; it renders the Spritz aesthetic in a shadow root and
 * runs client-side verification, updating badges when it settles.
 *
 *   const el = document.createElement("gridz-profile");
 *   el.grid = myGrid;
 *   document.body.append(el);
 */
export class GridzProfileElement extends ElementBase {
  private _grid?: Grid;
  private _ctx?: VerifyContext;

  set grid(g: Grid | undefined) {
    this._grid = g;
    void this.render();
  }
  get grid(): Grid | undefined {
    return this._grid;
  }

  set verifyContext(ctx: VerifyContext | undefined) {
    this._ctx = ctx;
  }

  connectedCallback(): void {
    void this.render();
  }

  private async render(): Promise<void> {
    const grid = this._grid;
    if (!grid) return;
    const root = this.shadowRoot ?? this.attachShadow({ mode: "open" });
    root.innerHTML = renderGrid(grid, {});

    const result = await verifyGrid(grid, this._ctx);
    if (this._grid !== grid) return; // a newer grid was set while verifying
    const statuses: Record<string, BadgeStatus> = {};
    for (const c of result.cells) statuses[c.id] = c.result.status;

    root.innerHTML = renderGrid(grid, statuses);
    root.querySelectorAll<HTMLButtonElement>("[data-testid='badge']").forEach((btn, i) => {
      const cell = grid.cells.filter((c) => c.is_visible)[i];
      btn.addEventListener("click", () => {
        this.dispatchEvent(new CustomEvent("gridz:badge", { detail: { cell }, bubbles: true, composed: true }));
      });
    });
  }
}

if (typeof customElements !== "undefined" && !customElements.get("gridz-profile")) {
  customElements.define("gridz-profile", GridzProfileElement);
}

export { renderGrid, themeStyle } from "./render.js";
