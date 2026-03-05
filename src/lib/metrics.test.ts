import { describe, it, expect } from "vitest";
import { parseRange } from "./metrics";

describe("parseRange", () => {
  it("returns 7 for 7d", () => {
    expect(parseRange("7d")).toBe(7);
    expect(parseRange("7D")).toBe(7);
  });
  it("returns 30 for 30d", () => {
    expect(parseRange("30d")).toBe(30);
  });
  it("returns 90 for 90d", () => {
    expect(parseRange("90d")).toBe(90);
  });
  it("returns null for invalid range", () => {
    expect(parseRange("")).toBeNull();
    expect(parseRange(null)).toBeNull();
    expect(parseRange("14d")).toBeNull();
    expect(parseRange("week")).toBeNull();
  });
});
