import { Ed25519Signer, buildGrid, hashUtf8, type Grid, type Hex, type Theme } from "@gridz/core";

/**
 * A deterministic, cryptographically-real probe Grid for round-tripping a sink.
 * Not user data — a seed-derived agent under the gridz.__probe__ key, used solely
 * to confirm a sink stores and returns cells with full fidelity.
 */
const PROBE_THEME: Theme = {
  background_type: "solid",
  background_value: "#000000",
  accent_color: "#7c5cff",
  text_color: "#ffffff",
  card_style: "rounded",
  card_background: "#111111",
  font_family: "mono",
};

const PROBE_NOW = new Date("2026-01-01T00:00:00.000Z");

function hexToBytes(h: Hex): Uint8Array {
  return Uint8Array.from((h.slice(2).match(/.{2}/g) ?? []).map((b) => parseInt(b, 16)));
}

export async function makeProbeGrid(now: Date = PROBE_NOW): Promise<Grid> {
  const signer = new Ed25519Signer(hexToBytes(hashUtf8("sha256", "gridz/__probe__/sink/1")));
  return buildGrid(signer, {
    subject: { type: "agent", did: await signer.did() },
    theme: PROBE_THEME,
    now,
    cells: [
      {
        id: "probe-1",
        key: "gridz.__probe__",
        value: { n: 1, note: "sink round-trip probe" },
        position: { x: 0, y: 0, w: 1, h: 1 },
        size: "1x1",
      },
      {
        id: "probe-2",
        key: "alias",
        value: "gridz-probe",
        position: { x: 1, y: 0, w: 1, h: 1 },
        size: "1x1",
      },
    ],
  });
}
