/**
 * CustomizeMenu: a small disclosure menu with one checkbox per chart in the
 * registry. Closes on Escape or when focus/click leaves the menu.
 */
import { useEffect, useId, useRef, useState } from "react";
import { charts } from "../config/charts";
import type { ChartVisibility } from "../hooks/useChartVisibility";

export default function CustomizeMenu({ visibility }: { visibility: ChartVisibility }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  // Close when clicking or tabbing outside the menu.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onFocusIn = (e: FocusEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("focusin", onFocusIn);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("focusin", onFocusIn);
    };
  }, [open]);

  return (
    <div
      className="customize"
      ref={rootRef}
      onKeyDown={(e) => {
        if (e.key === "Escape" && open) {
          setOpen(false);
          buttonRef.current?.focus(); // return focus to the trigger
        }
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        className="btn"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label="Customize which charts are shown"
        onClick={() => setOpen((o) => !o)}
      >
        Customize
      </button>

      {open && (
        <div id={panelId} className="customize__panel" role="group" aria-label="Show or hide charts">
          <p className="customize__title">Show charts</p>
          {charts.map((chart) => (
            <label key={chart.id} className="customize__option">
              <input
                type="checkbox"
                checked={visibility.isVisible(chart.id)}
                onChange={(e) => visibility.setVisible(chart.id, e.target.checked)}
                aria-label={`Show chart: ${chart.title}`}
              />
              <span>{chart.title}</span>
            </label>
          ))}
          <button type="button" className="btn customize__reset" onClick={visibility.reset} aria-label="Reset charts to the default selection">
            Reset
          </button>
        </div>
      )}
    </div>
  );
}
