import { describe, it, expect } from "vitest";
import { describeTempo, joinTempo, parseTempo, splitTempo, TEMPO_VALUES } from "./tempo";

describe("parseTempo", () => {
  it("treats blank as no tempo", () => {
    for (const v of [null, undefined, "", "  ", "--", "- -"]) {
      expect(parseTempo(v)).toEqual({ ok: true, tempo: null });
    }
  });

  it("normalizes valid tempos", () => {
    expect(parseTempo("3-1-1")).toEqual({ ok: true, tempo: "3-1-1" });
    expect(parseTempo(" 4 / 0 / x ")).toEqual({ ok: true, tempo: "4-0-X" });
    expect(parseTempo("10 0 03")).toEqual({ ok: true, tempo: "10-0-3" });
  });

  it("rejects partial tempos", () => {
    expect(parseTempo("3--1").ok).toBe(false);
    expect(parseTempo("3-1").ok).toBe(false);
    expect(parseTempo("3-1-1-0").ok).toBe(false);
  });

  it("rejects out-of-range values", () => {
    expect(parseTempo("11-1-1").ok).toBe(false);
    expect(parseTempo("3-1-Y").ok).toBe(false);
    expect(parseTempo("1.5-1-1").ok).toBe(false);
    expect(parseTempo(311).ok).toBe(false);
  });
});

describe("joinTempo / splitTempo", () => {
  it("round-trips and handles blanks", () => {
    expect(joinTempo(["3", "1", "X"])).toBe("3-1-X");
    expect(joinTempo(["", "", ""])).toBe("");
    expect(splitTempo("3-1-X")).toEqual(["3", "1", "X"]);
    expect(splitTempo(null)).toEqual(["", "", ""]);
    expect(splitTempo("garbage")).toEqual(["", "", ""]);
  });

  it("joins a partial pick so validation can reject it", () => {
    expect(parseTempo(joinTempo(["3", "", "1"])).ok).toBe(false);
  });
});

describe("describeTempo", () => {
  it("spells tempo out for the athlete", () => {
    expect(describeTempo("3-1-1")).toBe("3s lower · 1s pause · 1s lift");
    expect(describeTempo("4-0-X")).toBe("4s lower · no pause · explosive lift");
    expect(describeTempo(null)).toBeNull();
  });
});

it("offers 0–10 then X", () => {
  expect(TEMPO_VALUES[0]).toBe("0");
  expect(TEMPO_VALUES.at(-2)).toBe("10");
  expect(TEMPO_VALUES.at(-1)).toBe("X");
});
