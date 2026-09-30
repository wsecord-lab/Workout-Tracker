import { describe, it, expect } from "vitest";
import { getFinishSkippedCopy } from "./workout-finish";

describe("getFinishSkippedCopy", () => {
  it("uses singular wording for one skipped set", () => {
    const copy = getFinishSkippedCopy(1, 4, 5);
    expect(copy.title).toBe("Finish with 1 skipped set?");
    expect(copy.confirmLabel).toBe("Finish with 1 skipped");
    expect(copy.cancelLabel).toBe("Keep working");
    expect(copy.body).toContain("completed 4 of 5 sets");
    expect(copy.body).toContain("does not pause");
    expect(copy.body).toContain("Use Pause");
  });

  it("uses plural wording for multiple skipped sets", () => {
    const copy = getFinishSkippedCopy(3, 2, 5);
    expect(copy.title).toBe("Finish with 3 skipped sets?");
    expect(copy.confirmLabel).toBe("Finish with 3 skipped");
    expect(copy.body).toContain("remaining 3 sets");
  });
});
