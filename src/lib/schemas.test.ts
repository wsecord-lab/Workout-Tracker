import { describe, it, expect } from "vitest";
import { setCreateSchema } from "./schemas";

describe("setCreateSchema", () => {
  it("parses valid set input", () => {
    const result = setCreateSchema.safeParse({
      weightLb: 135,
      reps: 5,
      rpe: 8.5,
      notes: "Felt good",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.weightLb).toBe(135);
      expect(result.data.reps).toBe(5);
      expect(result.data.rpe).toBe(8.5);
      expect(result.data.notes).toBe("Felt good");
    }
  });

  it("accepts string numbers", () => {
    const result = setCreateSchema.safeParse({
      weightLb: "100",
      reps: "10",
      rpe: undefined,
      notes: null,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.weightLb).toBe(100);
      expect(result.data.reps).toBe(10);
    }
  });

  it("rejects negative weight", () => {
    const result = setCreateSchema.safeParse({
      weightLb: -1,
      reps: 5,
    });
    expect(result.success).toBe(false);
  });

  it("rejects notes over 2000 chars", () => {
    const result = setCreateSchema.safeParse({
      weightLb: 100,
      reps: 5,
      notes: "x".repeat(2001),
    });
    expect(result.success).toBe(false);
  });
});
