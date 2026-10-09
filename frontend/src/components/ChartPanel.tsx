/**
 * ChartPanel: the shared frame for every chart in the registry.
 *
 * It provides the Oswald headline, the one-line subtitle, the "How to read
 * this" icon, a controls area and the chart body, so every chart looks the
 * same and a new chart only has to supply its content.
 */
import { useId } from "react";
import type { ReactNode } from "react";
import InfoTip from "./InfoTip";

interface ChartPanelProps {
  /** Headline: states the insight as a sentence. */
  title: string;
  /** One-line subtitle under the headline. */
  subtitle: string;
  /** Content of the "How to read this" popover. */
  howToRead: ReactNode;
  /** The chart's own controls (sliders, chips, ...). */
  controls?: ReactNode;
  /** The chart and any legend. */
  children: ReactNode;
}

export default function ChartPanel({ title, subtitle, howToRead, controls, children }: ChartPanelProps) {
  const headingId = useId();

  return (
    <section className="panel chart-panel" aria-labelledby={headingId}>
      <header className="chart-panel__head">
        <div className="chart-panel__titles">
          <h2 id={headingId} className="chart-panel__title">
            {title}
          </h2>
          <p className="chart-panel__subtitle muted">{subtitle}</p>
        </div>
        <InfoTip>{howToRead}</InfoTip>
      </header>

      {controls && <div className="chart-panel__controls">{controls}</div>}

      <div className="chart-panel__body">{children}</div>
    </section>
  );
}
