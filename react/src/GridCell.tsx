import type { Cell } from "@gridz/core";
import { VerificationBadge, type BadgeStatus } from "./VerificationBadge.js";
import { resolveWidget } from "./widgets.js";

export interface GridCellProps {
  cell: Cell;
  status: BadgeStatus;
  onBadgeClick?: (cell: Cell) => void;
}

function span(size: string): { gridColumn: string; gridRow: string } {
  const m = /^(\d+)x(\d+)$/.exec(size);
  const w = m ? Number(m[1]) : 1;
  const h = m ? Number(m[2]) : 1;
  return { gridColumn: `span ${w}`, gridRow: `span ${h}` };
}

export function GridCell({ cell, status, onBadgeClick }: GridCellProps): JSX.Element {
  const Widget = resolveWidget(cell);
  return (
    <div
      className="gridz-cell"
      data-testid="gridz-cell"
      data-key={cell.key}
      style={span(cell.size)}
    >
      <div className="gridz-cell__head">
        <span className="gridz-cell__key">{cell.key}</span>
        <VerificationBadge
          status={status}
          format={cell.attestation.format}
          onClick={onBadgeClick ? () => onBadgeClick(cell) : undefined}
        />
      </div>
      <div className="gridz-cell__body">
        <Widget cell={cell} />
      </div>
    </div>
  );
}
