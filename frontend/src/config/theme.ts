/**
 * Colour constants for places where CSS variables cannot be used
 * (Recharts props and SVG attributes).
 *
 * These MUST mirror the variables in src/styles/global.css.
 * All colours are flat. No gradients anywhere in this app.
 */
export const COLORS = {
  bg: "#0B0F14",
  panel: "#121821",
  panelRaised: "#1A232F",
  border: "#1F2A36",
  text: "#E8EDF2",
  muted: "#8A99A8",
  red: "#D50A0A",
  navy: "#013369",
  field: "#1E5631",
  fieldDark: "#153F23",
  los: "#2F80ED",
} as const;

/**
 * Position colours, taken from the Okabe-Ito colour-blind-safe palette.
 * Unknown positions fall back to the muted grey.
 */
export const POSITION_COLORS: Record<string, string> = {
  WR: "#56B4E9",
  TE: "#E69F00",
  RB: "#009E73",
  QB: "#CC79A7",
  DB: "#D55E00",
  LB: "#F0E442",
  DL: "#6F9BFF",
  FB: "#B8A9FF",
};

export const positionColor = (position: string): string => POSITION_COLORS[position] ?? COLORS.muted;

/**
 * Seven discrete steps of a viridis-like sequential scale, dark to bright.
 * Colour-blind safe and readable on the green field.
 */
export const HEAT_STEPS = [
  "#440154",
  "#443A83",
  "#31688E",
  "#21908C",
  "#35B779",
  "#8FD744",
  "#FDE725",
] as const;

/**
 * Play simulator colours (Okabe-Ito, colour-blind safe). Offense and defense
 * differ in hue AND lightness, and the target gets a yellow ring on top.
 * Jersey numbers use COLORS.bg, which has 7:1 contrast on both fills.
 */
export const SIM_COLORS = {
  offense: "#56B4E9",
  defense: "#E69F00",
  targetRing: "#F0E442",
  ball: "#8B4513",
} as const;

/** Diverging pair for "above / below expectation" charts (blue vs vermillion). */
export const DIVERGING = {
  positive: "#56B4E9",
  negative: "#D55E00",
} as const;

/** Opacity of the heat cells so the yard lines stay faintly visible. */
export const HEAT_OPACITY = 0.85;
