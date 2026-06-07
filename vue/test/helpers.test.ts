import { describe, it, expect } from "vitest";
import type { Grid, Theme } from "@gridz/core";
import { themeVars, headerName } from "../src/index.js";
import { radius, valueText } from "../src/helpers.js";

const theme = (style: Theme["card_style"]): Theme => ({
  background_type: "solid",
  background_value: "#000",
  accent_color: "#fff",
  text_color: "#fff",
  card_style: style,
  card_background: "#111",
  font_family: "sans",
});

describe("helpers", () => {
  it("maps card_style to a radius", () => {
    expect(radius("sharp")).toBe("0px");
    expect(radius("soft")).toBe("24px");
    expect(radius("rounded")).toBe("14px");
    expect(themeVars(theme("soft"))["--gridz-card-radius"]).toBe("24px");
  });

  it("stringifies non-string values", () => {
    expect(valueText("hi")).toBe("hi");
    expect(valueText({ a: 1 })).toBe('{"a":1}');
  });

  it("header falls back from alias → display_name → shortened DID", () => {
    const base: Grid = {
      schema_version: "gridz/1.0.0",
      subject: { type: "human", did: "did:pkh:eip155:1:0x1234567890abcdef1234567890abcdef12345678" },
      theme: theme("rounded"),
      cells: [],
      root_attestation: {
        format: "eip712-raw",
        uid: "0x0",
        uri: "data://inline/x",
        attester: "x",
        iat: "2026-01-01T00:00:00.000Z",
        value_hash: `0x${"00".repeat(32)}`,
      },
    };
    expect(headerName(base)).toContain("…");
    expect(headerName({ ...base, subject: { ...base.subject, display_name: "Name" } })).toBe("Name");
  });
});
