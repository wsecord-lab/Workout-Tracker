import { describe, it, expect } from "vitest";
import { computeGroupPresentation } from "./group-presentation";

describe("computeGroupPresentation", () => {
  it("returns empty map and no groups when no exercises have groupId", () => {
    const result = computeGroupPresentation([
      { id: "e1", groupId: null, orderIndex: 0 },
      { id: "e2", groupId: null, orderIndex: 1 },
    ]);
    expect(result.byExerciseId.size).toBe(0);
    expect(result.uniqueGroups).toEqual([]);
  });

  it("2 in group => Superset label", () => {
    const result = computeGroupPresentation([
      { id: "e1", groupId: "g1", orderIndex: 0 },
      { id: "e2", groupId: "g1", orderIndex: 1 },
    ]);
    expect(result.byExerciseId.get("e1")?.label).toBe("Superset A");
    expect(result.byExerciseId.get("e2")?.label).toBe("Superset A");
    expect(result.uniqueGroups).toEqual([{ groupId: "g1", label: "Superset A" }]);
  });

  it("3 in group => Tri-set label", () => {
    const result = computeGroupPresentation([
      { id: "e1", groupId: "g1", orderIndex: 0 },
      { id: "e2", groupId: "g1", orderIndex: 1 },
      { id: "e3", groupId: "g1", orderIndex: 2 },
    ]);
    expect(result.byExerciseId.get("e1")?.label).toBe("Tri-set A");
    expect(result.uniqueGroups[0].label).toBe("Tri-set A");
  });

  it("4+ in group => Superset label (default)", () => {
    const result = computeGroupPresentation([
      { id: "e1", groupId: "g1", orderIndex: 0 },
      { id: "e2", groupId: "g1", orderIndex: 1 },
      { id: "e3", groupId: "g1", orderIndex: 2 },
      { id: "e4", groupId: "g1", orderIndex: 3 },
    ]);
    expect(result.byExerciseId.get("e1")?.label).toBe("Superset A");
    expect(result.uniqueGroups[0].label).toBe("Superset A");
  });

  it("assigns letters by stable order (earliest orderIndex first)", () => {
    const result = computeGroupPresentation([
      { id: "e1", groupId: "g2", orderIndex: 2 },
      { id: "e2", groupId: "g1", orderIndex: 0 },
      { id: "e3", groupId: "g2", orderIndex: 3 },
      { id: "e4", groupId: "g1", orderIndex: 1 },
    ]);
    expect(result.byExerciseId.get("e2")?.label).toBe("Superset A");
    expect(result.byExerciseId.get("e4")?.label).toBe("Superset A");
    expect(result.byExerciseId.get("e1")?.label).toBe("Superset B");
    expect(result.byExerciseId.get("e3")?.label).toBe("Superset B");
    expect(result.uniqueGroups.map((g) => g.label)).toEqual(["Superset A", "Superset B"]);
  });

  it("reordering exercises by orderIndex does not change letter mapping (stable)", () => {
    const exercises1 = [
      { id: "e1", groupId: "g1", orderIndex: 0 },
      { id: "e2", groupId: "g2", orderIndex: 1 },
      { id: "e3", groupId: "g1", orderIndex: 2 },
    ];
    const result1 = computeGroupPresentation(exercises1);
    const exercises2 = [
      { id: "e1", groupId: "g1", orderIndex: 2 },
      { id: "e2", groupId: "g2", orderIndex: 0 },
      { id: "e3", groupId: "g1", orderIndex: 1 },
    ];
    const result2 = computeGroupPresentation(exercises2);
    expect(result1.byExerciseId.get("e1")?.letter).toBe("A");
    expect(result1.byExerciseId.get("e2")?.letter).toBe("B");
    expect(result2.byExerciseId.get("e2")?.letter).toBe("A");
    expect(result2.byExerciseId.get("e1")?.letter).toBe("B");
  });
});
