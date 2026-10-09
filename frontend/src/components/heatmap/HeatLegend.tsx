/**
 * HeatLegend: a stepped legend for the 7-step colour scale.
 *
 * Swatches are flat blocks. Edge labels sit under the boundaries between
 * steps, so the value range and units are readable at a glance.
 */
import type { HeatmapTopic } from "../../api";
import { HEAT_STEPS } from "../../config/theme";
import { formatValue } from "../../lib/heatmap";
import type { ColorScale } from "../../lib/heatmap";

interface HeatLegendProps {
  scale: ColorScale;
  topic: HeatmapTopic;
}

export default function HeatLegend({ scale, topic }: HeatLegendProps) {
  const lo = formatValue(topic, scale.min);
  const hi = formatValue(topic, scale.max);

  return (
    <figure
      className="heat-legend"
      aria-label={`Colour scale for ${topic.label}, from ${lo} to ${hi} in ${HEAT_STEPS.length} steps, dark purple to bright yellow`}
    >
      <figcaption className="heat-legend__title">
        {topic.label} <span className="muted">({topic.unit})</span>
      </figcaption>

      <div className="heat-legend__swatches" aria-hidden="true">
        {HEAT_STEPS.map((color) => (
          <span key={color} className="heat-legend__swatch" style={{ backgroundColor: color }} />
        ))}
      </div>

      {/* Labels at the step edges (8 of them for 7 steps). */}
      <div className="heat-legend__labels num" aria-hidden="true">
        {scale.edges.map((edge, i) => (
          <span
            key={i}
            className="heat-legend__label"
            style={{ left: `${(i / HEAT_STEPS.length) * 100}%` }}
          >
            {formatValue(topic, edge, false)}
          </span>
        ))}
      </div>
    </figure>
  );
}
