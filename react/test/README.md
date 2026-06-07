# React renderer tests

`render.test.tsx` runs in jsdom and covers the rendering + verification logic:
widget resolution, the verification badge state machine (verified/failed/
expired), theme CSS variables, the WCAG contrast guard, and visibility filtering.

**Pixel-level aesthetic parity** with the Spritz reference page is validated by a
Playwright visual-regression suite (BRIEF §15). That gate is intentionally not in
the offline unit run because:

1. it needs a real browser, and
2. its snapshot fixture must be **the operator's own real Grid** — we do not ship
   invented demo data (BRIEF §2).

To run it, point it at a real ENS name / Grid you control:

```bash
GRIDZ_SNAPSHOT_SUBJECT=<your-ens-or-did> pnpm --filter @gridz/react test:visual
```

The Lighthouse budget (LCP < 2s on 4G) is checked in the same suite.
