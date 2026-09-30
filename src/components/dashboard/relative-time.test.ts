import { describe, expect, it } from "vitest";
import {
  formatCalendarDay,
  formatRelativeInstant,
  startOfToday,
} from "./relative-time";

describe("formatRelativeInstant", () => {
  const now = new Date(2026, 2, 15, 14, 30, 0); // Mar 15 2026 2:30pm local

  it("returns just now for < 1 minute", () => {
    expect(formatRelativeInstant(new Date(2026, 2, 15, 14, 29, 30), now)).toBe(
      "just now"
    );
  });

  it("returns minutes ago", () => {
    expect(formatRelativeInstant(new Date(2026, 2, 15, 14, 18, 0), now)).toBe(
      "12 min ago"
    );
  });

  it("returns hours ago", () => {
    expect(formatRelativeInstant(new Date(2026, 2, 15, 11, 30, 0), now)).toBe(
      "3h ago"
    );
  });

  it("returns Yesterday across midnight", () => {
    expect(formatRelativeInstant(new Date(2026, 2, 14, 20, 0, 0), now)).toBe(
      "Yesterday"
    );
  });

  it("returns Nd ago within a week", () => {
    expect(formatRelativeInstant(new Date(2026, 2, 12, 10, 0, 0), now)).toBe(
      "3d ago"
    );
  });

  it("returns short date beyond a week", () => {
    expect(formatRelativeInstant(new Date(2026, 2, 1, 10, 0, 0), now)).toBe(
      "Mar 1"
    );
  });
});

describe("formatCalendarDay", () => {
  const now = new Date(2026, 2, 15, 9, 0, 0);

  it("labels today / tomorrow / yesterday", () => {
    expect(formatCalendarDay(new Date(2026, 2, 15, 12, 0, 0), now)).toBe("Today");
    expect(formatCalendarDay(new Date(2026, 2, 16, 12, 0, 0), now)).toBe(
      "Tomorrow"
    );
    expect(formatCalendarDay(new Date(2026, 2, 14, 12, 0, 0), now)).toBe(
      "Yesterday"
    );
  });

  it("labels other days with weekday", () => {
    const label = formatCalendarDay(new Date(2026, 2, 18, 12, 0, 0), now);
    expect(label).toMatch(/Mar 18/);
    expect(label).toMatch(/Wed|Wed,/);
  });
});

describe("startOfToday", () => {
  it("returns local midnight", () => {
    const now = new Date(2026, 2, 15, 14, 30, 0);
    const start = startOfToday(now);
    expect(start.getHours()).toBe(0);
    expect(start.getMinutes()).toBe(0);
    expect(start.getDate()).toBe(15);
  });
});
