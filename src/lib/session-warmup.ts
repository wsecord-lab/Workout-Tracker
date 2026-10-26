export const WARMUP_ITEM_MAX = 200;
export const WARMUP_ITEMS_MAX = 30;

/**
 * Turn typed or pasted text into warmup lines: one per line, list markers
 * ("-", "•", "1.", "2)") stripped, blanks dropped, each capped in length.
 */
export function parseWarmupLines(input: string): string[] {
  return input
    .split(/\r?\n/)
    .map((line) =>
      line
        .replace(/^\s*(?:[-*•]+|\d+[.)])\s*/, "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, WARMUP_ITEM_MAX)
    )
    .filter((line) => line.length > 0)
    .slice(0, WARMUP_ITEMS_MAX);
}
