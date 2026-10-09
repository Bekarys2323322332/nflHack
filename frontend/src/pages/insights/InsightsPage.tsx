/**
 * Insights page.
 *
 *   [ Charts | Heatmap ] toggle (and Customize menu in charts mode)
 *   -> the football field is the main visual in both modes
 *
 * The chosen mode lives in the URL (?view=heatmap) so it can be shared and
 * survives a reload.
 */
import { useSearchParams } from "react-router-dom";
import ChartsView from "../../components/charts/ChartsView";
import CustomizeMenu from "../../components/CustomizeMenu";
import HeatmapView from "../../components/heatmap/HeatmapView";
import { useChartVisibility } from "../../hooks/useChartVisibility";
import "./insights.css";

type ViewMode = "charts" | "heatmap";

const VIEWS: { id: ViewMode; label: string }[] = [
  { id: "charts", label: "Charts" },
  { id: "heatmap", label: "Heatmap" },
];

export default function InsightsPage() {
  const [params, setParams] = useSearchParams();
  const view: ViewMode = params.get("view") === "heatmap" ? "heatmap" : "charts";
  const visibility = useChartVisibility();

  const setView = (next: ViewMode) => {
    // Keep "charts" as the clean default URL.
    setParams(next === "charts" ? {} : { view: next }, { replace: true });
  };

  return (
    <div className="insights">
      <div className="view-bar">
        <div className="segmented view-toggle" role="group" aria-label="Insights view">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              type="button"
              className="btn btn--primary btn--large"
              aria-pressed={view === v.id}
              aria-label={`Show ${v.label.toLowerCase()} view`}
              onClick={() => setView(v.id)}
            >
              {v.label}
            </button>
          ))}
        </div>
        {view === "charts" && <CustomizeMenu visibility={visibility} />}
      </div>

      {view === "heatmap" ? <HeatmapView /> : <ChartsView visibility={visibility} />}
    </div>
  );
}
