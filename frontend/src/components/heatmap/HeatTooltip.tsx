/**
 * HeatTooltip: an HTML tooltip placed over the field next to the active cell.
 *
 * It is positioned with percentages of the field size, so it follows the SVG as
 * it scales. It is aria-hidden: each cell already carries a full aria-label,
 * so screen readers do not hear the information twice.
 */
import type { CSSProperties } from "react";
import type { HeatmapGrid, HeatmapTopic } from "../../api";
import { FIELD_LENGTH, FIELD_WIDTH, describeZone, formatValue } from "../../lib/heatmap";
import type { HeatCell } from "../../lib/heatmap";
import { int } from "../../lib/format";

interface HeatTooltipProps {
  cell: HeatCell | null;
  topic: HeatmapTopic;
  grid: HeatmapGrid;
}

export default function HeatTooltip({ cell, topic, grid }: HeatTooltipProps) {
  if (!cell) return null;

  // Anchor point: the horizontal centre and the top/bottom edge of the cell.
  const xFrac = (cell.x + cell.width / 2) / FIELD_LENGTH;
  const yCenterFrac = (cell.y + cell.height / 2) / FIELD_WIDTH;
  const below = yCenterFrac < 0.5; // cells in the top half get a tooltip below them
  const yFrac = (below ? cell.y + cell.height : cell.y) / FIELD_WIDTH;

  // Keep the tooltip inside the field horizontally.
  const align = xFrac < 0.25 ? "start" : xFrac > 0.75 ? "end" : "center";
  const translateX = align === "start" ? "0%" : align === "end" ? "-100%" : "-50%";

  const style: CSSProperties = {
    left: `${xFrac * 100}%`,
    top: `${yFrac * 100}%`,
    transform: `translate(${translateX}, ${below ? "8px" : "calc(-100% - 8px)"})`,
  };

  return (
    <div className="heat-tooltip" style={style} aria-hidden="true">
      <p className="heat-tooltip__zone">{describeZone(cell, grid)}</p>
      <p className="heat-tooltip__row">
        <span className="muted">{topic.label}</span>
        <span className="num heat-tooltip__value">{formatValue(topic, cell.value)}</span>
      </p>
      <p className="heat-tooltip__row">
        <span className="muted">Plays</span>
        <span className="num heat-tooltip__value">{int(cell.count)}</span>
      </p>
    </div>
  );
}
