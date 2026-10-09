/**
 * HeatmapLayer: draws heat cells as SVG rectangles inside <Field>.
 *
 * Two modes:
 *   - interactive (default): cells can be hovered and focused. Keyboard users
 *     tab into the grid once (roving tabindex) and move with the arrow keys.
 *   - non-interactive: purely decorative (used as the faded backdrop in
 *     charts mode). Hidden from assistive technology and ignores the pointer.
 */
import { useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import type { HeatmapGrid, HeatmapTopic } from "../../api";
import { HEAT_OPACITY } from "../../config/theme";
import { describeZone, formatValue } from "../../lib/heatmap";
import type { ColorScale, HeatCell } from "../../lib/heatmap";

interface HeatmapLayerProps {
  cells: HeatCell[];
  scale: ColorScale;
  topic: HeatmapTopic;
  grid: HeatmapGrid;
  interactive?: boolean;
  /** Called with the hovered/focused cell, or null when it is left. */
  onActiveChange?: (cell: HeatCell | null) => void;
}

export default function HeatmapLayer({
  cells,
  scale,
  topic,
  grid,
  interactive = true,
  onActiveChange,
}: HeatmapLayerProps) {
  // Cell that currently owns the single tab stop.
  const [tabKey, setTabKey] = useState<string | null>(null);
  const refs = useRef(new Map<string, SVGRectElement>());

  if (!interactive) {
    return (
      <g aria-hidden="true" pointerEvents="none">
        {cells.map((cell) => (
          <rect
            key={cell.key}
            x={cell.x}
            y={cell.y}
            width={cell.width}
            height={cell.height}
            fill={scale.colorFor(cell.value)}
            opacity={HEAT_OPACITY}
          />
        ))}
      </g>
    );
  }

  const byKey = new Map(cells.map((c) => [c.key, c]));
  // If the remembered tab stop disappeared (a filter changed), fall back to the first cell.
  const activeTabKey = tabKey && byKey.has(tabKey) ? tabKey : cells[0]?.key;

  /** Finds the next visible cell in a direction by stepping through bins. */
  const neighbour = (from: HeatCell, dx: number, dy: number): HeatCell | undefined => {
    const maxX = Math.max(...cells.map((c) => c.xBin));
    const minX = Math.min(...cells.map((c) => c.xBin));
    let xBin = from.xBin;
    let yBin = from.yBin;
    for (;;) {
      xBin += dx * grid.x_bin_size;
      yBin += dy;
      if (xBin < minX || xBin > maxX || yBin < 0 || yBin >= grid.y_zones.length) return undefined;
      const found = byKey.get(`${xBin}:${yBin}`);
      if (found) return found;
    }
  };

  const onKeyDown = (event: KeyboardEvent<SVGRectElement>, cell: HeatCell) => {
    const move: Record<string, [number, number]> = {
      ArrowRight: [1, 0],
      ArrowLeft: [-1, 0],
      ArrowDown: [0, 1],
      ArrowUp: [0, -1],
    };
    if (event.key === "Escape") {
      onActiveChange?.(null);
      return;
    }
    const delta = move[event.key];
    if (!delta) return;
    event.preventDefault();
    const target = neighbour(cell, delta[0], delta[1]);
    if (target) {
      setTabKey(target.key);
      refs.current.get(target.key)?.focus();
    }
  };

  return (
    <g>
      {cells.map((cell) => (
        <rect
          key={cell.key}
          ref={(el) => {
            if (el) refs.current.set(cell.key, el);
            else refs.current.delete(cell.key);
          }}
          className="heat-cell"
          x={cell.x}
          y={cell.y}
          width={cell.width}
          height={cell.height}
          fill={scale.colorFor(cell.value)}
          opacity={HEAT_OPACITY}
          tabIndex={cell.key === activeTabKey ? 0 : -1}
          role="img"
          aria-label={`${describeZone(cell, grid)}: ${topic.label} ${formatValue(topic, cell.value)}, ${cell.count} plays`}
          onMouseEnter={() => onActiveChange?.(cell)}
          onMouseLeave={() => onActiveChange?.(null)}
          onFocus={() => {
            setTabKey(cell.key);
            onActiveChange?.(cell);
          }}
          onBlur={() => onActiveChange?.(null)}
          onKeyDown={(e) => onKeyDown(e, cell)}
        />
      ))}
    </g>
  );
}
