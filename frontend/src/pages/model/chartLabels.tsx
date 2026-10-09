/**
 * Value labels for horizontal bars that may point left or right.
 *
 * Recharts' built-in "right" label position sits on the wrong side of negative
 * bars, so diverging charts use this custom renderer instead.
 *
 *   - Long bar:  the label sits INSIDE the tip, in dark text (fills are light
 *                enough for 4.5:1 contrast). This keeps it clear of axis names.
 *   - Short bar: the label sits just outside the tip, in light text. A short
 *                NEGATIVE bar puts it on the right of the zero line instead,
 *                where the row is empty, so it never runs into the axis names.
 */
import { COLORS } from "../../config/theme";

/** The subset of Recharts' label props we read. They arrive loosely typed, so each is converted with Number(). */
interface LabelProps {
  x?: unknown;
  y?: unknown;
  width?: unknown;
  height?: unknown;
  value?: unknown;
}

/** A bar at least this many pixels long gets its label inside. */
const INSIDE_MIN_PX = 64;
const GAP = 6;

/** Returns a LabelList `content` function that prints format(value) at a bar's tip. */
export function endValueLabel(format: (value: number) => string) {
  return function EndValueLabel(props: LabelProps) {
    const value = Number(props.value);
    const x = Number(props.x);
    const width = Number(props.width);
    const y = Number(props.y);
    const height = Number(props.height);
    if (![value, x, width, y, height].every(Number.isFinite)) return <g />;

    // A bar's rectangle may report a negative width; take the true left and right edges.
    const left = Math.min(x, x + width);
    const right = Math.max(x, x + width);
    const pointsRight = value >= 0;
    const inside = right - left >= INSIDE_MIN_PX;

    let labelX: number;
    let anchor: "start" | "end";
    if (inside) {
      labelX = pointsRight ? right - GAP : left + GAP;
      anchor = pointsRight ? "end" : "start";
    } else if (pointsRight) {
      labelX = right + GAP;
      anchor = "start";
    } else {
      // Short negative bar: its right edge is the zero line.
      labelX = right + GAP;
      anchor = "start";
    }

    return (
      <text
        x={labelX}
        y={y + height / 2}
        textAnchor={anchor}
        dominantBaseline="central"
        fill={inside ? COLORS.bg : COLORS.text}
        fontSize={14}
        fontWeight={inside ? 600 : 400}
      >
        {format(value)}
      </text>
    );
  };
}
