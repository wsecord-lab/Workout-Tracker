import { describe, it, expect, vi } from "vitest";
import { vibrateRestDone, playRestDoneTone, type BeepAudioContext } from "./workout-cues";

describe("vibrateRestDone", () => {
  it("calls vibrate with a short pattern", () => {
    const vibrate = vi.fn().mockReturnValue(true);
    expect(vibrateRestDone(vibrate)).toBe(true);
    expect(vibrate).toHaveBeenCalledWith([180, 70, 180]);
  });

  it("returns false when vibrate throws", () => {
    const vibrate = vi.fn(() => {
      throw new Error("denied");
    });
    expect(vibrateRestDone(vibrate)).toBe(false);
  });
});

describe("playRestDoneTone", () => {
  it("schedules two tones and returns true", async () => {
    const start = vi.fn();
    const stop = vi.fn();
    const connect = vi.fn();
    const createOscillator = vi.fn(() => ({
      type: "sine",
      frequency: { setValueAtTime: vi.fn() },
      connect,
      start,
      stop,
    }));
    const createGain = vi.fn(() => ({
      gain: {
        setValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
      },
      connect: vi.fn(),
    }));
    const close = vi.fn().mockResolvedValue(undefined);
    const ctx: BeepAudioContext = {
      currentTime: 0,
      destination: {},
      state: "running",
      createOscillator,
      createGain,
      close,
    };

    await expect(playRestDoneTone(() => ctx)).resolves.toBe(true);
    expect(createOscillator).toHaveBeenCalledTimes(2);
    expect(start).toHaveBeenCalledTimes(2);
    expect(stop).toHaveBeenCalledTimes(2);
  });

  it("returns false when audio context cannot be created", async () => {
    await expect(playRestDoneTone(() => null)).resolves.toBe(false);
  });
});
