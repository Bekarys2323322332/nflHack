/**
 * Play simulator timeline and geometry. Pure functions, no React.
 *
 * The whole animation is a function of ONE number: t, the milliseconds since
 * the play started. Playing, pausing, scrubbing and restarting only change t,
 * so every state can be reproduced exactly.
 *
 *   0 .................. trackingMs   tracking frames at 10 per second
 *   trackingMs ......... cardAt        hold on the throw frame (0.5 s)
 *   cardAt ............. flightStart   "Model: XX% catch probability" card shown
 *   flightStart ........ flightEnd     ball flies from the QB to the target (0.8 s)
 *   flightEnd .......... verdictAt     result badge shown
 *   verdictAt .......... totalMs       "Model was right / surprised" shown
 */
import type { PlayDetail, PlayResult } from "../../../api";

/* ----- Timing constants (milliseconds) ----- */
/** Tracking data is recorded at 10 frames per second. */
export const FRAME_MS = 100;
/** Pause on the throw frame before the probability card appears. */
export const HOLD_MS = 500;
/** How long the card is on screen before the ball leaves (so it can be read). */
export const CARD_MS = 1000;
/** Illustrated ball flight. */
export const FLIGHT_MS = 800;
/** Time between the result badge and the verdict. */
export const VERDICT_DELAY_MS = 700;
/** Time the final state stays on screen before the clock stops. */
const TAIL_MS = 500;

export interface Timeline {
  frameCount: number;
  trackingMs: number;
  cardAt: number;
  flightStart: number;
  flightEnd: number;
  verdictAt: number;
  totalMs: number;
}

export function buildTimeline(frameCount: number): Timeline {
  // The last frame (the throw) first appears at (frameCount - 1) * FRAME_MS.
  const trackingMs = Math.max(0, frameCount - 1) * FRAME_MS;
  const cardAt = trackingMs + HOLD_MS;
  const flightStart = cardAt + CARD_MS;
  const flightEnd = flightStart + FLIGHT_MS;
  const verdictAt = flightEnd + VERDICT_DELAY_MS;
  return { frameCount, trackingMs, cardAt, flightStart, flightEnd, verdictAt, totalMs: verdictAt + TAIL_MS };
}

export type Phase = "tracking" | "hold" | "card" | "flight" | "result" | "verdict";

export interface SimState {
  phase: Phase;
  /** Index into play.frames. Stays on the last frame after the throw. */
  frameIndex: number;
  /** The "Model: XX%" card and the option labels are visible. */
  showCard: boolean;
  /** 0 to 1 while the ball is flying or has landed; null before it leaves. */
  flightProgress: number | null;
  showBadge: boolean;
  showVerdict: boolean;
}

/**
 * What is on screen at time t.
 * With reduced motion the ball does not fly: it appears at the target the
 * moment the flight would start.
 */
export function stateAt(tl: Timeline, t: number, reducedMotion: boolean): SimState {
  // Clamped on both sides so a stray t can never index outside the frame list.
  const frameIndex = Math.max(0, Math.min(Math.floor(t / FRAME_MS), tl.frameCount - 1));

  let phase: Phase = "tracking";
  if (t >= tl.verdictAt) phase = "verdict";
  else if (t >= tl.flightEnd) phase = "result";
  else if (t >= tl.flightStart) phase = "flight";
  else if (t >= tl.cardAt) phase = "card";
  else if (t >= tl.trackingMs) phase = "hold";

  let flightProgress: number | null = null;
  if (t >= tl.flightEnd) flightProgress = 1;
  else if (t >= tl.flightStart) flightProgress = reducedMotion ? 1 : (t - tl.flightStart) / FLIGHT_MS;

  return {
    phase,
    frameIndex,
    showCard: t >= tl.cardAt,
    flightProgress,
    showBadge: t >= tl.flightEnd,
    showVerdict: t >= tl.verdictAt,
  };
}

/** Short text for the scrubber's aria-valuetext and the visible readout. */
export function describeState(state: SimState, frameCount: number): string {
  switch (state.phase) {
    case "tracking":
      return `Frame ${state.frameIndex + 1} of ${frameCount}`;
    case "hold":
      return "At the throw";
    case "card":
      return "Model prediction shown";
    case "flight":
      return "Ball in flight";
    case "result":
      return "Result shown";
    case "verdict":
      return "Model verdict shown";
  }
}

/**
 * Right = the model leaned the correct way: p >= 0.5 and the pass was caught,
 * or p < 0.5 and it was not caught (incomplete or intercepted).
 */
export function modelWasRight(pCatch: number, result: PlayResult): boolean {
  return result === "C" ? pCatch >= 0.5 : pCatch < 0.5;
}

/* -------------------------------------------------------------------------- */
/* Geometry                                                                   */
/* -------------------------------------------------------------------------- */

export interface Point {
  x: number;
  y: number;
}

export interface PlayGeometry {
  /** Left and right edge of the zoomed field view, in field yards. */
  xRange: [number, number];
  /** Where the ball is when it leaves (the QB's hands, from the last tracking frame). */
  from: Point;
  /** Where it lands: the edge of the target's marker, on the QB's side. */
  to: Point;
  /** Peak height of the illustrated arc, in yards. */
  arcHeight: number;
}

const FIELD_LENGTH = 120;
/** Default narrowest view on wide screens, in yards. */
export const DESKTOP_MIN_VIEW_YARDS = 60;
/** On phones the view is tighter so jersey numbers stay as large as possible. */
export const PHONE_MIN_VIEW_YARDS = 44;
/** Extra yards around the formation. The view is never narrower than the formation plus this. */
const VIEW_PADDING = 14;
/** Radius of a player marker in yards. Shared with the stage so the ball lands on the edge. */
export const MARKER_RADIUS = 1.25;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function playGeometry(play: PlayDetail, minViewYards = DESKTOP_MIN_VIEW_YARDS): PlayGeometry {
  // One fixed view per play (computed from every frame), so the camera never moves.
  const xs = play.frames.flatMap((f) => f.players.map((p) => p.x));
  const minX = Math.min(...xs, play.line_of_scrimmage_x);
  const maxX = Math.max(...xs, play.line_of_scrimmage_x);
  const width = clamp(maxX - minX + VIEW_PADDING, minViewYards, FIELD_LENGTH);
  const left = clamp((minX + maxX) / 2 - width / 2, 0, FIELD_LENGTH - width);

  const last = play.frames[play.frames.length - 1];
  const from: Point = { x: last.ball.x, y: last.ball.y };
  const target = last.players.find((p) => p.is_target);
  const center: Point = target ? { x: target.x, y: target.y } : from;

  // Land on the marker's edge facing the QB rather than hiding the jersey number.
  const dx = center.x - from.x;
  const dy = center.y - from.y;
  const dist = Math.hypot(dx, dy);
  const back = dist > MARKER_RADIUS ? MARKER_RADIUS * 0.8 : 0;
  const to: Point = dist > 0 ? { x: center.x - (dx / dist) * back, y: center.y - (dy / dist) * back } : center;

  return {
    xRange: [left, left + width],
    from,
    to,
    arcHeight: clamp(0.18 * dist, 1.5, 7),
  };
}

export interface BallPoint {
  /** Where the ball is drawn (on the arc). */
  x: number;
  y: number;
  /** Where its shadow is (on the ground line). */
  shadowX: number;
  shadowY: number;
  /** Drawn larger at the top of the arc to suggest height. */
  scale: number;
}

/**
 * Position along the illustrated flight at progress u (0 to 1).
 * Seen from above, the ball travels the straight line from the QB to the
 * target; height is shown by lifting it toward the top of the screen and
 * scaling it up, with a shadow left on the ground.
 */
export function ballAt(g: PlayGeometry, u: number): BallPoint {
  const gx = g.from.x + (g.to.x - g.from.x) * u;
  const gy = g.from.y + (g.to.y - g.from.y) * u;
  const lift = 4 * u * (1 - u); // 0 at both ends, 1 at the middle
  return { x: gx, y: gy - lift * g.arcHeight, shadowX: gx, shadowY: gy, scale: 1 + 0.9 * lift };
}

/** Points of the whole arc, for drawing the dashed trail. */
export function arcPath(g: PlayGeometry, steps = 24): string {
  const pts = Array.from({ length: steps + 1 }, (_, i) => ballAt(g, i / steps));
  return pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(" ");
}

/** The best-scoring option. Ties go to the first entry (the backend sorts best first). */
export function bestOption<T extends { p_catch: number }>(options: T[]): T | null {
  return options.reduce<T | null>((best, o) => (best === null || o.p_catch > best.p_catch ? o : best), null);
}
