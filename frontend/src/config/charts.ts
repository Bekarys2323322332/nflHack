/**
 * Chart registry. The charts grid and the "Customize" menu are both generated
 * from this array, so adding a chart means adding ONE entry here:
 *
 *   1. Create src/components/charts/MyChart.tsx. It receives { title, subtitle }
 *      and should render <ChartPanel> (see SeparationBarChart for a template).
 *   2. Import it below and add an entry:
 *        { id: "my-chart", title: "...", subtitle: "...", component: MyChart, defaultVisible: true }
 *
 * `title` is the Oswald headline (state the insight as a sentence) and
 * `subtitle` is the one-line description under it.
 */
import type { ComponentType } from "react";
import type { ChartComponentProps } from "../components/charts/chartShared";
import ManVsZoneScatter from "../components/charts/ManVsZoneScatter";
import SeparationBarChart from "../components/charts/SeparationBarChart";

export interface ChartConfig {
  /** Unique, stable id. Also the key for saved visibility settings. */
  id: string;
  title: string;
  subtitle: string;
  component: ComponentType<ChartComponentProps>;
  /** Whether the chart is shown before the user customizes anything. */
  defaultVisible: boolean;
}

export const charts: ChartConfig[] = [
  {
    id: "separation-leaders",
    title: "These receivers create the most space",
    subtitle: "Average yards from the nearest defender when the pass arrives.",
    component: SeparationBarChart,
    defaultVisible: true,
  },
  {
    id: "man-vs-zone",
    title: "Who beats man, who beats zone",
    subtitle: "Each dot is a receiver: separation against man (x) and zone (y).",
    component: ManVsZoneScatter,
    defaultVisible: true,
  },
];
