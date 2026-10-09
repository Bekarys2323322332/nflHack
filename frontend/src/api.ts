/**
 * Data layer for the Insights page.
 *
 * - Flip USE_STATIC to switch between the bundled JSON files in public/data/
 *   and the live FastAPI backend.
 * - Every file has a typed interface below. Keep them in sync with the
 *   backend output (backend/insights/*).
 * - useInsight() gives any component { data, loading, error, reload }.
 *   Responses are cached per file, so several components can ask for the same
 *   file without refetching.
 */
import { useCallback, useEffect, useState } from "react";

/* -------------------------------------------------------------------------- */
/* Configuration                                                              */
/* -------------------------------------------------------------------------- */

/** true: read /data/insights/<name>.json from public/. false: call the API. */
export const USE_STATIC = true;

const STATIC_BASE = "/data/insights";
const API_BASE = "http://localhost:8000/api/insights";

/* -------------------------------------------------------------------------- */
/* Types: separation_leaderboard.json                                         */
/* -------------------------------------------------------------------------- */

/** Positions that appear in the receiver charts. */
export type ReceiverPosition = "WR" | "TE" | "RB";

export interface SeparationRow {
  nfl_id: number;
  name: string;
  position: ReceiverPosition;
  /** Total targets in the sample. */
  targets: number;
  /** Fraction between 0 and 1 (0.64 means 64%). */
  catch_rate: number;
  /** Average separation from the nearest defender at the throw, in yards. */
  avg_sep: number;
  /** Average release speed, in yards per second. */
  avg_release_speed: number;
}

/* -------------------------------------------------------------------------- */
/* Types: man_vs_zone.json                                                    */
/* -------------------------------------------------------------------------- */

export interface ManVsZoneRow {
  nfl_id: number;
  name: string;
  position: ReceiverPosition;
  /** Average separation against man coverage, in yards. */
  sep_man: number;
  /** Average separation against zone coverage, in yards. */
  sep_zone: number;
  /** sep_man minus sep_zone. The charts recompute this so it always matches the axes. */
  diff: number;
  targets_man: number;
  targets_zone: number;
}

/* -------------------------------------------------------------------------- */
/* Types: heatmap.json                                                        */
/* -------------------------------------------------------------------------- */

/**
 * How a topic turns the summed cell fields into one value:
 *   count -> count
 *   mean  -> value_sum / count
 *   rate  -> catches / count
 */
export type HeatmapKind = "count" | "mean" | "rate";

/** A lane across the field, measured from the offense's left sideline. */
export interface HeatmapYZone {
  /** Lane edges in yards from the left sideline (0 to 53.3). */
  y0: number;
  y1: number;
  /** Used in tooltips, e.g. "left sideline". */
  label: string;
  /** Used in the takeaway sentence, e.g. "outside the numbers (left)". */
  phrase: string;
}

export interface HeatmapGrid {
  /** Width of each depth bin in yards. */
  x_bin_size: number;
  x_min: number;
  x_max: number;
  /** Default minimum plays for a cell to be drawn. */
  min_plays: number;
  /** Lanes, left sideline to right sideline. A row's y_bin indexes this array. */
  y_zones: HeatmapYZone[];
}

export interface HeatmapTopic {
  id: string;
  label: string;
  description: string;
  kind: HeatmapKind;
  /** Shown in the legend and tooltip: "throws", "yds", "%", ... */
  unit: string;
  /** Position chips offered for this topic. */
  positions: string[];
  /**
   * Optional takeaway template. Placeholders: {depth}, {lateral}, {value}, {plays}.
   * Example: "Most throws go {depth}, {lateral}."
   */
  takeaway?: string;
  /** Optional per-topic override of grid.min_plays. */
  min_plays?: number;
}

export interface HeatmapRow {
  topic: string;
  /** Yards from the line of scrimmage (lower edge of the bin). Negative is behind the line. */
  x_bin: number;
  /** Index into grid.y_zones. */
  y_bin: number;
  position: string;
  down: number;
  coverage: "man" | "zone";
  count: number;
  value_sum: number;
  catches: number;
}

export interface HeatmapData {
  grid: HeatmapGrid;
  topics: HeatmapTopic[];
  rows: HeatmapRow[];
}

/* -------------------------------------------------------------------------- */
/* Fetching                                                                   */
/* -------------------------------------------------------------------------- */

/** Maps each file name to the type of its parsed contents. */
export interface InsightMap {
  separation_leaderboard: SeparationRow[];
  man_vs_zone: ManVsZoneRow[];
  heatmap: HeatmapData;
}

export type InsightName = keyof InsightMap;

export function insightUrl(name: InsightName): string {
  return USE_STATIC ? `${STATIC_BASE}/${name}.json` : `${API_BASE}/${name}`;
}

/** One in-flight or finished request per file. */
const cache = new Map<InsightName, Promise<unknown>>();

async function request<N extends InsightName>(name: N): Promise<InsightMap[N]> {
  const url = insightUrl(name);
  let response: Response;
  try {
    response = await fetch(url);
  } catch {
    throw new Error(`Could not reach ${url}. ${USE_STATIC ? "Is the dev server running?" : "Is the API running on port 8000?"}`);
  }
  if (!response.ok) {
    throw new Error(`Request for ${url} failed with status ${response.status}.`);
  }
  try {
    return (await response.json()) as InsightMap[N];
  } catch {
    // The Vite dev server answers unknown paths with index.html, which is not JSON.
    throw new Error(`${url} did not return valid JSON. Check that the file exists.`);
  }
}

export function fetchInsight<N extends InsightName>(name: N): Promise<InsightMap[N]> {
  const hit = cache.get(name);
  if (hit) return hit as Promise<InsightMap[N]>;

  const pending = request(name);
  cache.set(name, pending);
  // Do not cache failures, so "Try again" really retries.
  pending.catch(() => cache.delete(name));
  return pending;
}

/* -------------------------------------------------------------------------- */
/* React hooks                                                                */
/* -------------------------------------------------------------------------- */

export interface InsightState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  /** Clears the cached response and fetches again. */
  reload: () => void;
}

/** Loads one insight file and tracks its loading and error state. */
export function useInsight<N extends InsightName>(name: N): InsightState<InsightMap[N]> {
  const [data, setData] = useState<InsightMap[N] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Bumped by reload() to re-run the effect.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    // Guards against setting state after unmount or after a newer request began.
    let active = true;
    setLoading(true);
    setError(null);

    fetchInsight(name).then(
      (result) => {
        if (!active) return;
        setData(result);
        setLoading(false);
      },
      (err: unknown) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Something went wrong while loading data.");
        setLoading(false);
      },
    );

    return () => {
      active = false;
    };
  }, [name, attempt]);

  const reload = useCallback(() => {
    cache.delete(name);
    setAttempt((n) => n + 1);
  }, [name]);

  return { data, loading, error, reload };
}

export const useSeparationLeaderboard = () => useInsight("separation_leaderboard");
export const useManVsZone = () => useInsight("man_vs_zone");
export const useHeatmap = () => useInsight("heatmap");
