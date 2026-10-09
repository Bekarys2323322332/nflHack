/**
 * Scorecard: how good is the model on games it has never seen?
 *
 * KPI cards (test AUC vs the 0.50 baseline, test accuracy, train/test play
 * counts), the train/test split sentence, and the cross-validation table with
 * the selected model highlighted. Data: model_metrics.json.
 */
import { useMl } from "../../api";
import type { ModelMetrics } from "../../api";
import ChartPanel from "../../components/ChartPanel";
import StateMessage from "../../components/StateMessage";
import { int } from "../../lib/format";
import { modelLabel, weekRange } from "./labels";

const FALLBACK_TITLE = "How well does the model call a catch?";

function splitSentence(m: ModelMetrics): string {
  return `Trained on weeks ${weekRange(m.train_weeks)}, tested on unseen weeks ${weekRange(m.test_weeks)}.`;
}

export default function Scorecard() {
  const { data, loading, error, reload } = useMl("model_metrics");

  const howToRead = (
    <>
      AUC measures how well the model ranks catches above misses: 0.50 is a coin flip, 1.00 is perfect. Accuracy is the
      share of unseen passes where the model leaned the right way (above 50% means a catch). The table compares the
      candidate models on the training weeks only; the best one was then scored once on the unseen weeks. AUC: higher
      is better. Log loss and Brier score: lower is better.
    </>
  );

  if (!data) {
    return (
      <ChartPanel title={FALLBACK_TITLE} subtitle="Test scores on games the model never saw." howToRead={howToRead}>
        <StateMessage loading={loading} error={error} onRetry={reload} what="model scores" />
      </ChartPanel>
    );
  }

  const { test, baseline_test: baseline } = data;
  // Only claim a win if the numbers say so.
  const title = test.auc > baseline.auc ? "The model beats guessing on games it has never seen" : "The model does not beat guessing yet";

  return (
    <ChartPanel title={title} subtitle={splitSentence(data)} howToRead={howToRead}>
      <div className="kpis">
        <article className="panel kpi">
          <p className="kpi__label muted">Test AUC</p>
          <p className="kpi__value num">{test.auc.toFixed(3)}</p>
          {/* Flat meter: fill = model AUC, tick = baseline AUC */}
          <div
            className="meter"
            role="img"
            aria-label={`Model AUC ${test.auc.toFixed(3)} compared with baseline ${baseline.auc.toFixed(2)}`}
          >
            <div className="meter__fill" style={{ width: `${test.auc * 100}%` }} />
            <div className="meter__mark" style={{ left: `${baseline.auc * 100}%` }} />
          </div>
          <p className="kpi__note muted">vs {baseline.auc.toFixed(2)} baseline (always guessing the average)</p>
        </article>

        <article className="panel kpi">
          <p className="kpi__label muted">Test accuracy</p>
          <p className="kpi__value num">{(test.accuracy * 100).toFixed(1)}%</p>
          <p className="kpi__note muted">Passes called the right way on unseen weeks</p>
        </article>

        <article className="panel kpi">
          <p className="kpi__label muted">Plays: train / test</p>
          <p className="kpi__value num">
            {int(data.n_train)} / {int(data.n_test)}
          </p>
          <p className="kpi__note muted">
            From {int(data.n_train_games)} training games and {int(data.n_test_games)} test games
          </p>
        </article>
      </div>

      <table className="score-table">
        <caption className="score-table__caption">Cross-validation score per model (training weeks only)</caption>
        <thead>
          <tr>
            <th scope="col">Model</th>
            <th scope="col" className="num">
              AUC
            </th>
            <th scope="col" className="num">
              Log loss
            </th>
            <th scope="col" className="num">
              Brier
            </th>
          </tr>
        </thead>
        <tbody>
          {data.models.map((m) => {
            const best = m.name === data.best_model;
            return (
              <tr key={m.name} className={best ? "is-best" : undefined}>
                <th scope="row">
                  {modelLabel(m.name)}
                  {best && <span className="score-table__tag">Selected</span>}
                </th>
                <td className="num">{m.cv_auc.toFixed(3)}</td>
                <td className="num">{m.cv_log_loss.toFixed(3)}</td>
                <td className="num">{m.cv_brier.toFixed(3)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="chart-note muted">AUC: higher is better. Log loss and Brier: lower is better.</p>
    </ChartPanel>
  );
}
