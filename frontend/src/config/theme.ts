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

/** Opacity of the heat cells so the yard lines stay faintly visible. */
export const HEAT_OPACITY = 0.85;
