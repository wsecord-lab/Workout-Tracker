import { describe, it, expect } from "vitest";
import { normalizeSessionName } from "./session-name";

describe("normalizeSessionName", () => {
  it("lowercases, trims, and collapses whitespace so casing/spacing don't split a workout", () => {
    expect(normalizeSessionName("Upper Body")).toBe("upper body");
    expect(normalizeSessionName("  upper   BODY ")).toBe("upper body");
    expect(normalizeSessionName("Upper Body")).toBe(normalizeSessionName("upper body"));
  });

  it("returns null for missing or blank names", () => {
    // Unnamed sessions must not all match each other.
    expect(normalizeSessionName(null)).toBeNull();
    expect(normalizeSessionName(undefined)).toBeNull();
    expect(normalizeSessionName("")).toBeNull();
    expect(normalizeSessionName("   ")).toBeNull();
  });

  it("keeps distinct names distinct", () => {
    expect(normalizeSessionName("Upper Body")).not.toBe(normalizeSessionName("Lower Body"));
  });
});
