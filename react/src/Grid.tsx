import type { Cell, Grid as GridType, VerifyContext } from "@gridz/core";
import { themeToCssVars } from "./theme.js";
import { useVerification } from "./useVerification.js";
import { GridCell } from "./GridCell.js";

export interface GridProps {
  grid: GridType;
  /** Verification context (e.g. a fixed `now` for tests). */
  verifyContext?: VerifyContext;
  /** Called when a verification badge is clicked (opens an attestation drawer in apps). */
  onBadgeClick?: (cell: Cell) => void;
  className?: string;
}

function headerName(grid: GridType): string {
  const alias = grid.cells.find((c) => c.key === "alias" && typeof c.value === "string");
  if (alias) return alias.value as string;
  if (grid.subject.display_name) return grid.subject.display_name;
  const did = grid.subject.ens ?? grid.subject.did;
  return did.length > 24 ? `${did.slice(0, 16)}…${did.slice(-6)}` : did;
}

/**
 * The reference Gridz renderer. Applies the theme as CSS variables, runs
 * client-side verification, and renders each visible cell with a verification
 * badge. Pixel-level aesthetic parity is validated by the Playwright suite
 * (see test/README.md) against the operator's own real Grid.
 */
export function Grid({ grid, verifyContext, onBadgeClick, className }: GridProps): JSX.Element {
  const verification = useVerification(grid, verifyContext);
  const visible = grid.cells.filter((c) => c.is_visible);

  return (
    <div
      className={`gridz-root${className ? ` ${className}` : ""}`}
      data-testid="gridz-root"
      data-root-status={verification.root}
      style={themeToCssVars(grid.theme)}
    >
      <header className="gridz-header">
        <h1 className="gridz-header__name">{headerName(grid)}</h1>
        <span className="gridz-header__subject" data-testid="gridz-subject-type">
          {grid.subject.type}
        </span>
        {grid.theme.show_gridz_badge === false ? null : (
          <span className="gridz-attribution" data-testid="gridz-attribution">
            Gridz
          </span>
        )}
      </header>
      <main className="gridz-grid" data-testid="gridz-grid">
        {visible.map((cell) => (
          <GridCell
            key={cell.id}
            cell={cell}
            status={verification.cells[cell.id] ?? "loading"}
            onBadgeClick={onBadgeClick}
          />
        ))}
      </main>
    </div>
  );
}
