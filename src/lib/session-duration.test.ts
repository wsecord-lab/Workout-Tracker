import { describe, it, expect } from "vitest";
import {
  formatClock,
  formatDuration,
  getElapsedSeconds,
  getSessionDurationSeconds,
  parseDurationMinutes,
} from "./session-duration";

const start = new Date("2026-07-01T10:00:00Z");
const finish = new Date("2026-07-01T10:52:00Z");

describe("getSessionDurationSeconds", () => {
  it("computes finish minus start", () => {
    expect(getSessionDurationSeconds({ startedAt: start, finishedAt: finish, durationSeconds: null })).toBe(3120);
  });

  it("lets a manual override win over the measured span", () => {
    expect(getSessionDurationSeconds({ startedAt: start, finishedAt: finish, durationSeconds: 1800 })).toBe(1800);
  });

  it("uses the override for a legacy session that was never started", () => {
    expect(getSessionDurationSeconds({ startedAt: null, finishedAt: finish, durationSeconds: 2400 })).toBe(2400);
  });

  it("is null when the session was never started", () => {
    expect(getSessionDurationSeconds({ startedAt: null, finishedAt: finish, durationSeconds: null })).toBeNull();
  });

  it("is null while the session is still running", () => {
    expect(getSessionDurationSeconds({ startedAt: start, finishedAt: null, durationSeconds: null })).toBeNull();
  });

  it("is null — not 0 — when finish precedes start", () => {
    // Clock skew or a hand-edited date. "0 min" would read as a real
    // measurement; null reads as unknown, which is the truth.
    expect(getSessionDurationSeconds({ startedAt: finish, finishedAt: start, durationSeconds: null })).toBeNull();
  });

  it("accepts ISO strings as well as Dates", () => {
    expect(
      getSessionDurationSeconds({
        startedAt: start.toISOString(),
        finishedAt: finish.toISOString(),
        durationSeconds: null,
      })
    ).toBe(3120);
  });
});

describe("getElapsedSeconds", () => {
  it("counts forward from the start", () => {
    expect(getElapsedSeconds(start, new Date("2026-07-01T10:12:30Z"))).toBe(750);
  });
  it("floors at 0 for a start in the future", () => {
    expect(getElapsedSeconds(finish, start)).toBe(0);
  });
});

describe("formatDuration", () => {
  it("renders an em dash for unknown", () => {
    expect(formatDuration(null)).toBe("—");
  });
  it("rounds down to whole minutes below an hour", () => {
    expect(formatDuration(59)).toBe("0 min");
    expect(formatDuration(60)).toBe("1 min");
    expect(formatDuration(3599)).toBe("59 min");
  });
  it("switches to h/m at an hour", () => {
    expect(formatDuration(3600)).toBe("1h 00m");
    expect(formatDuration(3600 + 4 * 60)).toBe("1h 04m");
  });
});

describe("formatClock", () => {
  it("shows m:ss under an hour", () => {
    expect(formatClock(0)).toBe("0:00");
    expect(formatClock(65)).toBe("1:05");
  });
  it("shows h:mm:ss at an hour and beyond", () => {
    expect(formatClock(3661)).toBe("1:01:01");
  });
});

describe("parseDurationMinutes", () => {
  it("returns null for empty input, which clears the override", () => {
    expect(parseDurationMinutes("")).toBeNull();
    expect(parseDurationMinutes("   ")).toBeNull();
  });
  it("parses whole minutes", () => {
    expect(parseDurationMinutes("52")).toBe(52);
  });
  it("rejects non-integers and junk", () => {
    expect(parseDurationMinutes("52.5")).toBeUndefined();
    expect(parseDurationMinutes("abc")).toBeUndefined();
    expect(parseDurationMinutes("-5")).toBeUndefined();
  });
  it("rejects out-of-range values, so 0 can never be stored", () => {
    expect(parseDurationMinutes("0")).toBeUndefined();
    expect(parseDurationMinutes("1441")).toBeUndefined();
    expect(parseDurationMinutes("1440")).toBe(1440);
  });
});
