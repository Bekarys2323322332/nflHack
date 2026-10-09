/**
 * PositionChips: multi-select chips for positions.
 *
 * Behaviour: every position starts selected. Clicking toggles one. The last
 * selected chip cannot be turned off, so a chart never ends up with no data
 * because of an empty filter.
 */
import { positionColor } from "../config/theme";

interface PositionChipsProps {
  /** All positions that can be chosen, in display order. */
  options: string[];
  /** Currently selected positions. */
  selected: string[];
  onChange: (next: string[]) => void;
  /** Used for the group's aria-label, e.g. "Receiver position". */
  label?: string;
}

export default function PositionChips({ options, selected, onChange, label = "Position" }: PositionChipsProps) {
  const toggle = (position: string) => {
    const isOn = selected.includes(position);
    if (isOn && selected.length === 1) return; // keep at least one
    const next = isOn ? selected.filter((p) => p !== position) : [...selected, position];
    // Keep the original option order so the output is stable.
    onChange(options.filter((p) => next.includes(p)));
  };

  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((position) => {
        const on = selected.includes(position);
        return (
          <button
            key={position}
            type="button"
            className="chip"
            aria-pressed={on}
            aria-label={`${position} position`}
            onClick={() => toggle(position)}
          >
            <span className="chip__dot" style={{ backgroundColor: positionColor(position), color: positionColor(position) }} aria-hidden="true" />
            {position}
          </button>
        );
      })}
    </div>
  );
}
