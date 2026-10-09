/**
 * Heatmap controls: the topic selector and the filter bar.
 * Both are driven by props only, so HeatmapView owns all of the state.
 */
import type { HeatmapTopic } from "../../api";
import type { CoverageFilter, DownFilter } from "../../lib/heatmap";
import PositionChips from "../PositionChips";

/* ----- Topic selector: large segmented buttons generated from heatmap.json ----- */

interface TopicSelectorProps {
  topics: HeatmapTopic[];
  selectedId: string;
  onSelect: (id: string) => void;
}

export function TopicSelector({ topics, selectedId, onSelect }: TopicSelectorProps) {
  return (
    <div className="segmented topic-selector" role="group" aria-label="Heatmap topic">
      {topics.map((topic) => (
        <button
          key={topic.id}
          type="button"
          className="btn btn--large"
          aria-pressed={topic.id === selectedId}
          aria-label={`Show heatmap: ${topic.label}`}
          onClick={() => onSelect(topic.id)}
        >
          {topic.label}
        </button>
      ))}
    </div>
  );
}

/* ----- Filters: position chips, down, coverage ----- */

interface FilterBarProps {
  positionOptions: string[];
  positions: string[];
  onPositionsChange: (next: string[]) => void;
  down: DownFilter;
  onDownChange: (next: DownFilter) => void;
  coverage: CoverageFilter;
  onCoverageChange: (next: CoverageFilter) => void;
}

const DOWN_OPTIONS: { value: DownFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: 1, label: "1" },
  { value: 2, label: "2" },
  { value: 3, label: "3" },
  { value: 4, label: "4" },
];

const COVERAGE_OPTIONS: { value: CoverageFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "man", label: "Man" },
  { value: "zone", label: "Zone" },
];

export function FilterBar({
  positionOptions,
  positions,
  onPositionsChange,
  down,
  onDownChange,
  coverage,
  onCoverageChange,
}: FilterBarProps) {
  return (
    <div className="panel filter-bar">
      <div className="field-group">
        <span className="field-group__label">Position</span>
        <PositionChips options={positionOptions} selected={positions} onChange={onPositionsChange} label="Position filter" />
      </div>

      <div className="field-group">
        <span className="field-group__label">Down</span>
        <div className="segmented" role="group" aria-label="Down filter">
          {DOWN_OPTIONS.map((option) => (
            <button
              key={option.label}
              type="button"
              className="btn"
              aria-pressed={down === option.value}
              aria-label={option.value === "all" ? "All downs" : `Down ${option.label}`}
              onClick={() => onDownChange(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="field-group">
        <span className="field-group__label">Coverage</span>
        <div className="segmented" role="group" aria-label="Coverage filter">
          {COVERAGE_OPTIONS.map((option) => (
            <button
              key={option.label}
              type="button"
              className="btn"
              aria-pressed={coverage === option.value}
              aria-label={option.value === "all" ? "All coverages" : `${option.label} coverage`}
              onClick={() => onCoverageChange(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
