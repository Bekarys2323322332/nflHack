/**
 * HeatmapView: the "Heatmap" mode of the Insights page.
 *
 * Layout, top to bottom:
 *   topic selector -> topic heading + sentence -> filters
 *   -> field with heat cells (line of scrimmage fixed at x = 40)
 *   -> colour legend -> takeaway
 *
 * Topics come from heatmap.json, so a new topic needs no code changes.
 */
import { useMemo, useState } from "react";
import { useHeatmap } from "../../api";
import type { HeatmapData } from "../../api";
import { LOS_FIELD_X, FIELD_LENGTH, aggregateCells, buildScale, buildTakeaway } from "../../lib/heatmap";
import type { CoverageFilter, DownFilter, HeatCell } from "../../lib/heatmap";
import Field from "../Field";
import StateMessage from "../StateMessage";
import HeatLegend from "./HeatLegend";
import HeatTooltip from "./HeatTooltip";
import HeatmapLayer from "./HeatmapLayer";
import { FilterBar, TopicSelector } from "./HeatmapControls";

export default function HeatmapView() {
  const { data, loading, error, reload } = useHeatmap();

  if (!data) {
    return <StateMessage loading={loading} error={error} onRetry={reload} what="heatmap" />;
  }
  if (data.topics.length === 0) {
    return <StateMessage loading={false} error="heatmap.json contains no topics." what="heatmap" onRetry={reload} />;
  }
  // Split in two so the hooks below only run when data exists.
  return <HeatmapContent data={data} />;
}

function HeatmapContent({ data }: { data: HeatmapData }) {
  const { grid, topics } = data;

  const [topicId, setTopicId] = useState(topics[0]?.id ?? "");
  // null means "all positions of the current topic". Reset when the topic changes.
  const [chosenPositions, setChosenPositions] = useState<string[] | null>(null);
  const [down, setDown] = useState<DownFilter>("all");
  const [coverage, setCoverage] = useState<CoverageFilter>("all");
  const [activeCell, setActiveCell] = useState<HeatCell | null>(null);

  const topic = topics.find((t) => t.id === topicId) ?? topics[0];

  const positions = chosenPositions ?? topic.positions;

  const cells = useMemo(
    () => aggregateCells(data, topic, { positions, down, coverage }),
    [data, topic, positions, down, coverage],
  );
  const scale = useMemo(() => buildScale(cells.map((c) => c.value)), [cells]);
  const takeaway = useMemo(() => buildTakeaway(topic, cells, grid), [topic, cells, grid]);

  const selectTopic = (id: string) => {
    setTopicId(id);
    setChosenPositions(null);
    setActiveCell(null);
  };

  return (
    <section className="heat-view" aria-label="Heatmap on the field">
      <TopicSelector topics={topics} selectedId={topic.id} onSelect={selectTopic} />

      <div className="heat-head">
        <h2 className="heat-head__title">{topic.label}</h2>
        <p className="heat-head__text muted">{topic.description}</p>
      </div>

      <FilterBar
        positionOptions={topic.positions}
        positions={positions}
        onPositionsChange={(next) => {
          setChosenPositions(next);
          setActiveCell(null);
        }}
        down={down}
        onDownChange={setDown}
        coverage={coverage}
        onCoverageChange={setCoverage}
      />

      <div className="field-stage">
        {/* Label strip: attached to the top of the field, with a marker at the line of scrimmage. */}
        <div className="los-strip">
          <span className="los-strip__marker" style={{ left: `${(LOS_FIELD_X / FIELD_LENGTH) * 100}%` }} aria-hidden="true" />
          <span className="los-strip__text">Line of scrimmage (all plays aligned)</span>
        </div>

        <div className="field-stage__field">
          <Field
            losX={LOS_FIELD_X}
            ariaLabel={`Football field heatmap: ${topic.label}. Use the arrow keys to move between cells.`}
          >
            <HeatmapLayer cells={cells} scale={scale} topic={topic} grid={grid} onActiveChange={setActiveCell} />
          </Field>
          <HeatTooltip cell={activeCell} topic={topic} grid={grid} />
        </div>

        {cells.length === 0 && (
          <p className="field-stage__empty" role="status">
            No cells have enough plays for these filters.
          </p>
        )}
      </div>

      {cells.length > 0 && <HeatLegend scale={scale} topic={topic} />}

      <p className="takeaway" aria-live="polite">
        <span className="takeaway__label">Takeaway</span>
        <span className="takeaway__text">{takeaway}</span>
      </p>
    </section>
  );
}
