import { describe, it, expect } from "vitest";
import {
  generatePasswordResetToken,
  hashPasswordResetToken,
} from "./password-reset-token";

describe("password-reset-token", () => {
  it("generates opaque hex tokens", () => {
    const a = generatePasswordResetToken();
    const b = generatePasswordResetToken();
    expect(a).toHaveLength(64);
    expect(b).toHaveLength(64);
    expect(a).not.toBe(b);
  });

  it("hashes deterministically", () => {
    const token = "abc123";
    expect(hashPasswordResetToken(token)).toBe(hashPasswordResetToken(token));
    expect(hashPasswordResetToken(token)).not.toBe(token);
  });
});
