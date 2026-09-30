"use client";

import { useEffect, useRef } from "react";

type WakeLockSentinelLike = {
  released: boolean;
  release: () => Promise<void>;
};

type WakeLockNavigator = Navigator & {
  wakeLock?: {
    request: (type: "screen") => Promise<WakeLockSentinelLike>;
  };
};

/**
 * Keep the screen awake while `enabled` (active workout). Re-acquires after
 * the tab becomes visible again — browsers release the lock when backgrounded.
 * No-op when the Wake Lock API is missing or the request is denied.
 */
export function useWakeLock(enabled: boolean): void {
  const lockRef = useRef<WakeLockSentinelLike | null>(null);

  useEffect(() => {
    if (!enabled || typeof navigator === "undefined") return;
    const nav = navigator as WakeLockNavigator;
    if (!nav.wakeLock?.request) return;

    let cancelled = false;

    async function acquire() {
      if (cancelled) return;
      try {
        // Release any stale lock before re-requesting.
        if (lockRef.current && !lockRef.current.released) {
          await lockRef.current.release().catch(() => undefined);
        }
        lockRef.current = await nav.wakeLock!.request("screen");
      } catch {
        lockRef.current = null;
      }
    }

    void acquire();

    function onVisibility() {
      if (document.visibilityState === "visible") void acquire();
    }
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      const lock = lockRef.current;
      lockRef.current = null;
      if (lock && !lock.released) {
        void lock.release().catch(() => undefined);
      }
    };
  }, [enabled]);
}
