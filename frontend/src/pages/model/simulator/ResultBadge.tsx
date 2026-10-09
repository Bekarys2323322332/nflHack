/**
 * ResultBadge: CAUGHT, INCOMPLETE or INTERCEPTED.
 *
 * The meaning is always in the text, never only in the colour. Dark text on
 * each fill has at least 4.5:1 contrast.
 */
import type { PlayResult } from "../../../api";

const STYLE: Record<PlayResult, { label: string; short: string }> = {
  C: { label: "Caught", short: "C" },
  I: { label: "Incomplete", short: "I" },
  IN: { label: "Intercepted", short: "IN" },
};

interface ResultBadgeProps {
  result: PlayResult;
  /** "compact": CAUGHT. "full": CAUGHT (C), used on the big reveal. */
  size?: "compact" | "full";
}

export default function ResultBadge({ result, size = "compact" }: ResultBadgeProps) {
  const { label, short } = STYLE[result];
  return (
    <span className={`result-badge result-badge--${result.toLowerCase()} result-badge--${size}`}>
      {label.toUpperCase()}
      {size === "full" && ` (${short})`}
    </span>
  );
}
