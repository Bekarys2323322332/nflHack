/**
 * KpiCards: three headline numbers computed from separation_leaderboard.json.
 *
 *   1. Receivers analysed      (row count)
 *   2. League-average separation (average of avg_sep, weighted by targets)
 *   3. Top receiver            (highest avg_sep among receivers with enough targets)
 */
import { useMemo } from "react";
import { useSeparationLeaderboard } from "../api";
import { fmt1, int } from "../lib/format";
import StateMessage from "./StateMessage";

/** Receivers below this many targets are too noisy to be called "top". */
const MIN_TARGETS_FOR_TOP = 20;

export default function KpiCards() {
  const { data, loading, error, reload } = useSeparationLeaderboard();

  const kpis = useMemo(() => {
    if (!data || data.length === 0) return null;

    const totalTargets = data.reduce((sum, r) => sum + r.targets, 0);
    const leagueAvg = totalTargets > 0 ? data.reduce((sum, r) => sum + r.avg_sep * r.targets, 0) / totalTargets : 0;

    const eligible = data.filter((r) => r.targets >= MIN_TARGETS_FOR_TOP);
    const pool = eligible.length > 0 ? eligible : data;
    const top = pool.reduce((best, r) => (r.avg_sep > best.avg_sep ? r : best));

    return { count: data.length, leagueAvg, top };
  }, [data]);

  if (!kpis) {
    return <StateMessage loading={loading} error={error ?? (data ? "The leaderboard file is empty." : null)} onRetry={reload} what="summary numbers" />;
  }

  return (
    <section className="kpis" aria-label="Key numbers">
      <article className="panel kpi">
        <p className="kpi__label muted">Receivers analysed</p>
        <p className="kpi__value num">{int(kpis.count)}</p>
        <p className="kpi__note muted">Wide receivers, tight ends and running backs</p>
      </article>

      <article className="panel kpi">
        <p className="kpi__label muted">League-average separation</p>
        <p className="kpi__value num">
          {fmt1(kpis.leagueAvg)} <span className="kpi__unit">yds</span>
        </p>
        <p className="kpi__note muted">At the moment of the throw, weighted by targets</p>
      </article>

      <article className="panel kpi">
        <p className="kpi__label muted">Top receiver</p>
        <p className="kpi__value num">{kpis.top.name}</p>
        <p className="kpi__note muted">
          {fmt1(kpis.top.avg_sep)} yds on {int(kpis.top.targets)} targets
        </p>
      </article>
    </section>
  );
}
