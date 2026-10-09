/**
 * PlayList: filter chips plus a scrollable list of plays from play_index.json.
 * Each row shows the receiver, a result badge and the model's catch %.
 */
import type { PlayIndexRow } from "../../../api";
import { pct } from "../../../lib/format";
import ResultBadge from "./ResultBadge";

export type PlayFilter = "all" | "C" | "I" | "IN" | "impossible_catch" | "missed_chance";

/** Chips in display order. `test` decides which plays each one keeps. */
export const PLAY_FILTERS: { id: PlayFilter; label: string; test: (row: PlayIndexRow) => boolean }[] = [
  { id: "all", label: "All", test: () => true },
  { id: "C", label: "Caught", test: (r) => r.result === "C" },
  { id: "I", label: "Incomplete", test: (r) => r.result === "I" },
  { id: "IN", label: "Intercepted", test: (r) => r.result === "IN" },
  { id: "impossible_catch", label: "Impossible catches", test: (r) => r.category === "impossible_catch" },
  { id: "missed_chance", label: "Missed chances", test: (r) => r.category === "missed_chance" },
];

/** Why a play was picked, shown under the name for the two special groups. */
const CATEGORY_NOTE: Partial<Record<PlayIndexRow["category"], string>> = {
  impossible_catch: "Impossible catch",
  missed_chance: "Missed chance",
};

export const playKey = (row: Pick<PlayIndexRow, "game_id" | "play_id">): string => `${row.game_id}_${row.play_id}`;

interface PlayListProps {
  /** Every play, used for the chip counts. */
  all: PlayIndexRow[];
  /** The plays that pass the current filter. */
  visible: PlayIndexRow[];
  filter: PlayFilter;
  onFilterChange: (next: PlayFilter) => void;
  activeKey: string | null;
  onSelect: (row: PlayIndexRow) => void;
}

export default function PlayList({ all, visible, filter, onFilterChange, activeKey, onSelect }: PlayListProps) {
  return (
    <div className="play-list">
      <div className="segmented" role="group" aria-label="Filter plays">
        {PLAY_FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            className="chip"
            aria-pressed={filter === f.id}
            aria-label={`${f.label}, ${all.filter(f.test).length} plays`}
            onClick={() => onFilterChange(f.id)}
          >
            {f.label}
            <span className="num play-list__count" aria-hidden="true">
              {all.filter(f.test).length}
            </span>
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <p className="chart-empty" role="status">
          No plays match this filter.
        </p>
      ) : (
        <ul className="play-list__items" aria-label={`${visible.length} plays`}>
          {visible.map((row) => {
            const key = playKey(row);
            const active = key === activeKey;
            const note = CATEGORY_NOTE[row.category];
            return (
              <li key={key}>
                <button
                  type="button"
                  className="play-row"
                  aria-current={active ? "true" : undefined}
                  aria-label={`${row.name}, ${row.position}, ${row.result_label}, model catch chance ${pct(row.p_catch)}${note ? `, ${note}` : ""}`}
                  onClick={() => onSelect(row)}
                >
                  <span className="play-row__who">
                    <span className="play-row__name">{row.name}</span>
                    <span className="play-row__meta muted">
                      {row.position}
                      {note && ` \u00B7 ${note}`}
                    </span>
                  </span>
                  <ResultBadge result={row.result} />
                  <span className="play-row__pct num" aria-hidden="true">
                    {pct(row.p_catch)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
