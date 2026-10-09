/**
 * ChartsView: the "Charts" mode of the Insights page.
 *
 *   faded field with the player_density heatmap as a backdrop
 *   -> chart grid (generated from src/config/charts.ts)
 *   -> KPI cards
 *
 * The backdrop sits above the chart panels, never behind them, so it can
 * never reduce the contrast of chart text.
 */
import { useMemo } from "react";
import { useHeatmap } from "../../api";
import { charts } from "../../config/charts";
import type { ChartVisibility } from "../../hooks/useChartVisibility";
import { LOS_FIELD_X, aggregateCells, buildScale } from "../../lib/heatmap";
import Field from "../Field";
import KpiCards from "../KpiCards";
import HeatmapLayer from "../heatmap/HeatmapLayer";

/** The topic id used for the backdrop. */
const BACKDROP_TOPIC = "player_density";

function FieldBackdrop() {
  const { data } = useHeatmap();

  // All positions, all downs, all coverages.
  const layer = useMemo(() => {
    const topic = data?.topics.find((t) => t.id === BACKDROP_TOPIC);
    if (!data || !topic) return null;
    const cells = aggregateCells(data, topic, { positions: topic.positions, down: "all", coverage: "all" });
    return { cells, scale: buildScale(cells.map((c) => c.value)), topic, grid: data.grid };
  }, [data]);

  return (
    <figure className="backdrop">
      <div className="backdrop__field">
        <Field losX={LOS_FIELD_X} ariaLabel="Overhead football field with a faint map of where players stand">
          {layer && <HeatmapLayer cells={layer.cells} scale={layer.scale} topic={layer.topic} grid={layer.grid} interactive={false} />}
        </Field>
      </div>
      {layer && <figcaption className="backdrop__caption muted">{layer.topic.description}</figcaption>}
    </figure>
  );
}

export default function ChartsView({ visibility }: { visibility: ChartVisibility }) {
  const visible = charts.filter((chart) => visibility.isVisible(chart.id));

  return (
    <div className="charts-view">
      <FieldBackdrop />

      {visible.length === 0 ? (
        <p className="state" role="status">
          All charts are hidden. Use Customize to show them again.
        </p>
      ) : (
        <div className="charts-grid">
          {visible.map((chart) => {
            const Chart = chart.component;
            return <Chart key={chart.id} title={chart.title} subtitle={chart.subtitle} />;
          })}
        </div>
      )}

      <KpiCards />
    </div>
  );
}
