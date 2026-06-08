import { useEffect, useState } from "react";
import { verifyGrid, type Grid, type GridVerifyResult, type VerifyContext } from "@gridz/core";
import type { BadgeStatus } from "./VerificationBadge.js";

export interface GridVerification {
  loading: boolean;
  cells: Record<string, BadgeStatus>;
  root: BadgeStatus;
  report: GridVerifyResult | null;
  ok: boolean;
}

/** Verify a Grid client-side and expose per-cell + root status for badges. */
export function useVerification(grid: Grid, ctx?: VerifyContext): GridVerification {
  const [state, setState] = useState<GridVerification>({
    loading: true,
    cells: {},
    root: "loading",
    report: null,
    ok: false,
  });

  useEffect(() => {
    let cancelled = false;
    verifyGrid(grid, ctx).then((r) => {
      if (cancelled) return;
      const cells: Record<string, BadgeStatus> = {};
      for (const c of r.cells) cells[c.id] = c.result.status;
      setState({ loading: false, cells, root: r.root.status, report: r, ok: r.ok });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grid, ctx]);

  return state;
}
