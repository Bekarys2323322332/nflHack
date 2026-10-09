/** Small number formatting helpers shared by charts and the heatmap. */

/** 3.456 -> "3.5" */
export const fmt1 = (value: number): string => value.toFixed(1);

/** 0.642 -> "64%" */
export const pct = (fraction: number): string => `${Math.round(fraction * 100)}%`;

/** 1234 -> "1,234" */
export const int = (value: number): string => Math.round(value).toLocaleString("en-US");

/** Median of a list of numbers. Returns NaN for an empty list. */
export function median(values: number[]): number {
  if (values.length === 0) return Number.NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
