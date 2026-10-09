/**
 * Pure helpers for the heatmap: filtering, aggregation, colour scale and wording.
 * Nothing here touches React, so it is easy to reason about and reuse.
 */
import type { HeatmapData, HeatmapGrid, HeatmapTopic, HeatmapYZone } from "../api";
import { HEAT_STEPS } from "../config/theme";
import { int } from "./format";

/** Field geometry in yards (the SVG viewBox is 120 x 53.3). */
export const FIELD_LENGTH = 120;
export const FIELD_WIDTH = 53.3;
/** The line of scrimmage is always drawn at the 30-yard line, i.e. x = 40. */
export const LOS_FIELD_X = 40;

export type DownFilter = "all" | 1 | 2 | 3 | 4;
export type CoverageFilter = "all" | "man" | "zone";

export interface HeatFilters {
  positions: string[];
  down: DownFilter;
  coverage: CoverageFilter;
}

/** One drawn rectangle on the field, after filtering and summing. */
export interface HeatCell {
  /** Unique id, "<x_bin>:<y_bin>". */
  key: string;
  xBin: number;
  yBin: number;
  /** Rectangle in field coordinates (yards). */
  x: number;
  y: number;
  width: number;
  height: number;
  count: number;
  valueSum: number;
  catches: number;
  /** The number that is coloured, based on the topic kind. */
  value: number;
  zone: HeatmapYZone;
}

/**
 * Filters the rows for one topic, sums them per cell, converts each sum to the
 * topic's value, and drops cells with fewer than min_plays.
 */
export function aggregateCells(data: HeatmapData, topic: HeatmapTopic, filters: HeatFilters): HeatCell[] {
  const { grid } = data;
  const positions = new Set(filters.positions);
  const minPlays = topic.min_plays ?? grid.min_plays;

  const sums = new Map<string, { xBin: number; yBin: number; count: number; valueSum: number; catches: number }>();

  for (const row of data.rows) {
    if (row.topic !== topic.id) continue;
    if (!positions.has(row.position)) continue;
    if (filters.down !== "all" && row.down !== filters.down) continue;
    if (filters.coverage !== "all" && row.coverage !== filters.coverage) continue;

    const key = `${row.x_bin}:${row.y_bin}`;
    const entry = sums.get(key) ?? { xBin: row.x_bin, yBin: row.y_bin, count: 0, valueSum: 0, catches: 0 };
    entry.count += row.count;
    entry.valueSum += row.value_sum;
    entry.catches += row.catches;
    sums.set(key, entry);
  }

  const cells: HeatCell[] = [];
  for (const [key, s] of sums) {
    const zone = grid.y_zones[s.yBin];
    if (!zone || s.count < minPlays) continue;

    let value = s.count; // kind "count"
    if (topic.kind === "mean") value = s.valueSum / s.count;
    if (topic.kind === "rate") value = s.catches / s.count;

    cells.push({
      key,
      xBin: s.xBin,
      yBin: s.yBin,
      x: LOS_FIELD_X + s.xBin,
      y: zone.y0,
      width: grid.x_bin_size,
      height: zone.y1 - zone.y0,
      count: s.count,
      valueSum: s.valueSum,
      catches: s.catches,
      value,
      zone,
    });
  }
  return cells;
}

/* -------------------------------------------------------------------------- */
/* Colour scale                                                               */
/* -------------------------------------------------------------------------- */

export interface ColorScale {
  min: number;
  max: number;
  /** Step edges, steps + 1 numbers from min to max. */
  edges: number[];
  colorFor: (value: number) => string;
}

/** Equal-interval scale: the value range is split into 7 steps. */
export function buildScale(values: number[]): ColorScale {
  const steps = HEAT_STEPS.length;
  const min = values.length ? Math.min(...values) : 0;
  const max = values.length ? Math.max(...values) : 1;
  const span = max - min;
  const edges = Array.from({ length: steps + 1 }, (_, i) => min + (span * i) / steps);

  const colorFor = (value: number): string => {
    // With a single value there is no range, so use the middle colour.
    if (span === 0) return HEAT_STEPS[Math.floor(steps / 2)];
    const index = Math.min(steps - 1, Math.max(0, Math.floor(((value - min) / span) * steps)));
    return HEAT_STEPS[index];
  };
  return { min, max, edges, colorFor };
}

/* -------------------------------------------------------------------------- */
/* Wording                                                                    */
/* -------------------------------------------------------------------------- */

/** Formats a cell value, e.g. "3.4 yds", "62%" or "1,204 throws". */
export function formatValue(topic: HeatmapTopic, value: number, withUnit = true): string {
  if (topic.kind === "rate") return `${Math.round(value * 100)}%`;
  if (topic.kind === "mean") return withUnit ? `${value.toFixed(1)} ${topic.unit}` : value.toFixed(1);
  return withUnit ? `${int(value)} ${topic.unit}` : int(value);
}

/** "5-10 yds downfield" or "0-5 yds behind the line". unit is "yds" or "yards". */
export function describeDepth(xBin: number, binSize: number, unit: "yds" | "yards" = "yds"): string {
  const lo = xBin;
  const hi = xBin + binSize;
  if (lo >= 0) return `${lo}\u2013${hi} ${unit} downfield`;
  if (hi <= 0) return `${-hi}\u2013${-lo} ${unit} behind the line`;
  return `${-lo} ${unit} behind to ${hi} ${unit} downfield`;
}

/** Tooltip zone text, e.g. "10-15 yds downfield, left sideline". */
export function describeZone(cell: HeatCell, grid: HeatmapGrid): string {
  return `${describeDepth(cell.xBin, grid.x_bin_size)}, ${cell.zone.label}`;
}

/** Plain-language sentence naming the highest-value cell. */
export function buildTakeaway(topic: HeatmapTopic, cells: HeatCell[], grid: HeatmapGrid): string {
  if (cells.length === 0) return "No cells meet the minimum number of plays for these filters.";

  // Highest value wins; more plays breaks ties.
  const best = cells.reduce((a, b) => (b.value > a.value || (b.value === a.value && b.count > a.count) ? b : a));

  const template = topic.takeaway ?? "The highest value is {value}, {depth}, {lateral}.";
  return template
    .replace("{depth}", describeDepth(best.xBin, grid.x_bin_size, "yards"))
    .replace("{lateral}", best.zone.phrase)
    .replace("{value}", formatValue(topic, best.value))
    .replace("{plays}", int(best.count));
}
