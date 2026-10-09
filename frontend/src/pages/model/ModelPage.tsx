/**
 * ML Predictions page.
 *
 *   1. Scorecard         how good is the model on unseen games
 *   2. Play simulator    the main feature: watch a play, see the model's call
 *   3. Three charts      feature importance, calibration, catches over expected
 *
 * Every panel uses the shared ChartPanel frame and loads its own file through
 * the loaders in src/api.ts (data: public/data/ml/, copied by `npm run sync-data`).
 */
import CalibrationChart from "./CalibrationChart";
import CoeChart from "./CoeChart";
import FeatureImportanceChart from "./FeatureImportanceChart";
import Scorecard from "./Scorecard";
import PlaySimulator from "./simulator/PlaySimulator";
import "./model.css";

export default function ModelPage() {
  return (
    <div className="model-page">
      <Scorecard />
      <PlaySimulator />
      <div className="model-charts">
        <FeatureImportanceChart />
        <CalibrationChart />
        <CoeChart />
      </div>
    </div>
  );
}
