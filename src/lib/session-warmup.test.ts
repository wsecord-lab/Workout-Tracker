import { describe, it, expect } from "vitest";
import { parseWarmupLines, WARMUP_ITEM_MAX, WARMUP_ITEMS_MAX } from "./session-warmup";

describe("parseWarmupLines", () => {
  it("splits pasted lists and strips bullets and numbering", () => {
    const text = "- Incline walk 3 min\n• Hip CARs 3/side\n1. 90/90 switches x8\n2) Glute bridge x10";
    expect(parseWarmupLines(text)).toEqual([
      "Incline walk 3 min",
      "Hip CARs 3/side",
      "90/90 switches x8",
      "Glute bridge x10",
    ]);
  });

  it("drops blank lines and collapses whitespace", () => {
    expect(parseWarmupLines("\n  RDL   95 lb × 8  \r\n\n")).toEqual(["RDL 95 lb × 8"]);
  });

  it("keeps a leading number that is part of the item", () => {
    expect(parseWarmupLines("90/90 switches")).toEqual(["90/90 switches"]);
    expect(parseWarmupLines("3 min bike")).toEqual(["3 min bike"]);
  });

  it("caps item length and item count", () => {
    expect(parseWarmupLines("x".repeat(500))[0]).toHaveLength(WARMUP_ITEM_MAX);
    const many = Array.from({ length: 50 }, (_, i) => `item ${i}`).join("\n");
    expect(parseWarmupLines(many)).toHaveLength(WARMUP_ITEMS_MAX);
  });
});
