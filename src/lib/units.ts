/**
 * Imperial unit system: store in SI (metric), display in Imperial.
 * Conversions are deterministic (fixed rounding).
 */

export type UnitType = "weight" | "height" | "distance" | "volume";

const KG_TO_LB = 2.20462;
const CM_TO_IN = 0.393701;
const M_TO_FT = 3.28084;
const KM_TO_MI = 0.621371;
const L_TO_FL_OZ = 33.814;

const LB_TO_KG = 1 / KG_TO_LB;
const IN_TO_CM = 1 / CM_TO_IN;
const FT_TO_M = 1 / M_TO_FT;
const MI_TO_KM = 1 / KM_TO_MI;
const FL_OZ_TO_L = 1 / L_TO_FL_OZ;

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Convert stored (SI) value to display (Imperial) value.
 */
export function toDisplay(value: number, type: UnitType): number {
  switch (type) {
    case "weight":
      return round1(value * KG_TO_LB);
    case "height":
      return round1(value * CM_TO_IN);
    case "distance":
      return round2(value * KM_TO_MI);
    case "volume":
      return round1(value * L_TO_FL_OZ);
    default:
      return value;
  }
}

/** Round to 6 decimals for exact lb↔kg round-trip (avoids e.g. 135 lb → 134.9). */
function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

/**
 * Convert display (Imperial) value to storage (SI) value.
 */
export function toStorage(value: number, type: UnitType): number {
  switch (type) {
    case "weight":
      return round6(value * LB_TO_KG);
    case "height":
      return round1(value * IN_TO_CM);
    case "distance":
      return round2(value * MI_TO_KM); // input in mi → km
    case "volume":
      return round1(value * FL_OZ_TO_L);
    default:
      return value;
  }
}

/**
 * Format weight for display: "185 lb"
 */
export function formatWeight(kg: number): string {
  const lb = toDisplay(kg, "weight");
  return `${lb} lb`;
}

/**
 * Format height for display: "5 ft 10 in" (total inches → ft and in)
 */
export function formatHeight(cm: number): string {
  const totalIn = toDisplay(cm, "height");
  const ft = Math.floor(totalIn / 12);
  const inRem = Math.round((totalIn % 12) * 10) / 10;
  if (ft === 0) return `${inRem} in`;
  if (inRem === 0) return `${ft} ft`;
  return `${ft} ft ${inRem} in`;
}

/**
 * Format distance for display: "3.25 mi"
 */
export function formatDistance(km: number): string {
  const mi = toDisplay(km, "distance");
  return `${mi} mi`;
}

/**
 * Format volume for display: "33.8 fl oz"
 */
export function formatVolume(liters: number): string {
  const flOz = toDisplay(liters, "volume");
  return `${flOz} fl oz`;
}

/**
 * Parse display weight string (e.g. "185" or "185 lb") to kg for storage.
 */
export function parseWeightToStorage(displayValue: string | number): number {
  const n = typeof displayValue === "string" ? parseFloat(displayValue.replace(/[^0-9.-]/g, "")) : displayValue;
  if (Number.isNaN(n)) return 0;
  return toStorage(n, "weight");
}

/**
 * Parse display height: total inches (e.g. "70" for 5 ft 10 in) to cm for storage.
 */
export function parseHeightToStorage(totalInches: string | number): number {
  const n = typeof totalInches === "string" ? parseFloat(totalInches.replace(/[^0-9.-]/g, "")) : totalInches;
  if (Number.isNaN(n)) return 0;
  return toStorage(n, "height");
}

/**
 * Height in cm to total inches (for form default).
 */
export function heightCmToInches(cm: number): number {
  return round1(cm * CM_TO_IN);
}

/**
 * Weight in kg to lb (for form default).
 */
export function weightKgToLb(kg: number): number {
  return round1(kg * KG_TO_LB);
}
