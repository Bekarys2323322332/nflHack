/**
 * Data layer for the Insights page.
 *
 * - Flip USE_STATIC to switch between the bundled JSON files in public/data/
 *   and the live FastAPI backend.
 * - Every file has a typed interface below. Keep them in sync with the
 *   backend output (backend/insights/* and backend/ml/*).
 * - useInsight(), useMl() and usePlay() give any component
 *   { data, loading, error, reload }. Responses are cached per URL, so several
 *   components can ask for the same file without refetching.
 */
import { useCallback, useEffect, useState } from "react";

/* -------------------------------------------------------------------------- */
/* Configuration                                                              */
/* -------------------------------------------------------------------------- */

/** true: read /data/insights/<name>.json from public/. false: call the API. */
export const USE_STATIC = true;

const STATIC_BASE = "/data/insights";
const API_BASE = "http://localhost:8000/api/insights";
const ML_STATIC_BASE = "/data/ml";
const ML_API_BASE = "http://localhost:8000/api/ml";

/* -------------------------------------------------------------------------- */
/* Types: separation_leaderboard.json                                         */
/* -------------------------------------------------------------------------- */

/**
 * Positions found in the receiver files. The real data also contains a few
 * fullbacks (FB). They have no filter chip (every FB is under the default
 * target thresholds), but they are counted in the KPI cards.
 */
export type ReceiverPosition = "WR" | "TE" | "RB" | "FB";

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
/* Types: ML files (public/data/ml/)                                          */
/* Typed from the real backend output of backend/ml/*.py.                     */
/* -------------------------------------------------------------------------- */

/** One set of scores. Lower is better for log_loss and brier; higher for auc. */
export interface ScoreSet {
  auc: number;
  log_loss: number;
  brier: number;
}

/** Cross-validation scores for one candidate model, computed on the training weeks only. */
export interface ModelScore {
  /** Snake case id, e.g. "gradient_boosting". */
  name: string;
  cv_auc: number;
  cv_log_loss: number;
  cv_brier: number;
}

/** model_metrics.json */
export interface ModelMetrics {
  /** Id of the model that was refit and scored on the test weeks (lowest CV log loss). */
  best_model: string;
  n_plays: number;
  n_train: number;
  n_test: number;
  train_weeks: number[];
  test_weeks: number[];
  models: ModelScore[];
  /** Scores of the best model on the unseen test weeks. */
  test: ScoreSet & { accuracy: number };
  /** A model that always predicts the training completion rate (no skill, AUC 0.5). */
  baseline_test: ScoreSet;
  /** Share of training passes that were caught, between 0 and 1. */
  baseline_rate: number;
  n_train_games: number;
  n_test_games: number;
}

/** feature_importance.json: permutation importance on the test set. */
export interface FeatureImportanceRow {
  /** Column name from the feature table, e.g. "sep_nearest". */
  feature: string;
  /** Mean DROP in test AUC when that feature is shuffled. Not a percentage; can be slightly negative. */
  importance: number;
}

/** calibration.json: one row per bin of predicted probability, on the unseen test plays. */
export interface CalibrationBin {
  bin: number;
  plays: number;
  /** Average predicted catch probability in the bin, 0 to 1. */
  mean_pred: number;
  /** Share of those passes that were actually caught, 0 to 1. */
  actual: number;
}

/** coe_leaderboard.json: catches over expected, per targeted receiver. */
export interface CoeRow {
  nfl_id: number;
  name: string;
  position: string;
  targets: number;
  catches: number;
  /** Sum of the model's catch probabilities over this receiver's targets. */
  expected: number;
  /** catches - expected. */
  coe: number;
  coe_per_target: number;
  avg_sep: number;
}

/** "C" caught, "I" incomplete, "IN" intercepted. */
export type PlayResult = "C" | "I" | "IN";

/**
 * Why a play was picked for the simulator:
 *   impossible_catch  a catch the model gave a very low chance
 *   missed_chance     an incompletion the model gave a very high chance
 *   interception      any intercepted pass
 *   normal            a typical play
 */
export type PlayCategory = "impossible_catch" | "missed_chance" | "interception" | "normal";

/** play_index.json: one row per simulator play. */
export interface PlayIndexRow {
  game_id: number;
  play_id: number;
  /** Targeted receiver. */
  name: string;
  position: string;
  result: PlayResult;
  result_label: string;
  /** Model's catch probability, 0 to 1. */
  p_catch: number;
  category: PlayCategory;
  description: string;
  down: number;
  yards_to_go: number;
  /** PFF coverage scheme, e.g. "Cover-3". */
  coverage: string;
}

export interface PlayPlayer {
  nfl_id: number;
  jersey: number;
  /** Team abbreviation. */
  team: string;
  /** Field yards, 0 to 120 (end zones included). Offense always moves toward larger x. */
  x: number;
  /** Field yards, 0 to 53.3. */
  y: number;
  is_offense: boolean;
  is_target: boolean;
}

export interface PlayFrame {
  frame_id: number;
  ball: { x: number; y: number };
  /** Always 22 players: 11 offense and 11 defense. There is no position field. */
  players: PlayPlayer[];
}

/** A route runner at the throw, scored by the same model. The target is included. */
export interface PlayOption {
  nfl_id: number;
  name: string;
  jersey: number | null;
  p_catch: number;
}

/** plays/play_<gameId>_<playId>.json: tracking from the snap to the throw, at 10 frames per second. */
export interface PlayDetail {
  game_id: number;
  play_id: number;
  description: string;
  result: PlayResult;
  result_label: string;
  p_catch: number;
  /** frame_id of the throw. It is also the id of the last frame in `frames`. */
  throw_frame: number;
  /** x of the line of scrimmage in field yards. */
  line_of_scrimmage_x: number;
  receiver: { nfl_id: number; name: string; position: string; jersey: number };
  /** Sorted by p_catch, best first. Includes the target. May be empty. */
  options: PlayOption[];
  frames: PlayFrame[];
}

/* -------------------------------------------------------------------------- */
/* Fetching                                                                   */
/* -------------------------------------------------------------------------- */

/** Maps each insight file name to the type of its parsed contents. */
export interface InsightMap {
  separation_leaderboard: SeparationRow[];
  man_vs_zone: ManVsZoneRow[];
  heatmap: HeatmapData;
}

/** Maps each ML file name to the type of its parsed contents. */
export interface MlMap {
  model_metrics: ModelMetrics;
  feature_importance: FeatureImportanceRow[];
  calibration: CalibrationBin[];
  coe_leaderboard: CoeRow[];
  play_index: PlayIndexRow[];
}

export type InsightName = keyof InsightMap;
export type MlName = keyof MlMap;

export function insightUrl(name: InsightName): string {
  return USE_STATIC ? `${STATIC_BASE}/${name}.json` : `${API_BASE}/${name}`;
}

export function mlUrl(name: MlName): string {
  return USE_STATIC ? `${ML_STATIC_BASE}/${name}.json` : `${ML_API_BASE}/${name}`;
}

/** URL of one play's tracking file. The API route is an assumption: the backend API is not written yet. */
export function playUrl(gameId: number, playId: number): string {
  return USE_STATIC
    ? `${ML_STATIC_BASE}/plays/play_${gameId}_${playId}.json`
    : `${ML_API_BASE}/plays/${gameId}/${playId}`;
}

/** One in-flight or finished request per URL, shared by every component. */
const cache = new Map<string, Promise<unknown>>();

async function request<T>(url: string): Promise<T> {
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
    return (await response.json()) as T;
  } catch {
    // The Vite dev server answers unknown paths with index.html, which is not JSON.
    throw new Error(`${url} did not return valid JSON. Check that the file exists.`);
  }
}

/** Fetches a JSON URL once; later callers share the same promise. */
export function fetchJson<T>(url: string): Promise<T> {
  const hit = cache.get(url);
  if (hit) return hit as Promise<T>;

  const pending = request<T>(url);
  cache.set(url, pending);
  // Do not cache failures, so "Try again" really retries.
  pending.catch(() => cache.delete(url));
  return pending;
}

export function fetchInsight<N extends InsightName>(name: N): Promise<InsightMap[N]> {
  return fetchJson<InsightMap[N]>(insightUrl(name));
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

/** What the hook remembers about the most recent request. */
interface Settled<T> {
  url: string;
  data: T | null;
  error: string | null;
}

/**
 * Loads one JSON URL and tracks its loading and error state.
 * Pass null to load nothing (for example, before a play is chosen).
 * When the URL changes, `data` is null again until the new file arrives, so
 * a stale response is never shown for the wrong URL.
 */
export function useJson<T>(url: string | null): InsightState<T> {
  const [settled, setSettled] = useState<Settled<T> | null>(null);
  // Bumped by reload() to re-run the effect.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (url === null) return;
    // Guards against setting state after unmount or after a newer request began.
    let active = true;

    fetchJson<T>(url).then(
      (data) => {
        if (active) setSettled({ url, data, error: null });
      },
      (err: unknown) => {
        if (active) {
          setSettled({
            url,
            data: null,
            error: err instanceof Error ? err.message : "Something went wrong while loading data.",
          });
        }
      },
    );

    return () => {
      active = false;
    };
  }, [url, attempt]);

  const reload = useCallback(() => {
    if (url === null) return;
    cache.delete(url);
    setSettled(null);
    setAttempt((n) => n + 1);
  }, [url]);

  const current = settled && settled.url === url ? settled : null;
  return {
    data: current?.data ?? null,
    loading: url !== null && current === null,
    error: current?.error ?? null,
    reload,
  };
}

/** Loads one insight file. */
export function useInsight<N extends InsightName>(name: N): InsightState<InsightMap[N]> {
  return useJson<InsightMap[N]>(insightUrl(name));
}

/** Loads one ML summary file. */
export function useMl<N extends MlName>(name: N): InsightState<MlMap[N]> {
  return useJson<MlMap[N]>(mlUrl(name));
}

/** Loads one play's tracking file, or nothing while `play` is null. */
export function usePlay(play: { game_id: number; play_id: number } | null): InsightState<PlayDetail> {
  return useJson<PlayDetail>(play ? playUrl(play.game_id, play.play_id) : null);
}

export const useSeparationLeaderboard = () => useInsight("separation_leaderboard");
export const useManVsZone = () => useInsight("man_vs_zone");
export const useHeatmap = () => useInsight("heatmap");
