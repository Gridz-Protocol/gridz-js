<script lang="ts">
  import { onMount } from "svelte";
  import { verifyGrid, type Cell, type Grid, type VerifyContext } from "@gridz/core";
  import { TONES, headerName, themeVars, valueText, type BadgeStatus } from "./helpers.js";

  export let grid: Grid;
  export let verifyContext: VerifyContext | undefined = undefined;
  export let onBadgeClick: ((cell: Cell) => void) | undefined = undefined;

  let statuses: Record<string, BadgeStatus> = {};

  onMount(async () => {
    const result = await verifyGrid(grid, verifyContext);
    const next: Record<string, BadgeStatus> = {};
    for (const c of result.cells) next[c.id] = c.result.status;
    statuses = next;
  });

  $: styleStr = Object.entries(themeVars(grid.theme))
    .map(([k, v]) => `${k}:${v}`)
    .join(";");
  $: visible = grid.cells.filter((c) => c.is_visible);
</script>

<div class="gridz-root" data-testid="root" style={styleStr}>
  <header class="gridz-header">
    <span class="gridz-header__name" data-testid="name">{headerName(grid)}</span>
    <span class="gridz-header__subject">{grid.subject.type}</span>
  </header>
  <main class="gridz-grid" data-testid="grid">
    {#each visible as c (c.id)}
      {@const status = statuses[c.id] ?? "loading"}
      <div class="gridz-cell" data-testid="cell" data-key={c.key}>
        <div class="gridz-cell__head">
          <span class="gridz-cell__key">{c.key}</span>
          <button
            class="gridz-badge {TONES[status].tone}"
            data-testid="badge"
            data-status={status}
            data-tone={TONES[status].tone}
            aria-label={status}
            on:click={() => onBadgeClick?.(c)}
          >
            {TONES[status].icon}{status === "verified" && c.attestation.format === "eip712-oneclaw" ? "🔑" : ""}
          </button>
        </div>
        <div class="gridz-cell__body">{valueText(c.value)}</div>
      </div>
    {/each}
  </main>
</div>
