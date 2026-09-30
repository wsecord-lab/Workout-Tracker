/**
 * Lightweight cues for active workout mode (rest timer done).
 * Fail soft — missing APIs / autoplay blocks must never break the workout UI.
 */

/** Pattern: buzz–pause–buzz. No-op when Vibration API is unavailable. */
export function vibrateRestDone(
  vibrate: (pattern: number | number[]) => boolean = (pattern) => {
    if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") {
      return false;
    }
    return navigator.vibrate(pattern);
  }
): boolean {
  try {
    return vibrate([180, 70, 180]);
  } catch {
    return false;
  }
}

type OscillatorLike = {
  type: string;
  frequency: { setValueAtTime: (v: number, t: number) => void };
  connect: (n: unknown) => void;
  start: (t?: number) => void;
  stop: (t?: number) => void;
};

type GainLike = {
  gain: {
    setValueAtTime: (v: number, t: number) => void;
    exponentialRampToValueAtTime: (v: number, t: number) => void;
  };
  connect: (n: unknown) => void;
};

/** Minimal AudioContext surface we need — injectable for tests. */
export type BeepAudioContext = {
  currentTime: number;
  destination: unknown;
  state: string;
  resume?: () => Promise<void>;
  createOscillator: () => OscillatorLike;
  createGain: () => GainLike;
  close?: () => Promise<void>;
};

/**
 * Short two-tone chirp via Web Audio. Returns false if audio cannot start
 * (no API, autoplay policy, or construction error).
 */
export async function playRestDoneTone(
  createContext: () => BeepAudioContext | null = () => {
    if (typeof window === "undefined") return null;
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    return new Ctor() as unknown as BeepAudioContext;
  }
): Promise<boolean> {
  let ctx: BeepAudioContext | null = null;
  try {
    ctx = createContext();
    if (!ctx) return false;
    if (ctx.state === "suspended" && ctx.resume) {
      await ctx.resume();
    }
    const now = ctx.currentTime;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.12, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);
    gain.connect(ctx.destination);

    const tone = (freq: number, start: number, stop: number) => {
      const osc = ctx!.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, start);
      osc.connect(gain);
      osc.start(start);
      osc.stop(stop);
    };
    tone(880, now, now + 0.12);
    tone(1175, now + 0.14, now + 0.28);

    // Close shortly after so we don't leak contexts on every rest.
    globalThis.setTimeout(() => {
      void ctx?.close?.();
    }, 400);
    return true;
  } catch {
    try {
      void ctx?.close?.();
    } catch {
      /* ignore */
    }
    return false;
  }
}

/** Vibrate + tone. Either may no-op; both are best-effort. */
export async function notifyRestDone(): Promise<void> {
  vibrateRestDone();
  await playRestDoneTone();
}
