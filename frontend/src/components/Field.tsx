/**
 * Field: an overhead American football field drawn as a responsive SVG.
 *
 * Reusable anywhere (the ML page can use it later):
 *   <Field losX={40}>
 *     ...any SVG elements, positioned in field yards (0-120 wide, 0-53.3 tall)
 *   </Field>
 *
 * Coordinate system (viewBox 120 x 53.3):
 *   x = 0..10    left end zone
 *   x = 10..110  playing field (x = 10 is the left goal line, x = 60 midfield)
 *   x = 110..120 right end zone
 *   y = 0 is the top sideline, y = 53.3 the bottom sideline
 *
 * All colours are flat. The SVG has no gradients, filters or shadows.
 */
import type { ReactNode } from "react";
import { COLORS } from "../config/theme";
import { FIELD_LENGTH, FIELD_WIDTH } from "../lib/heatmap";
import "./Field.css";

export interface FieldProps {
  /** Overlays (heat cells, markers, routes). Drawn above the turf, below the line of scrimmage. */
  children?: ReactNode;
  /**
   * Show only part of the field: [left, right] edges in field yards, for
   * example [30, 90]. Zooming in keeps players and numbers readable. The
   * default is the whole field, [0, 120].
   */
  xRange?: [number, number];
  /** x position of the line of scrimmage in field yards. Omit to hide it. */
  losX?: number;
  /** Text for the left and right end zones. */
  endZoneText?: [string, string];
  /** Accessible description of the whole field. */
  ariaLabel?: string;
  className?: string;
}

/* ----- Static geometry, computed once at module load ----- */

/** A yard line every 5 yards from goal line to goal line. */
const YARD_LINES = Array.from({ length: 21 }, (_, i) => 10 + i * 5);

/** Numbers every 10 yards: 10 20 30 40 50 40 30 20 10. */
const YARD_NUMBERS = Array.from({ length: 9 }, (_, i) => {
  const x = 20 + i * 10;
  return { x, label: x <= 60 ? x - 10 : 110 - x };
});

/** Distance of the hash marks from each sideline (college/NFL: 23.58 yds from the nearest sideline). */
const HASH_Y = [23.58, FIELD_WIDTH - 23.58];

/**
 * One path for every one-yard tick: near both sidelines and on both hash lines.
 * Ticks that would sit on a 5-yard line are skipped.
 */
const HASH_PATH = (() => {
  const segments: string[] = [];
  for (let x = 11; x < 110; x += 1) {
    if (x % 5 === 0) continue;
    segments.push(`M${x} 0.4V1.4`, `M${x} ${FIELD_WIDTH - 1.4}V${FIELD_WIDTH - 0.4}`);
    for (const y of HASH_Y) segments.push(`M${x} ${y - 0.5}V${y + 0.5}`);
  }
  return segments.join("");
})();

export default function Field({
  children,
  xRange = [0, FIELD_LENGTH],
  losX,
  endZoneText = ["BIG DATA BOWL", "LONDON"],
  ariaLabel = "Overhead view of an American football field",
  className,
}: FieldProps) {
  return (
    <svg
      className={`field${className ? ` ${className}` : ""}`}
      viewBox={`${xRange[0]} 0 ${xRange[1] - xRange[0]} ${FIELD_WIDTH}`}
      role="group"
      aria-label={ariaLabel}
      preserveAspectRatio="xMidYMid meet"
    >
      {/* Turf */}
      <rect x="0" y="0" width={FIELD_LENGTH} height={FIELD_WIDTH} fill={COLORS.field} />

      {/* End zones: flat, darker green, with text */}
      <rect x="0" y="0" width="10" height={FIELD_WIDTH} fill={COLORS.fieldDark} />
      <rect x="110" y="0" width="10" height={FIELD_WIDTH} fill={COLORS.fieldDark} />
      <g className="field__text field__endzone" aria-hidden="true">
        <text transform={`translate(5 ${FIELD_WIDTH / 2}) rotate(-90)`} textAnchor="middle" dominantBaseline="central">
          {endZoneText[0]}
        </text>
        <text transform={`translate(115 ${FIELD_WIDTH / 2}) rotate(90)`} textAnchor="middle" dominantBaseline="central">
          {endZoneText[1]}
        </text>
      </g>

      {/* Yard lines: thicker every 10 yards and on the goal lines */}
      <g stroke="#FFFFFF" aria-hidden="true">
        {YARD_LINES.map((x) => {
          const major = x % 10 === 0;
          const goalLine = x === 10 || x === 110;
          return (
            <line
              key={x}
              x1={x}
              x2={x}
              y1="0"
              y2={FIELD_WIDTH}
              strokeWidth={goalLine ? 0.45 : major ? 0.3 : 0.15}
            />
          );
        })}
        {/* Hash marks, one per yard */}
        <path d={HASH_PATH} strokeWidth="0.12" fill="none" />
        {/* Sidelines */}
        <rect x="0" y="0" width={FIELD_LENGTH} height={FIELD_WIDTH} fill="none" strokeWidth="0.4" />
      </g>

      {/* Yard numbers: top row is upside down, as seen from the broadcast camera */}
      <g className="field__text field__numbers" aria-hidden="true">
        {YARD_NUMBERS.map(({ x, label }) => (
          <g key={x}>
            <text x={x} y="42.8" textAnchor="middle" dominantBaseline="central">
              {label}
            </text>
            <text
              x={x}
              y="10.5"
              textAnchor="middle"
              dominantBaseline="central"
              transform={`rotate(180 ${x} 10.5)`}
            >
              {label}
            </text>
          </g>
        ))}
      </g>

      {/* Caller overlays */}
      {children}

      {/* Line of scrimmage: blue, drawn last so it stays visible over heat cells */}
      {losX !== undefined && (
        <line
          className="field__los"
          x1={losX}
          x2={losX}
          y1="0"
          y2={FIELD_WIDTH}
          stroke={COLORS.los}
          strokeWidth="0.55"
          pointerEvents="none"
          aria-hidden="true"
        />
      )}
    </svg>
  );
}
