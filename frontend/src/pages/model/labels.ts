/**
 * Plain-language labels and small text helpers for the ML page.
 * Unknown ids fall back to a readable version of the raw name, so a new
 * feature or model in the backend output never breaks the page.
 */

const FEATURE_LABELS: Record<string, string> = {
  sep_nearest: "Separation at the throw",
  sep_second: "Gap to 2nd defender",
  pressure_dist: "Pressure on the QB",
  qb_dist: "Distance from the QB",
  depth: "Depth of the target",
  sideline_dist: "Distance to the sideline",
  rec_accel: "Receiver acceleration",
  rec_speed: "Receiver speed",
  release_speed: "QB speed at release",
  time_to_throw: "Time to throw",
  yardsToGo: "Yards to go",
  down: "Down",
  defendersInBox: "Defenders in the box",
};

const MODEL_LABELS: Record<string, string> = {
  logistic_regression: "Logistic regression",
  random_forest: "Random forest",
  gradient_boosting: "Gradient boosting",
};

const humanize = (id: string): string => {
  const spaced = id.replace(/_/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
};

export const featureLabel = (id: string): string => FEATURE_LABELS[id] ?? humanize(id);
export const modelLabel = (id: string): string => MODEL_LABELS[id] ?? humanize(id);

/** [1,2,3,4,5,6] -> "1–6", [7,8] -> "7–8", [3] -> "3", [1,3] -> "1, 3". */
export function weekRange(weeks: number[]): string {
  const sorted = [...weeks].sort((a, b) => a - b);
  if (sorted.length === 0) return "none";
  const contiguous = sorted.every((w, i) => i === 0 || w === sorted[i - 1] + 1);
  if (sorted.length === 1) return String(sorted[0]);
  return contiguous ? `${sorted[0]}\u2013${sorted[sorted.length - 1]}` : sorted.join(", ");
}

/** 1 -> "1st", 2 -> "2nd", 3 -> "3rd", 4 -> "4th". */
export function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  const suffix = { 1: "st", 2: "nd", 3: "rd" }[n % 10] ?? "th";
  return `${n}${suffix}`;
}

/** "2nd & 10". */
export const downAndDistance = (down: number, yardsToGo: number): string => `${ordinal(down)} & ${yardsToGo}`;
