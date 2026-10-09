/**
 * Small pieces shared by the chart components in this folder.
 */
import type { ReactNode } from "react";
import type { ReceiverPosition } from "../../api";
import { positionColor } from "../../config/theme";

/** The registry passes every chart these two props. */
export interface ChartComponentProps {
  title: string;
  subtitle: string;
}

/** Positions shown in the receiver charts, in display order. */
export const RECEIVER_POSITIONS: ReceiverPosition[] = ["WR", "TE", "RB"];

/** Colour key for positions: a coloured dot and the position name. */
export function PositionLegend({ positions = RECEIVER_POSITIONS }: { positions?: string[] }) {
  return (
    <ul className="legend" aria-label="Colour key: position">
      {positions.map((position) => (
        <li key={position} className="legend__item">
          <span className="legend__swatch" style={{ backgroundColor: positionColor(position) }} aria-hidden="true" />
          {position}
        </li>
      ))}
    </ul>
  );
}

/** A labelled control wrapper, used for sliders and selects inside chart panels. */
export function Control({ label, value, children }: { label: string; value?: ReactNode; children: ReactNode }) {
  return (
    <div className="field-group control">
      <div className="control__head">
        <span className="field-group__label">{label}</span>
        {value !== undefined && <span className="num control__value">{value}</span>}
      </div>
      {children}
    </div>
  );
}

/** Custom Recharts tooltip shell: consistent panel look for every chart. */
export function TooltipCard({ title, rows }: { title: string; rows: { label: string; value: string }[] }) {
  return (
    <div className="chart-tooltip">
      <p className="chart-tooltip__title">{title}</p>
      {rows.map((row) => (
        <p key={row.label} className="chart-tooltip__row">
          <span className="muted">{row.label}</span>
          <span className="num">{row.value}</span>
        </p>
      ))}
    </div>
  );
}
