"use client";

import { useEffect } from "react";

/**
 * Scrolls the focused form control into view when the virtual keyboard may overlap it.
 * Purely UI-layer: no validation or form logic.
 */
export function FocusScroll() {
  useEffect(() => {
    function handleFocusIn(e: FocusEvent) {
      const target = e.target;
      if (
        target instanceof HTMLElement &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT")
      ) {
        requestAnimationFrame(() => {
          target.scrollIntoView({ behavior: "smooth", block: "center" });
        });
      }
    }
    document.addEventListener("focusin", handleFocusIn, { passive: true });
    return () => document.removeEventListener("focusin", handleFocusIn);
  }, []);
  return null;
}
