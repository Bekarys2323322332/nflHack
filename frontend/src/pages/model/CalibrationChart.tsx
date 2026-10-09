/**
 * Calibration chart: predicted catch probability (x) vs how often passes were
 * actually caught (y), in bins of unseen test plays. Data: calibration.json.
 * A dashed diagonal marks perfect calibration. Dot size = plays in the bin.
 */
import { useMemo } from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useMl } from "../../api";
import type { CalibrationBin } from "../../api";
import ChartPanel from "../../components/ChartPanel";
import StateMessage from "../../components/StateMessage";
import { TooltipCard } from "../../components/charts/chartShared";
import { COLORS, DIVERGING } from "../../config/theme";
import { useIsNarrow } from "../../hooks/useMediaQuery";
import { int, pct } from "../../lib/format";

const TICKS = [0, 0.2, 0.4, 0.6, 0.8, 1];
const MIN_RADIUS = 4;
const MAX_RADIUS = 11;

export default function CalibrationChart() {
  const { data, loading, error, reload } = useMl("calibration");
  const narrow = useIsNarrow();

  // Bins with no plays carry no information, so they are not drawn.
  const bins = useMemo(() => (data ?? []).filter((b) => b.plays > 0).sort((a, b) => a.mean_pred - b.mean_pred), [data]);
  const maxPlays = Math.max(1, ...bins.map((b) => b.plays));
  const totalPlays = bins.reduce((sum, b) => sum + b.plays, 0);

  // Headline uses the busiest bin: the most trustworthy single example.
  const busiest = bins.reduce<CalibrationBin | null>((best, b) => (best === null || b.plays > best.plays ? b : best), null);
  const title = busiest
    ? `When the model says ${pct(busiest.mean_pred)}, ${pct(busiest.actual)} of passes are caught`
    : "Can you trust the model's percentages?";

  const howToRead = (
    <>
      We grouped unseen passes by the catch chance the model gave them, then checked how many were really caught. Dots
      on the dashed diagonal mean the percentages can be taken at face value. Dots below it mean the model was a little
      too optimistic. Larger dots hold more plays, so trust them more.
    </>
  );

  let body;
  if (!data) {
    body = <StateMessage loading={loading} error={error} onRetry={reload} what="calibration" />;
  } else if (bins.length === 0) {
    body = <p className="chart-empty">No calibration bins were found.</p>;
  } else {
    const summary = `Calibration chart with ${bins.length} points. Predicted catch probability on the horizontal axis, actual catch rate on the vertical axis. Points close to the diagonal mean a well calibrated model.`;
    body = (
      <>
        <figure className="chart-figure" role="img" aria-label={summary}>
          <ResponsiveContainer width="100%" {...(narrow ? { height: 340 } : { aspect: 1.05, maxHeight: 460 })}>
            <LineChart data={bins} margin={{ top: 8, right: 16, bottom: 28, left: 8 }} accessibilityLayer={false}>
              <CartesianGrid stroke={COLORS.border} />
              <XAxis
                type="number"
                dataKey="mean_pred"
                domain={[0, 1]}
                ticks={TICKS}
                interval={0}
                tickFormatter={pct}
                tick={{ fill: COLORS.muted, fontSize: 14 }}
                stroke={COLORS.border}
                label={{ value: "Model's predicted catch chance", position: "insideBottom", offset: -16, fill: COLORS.muted, fontSize: 14 }}
              />
              <YAxis
                type="number"
                domain={[0, 1]}
                ticks={TICKS}
                interval={0}
                tickFormatter={pct}
                tick={{ fill: COLORS.muted, fontSize: 14 }}
                stroke={COLORS.border}
                width={56}
                label={{ value: "Actually caught", angle: -90, position: "insideLeft", offset: 4, fill: COLORS.muted, fontSize: 14, style: { textAnchor: "middle" } }}
              />
              {/* Perfect calibration */}
              <ReferenceLine segment={[{ x: 0, y: 0 }, { x: 1, y: 1 }]} stroke={COLORS.muted} strokeDasharray="8 5" />
              <Tooltip
                cursor={{ stroke: COLORS.muted, strokeDasharray: "3 3" }}
                content={({ active, payload }) => {
                  const bin = active ? (payload?.[0]?.payload as CalibrationBin | undefined) : undefined;
                  if (!bin) return null;
                  return (
                    <TooltipCard
                      title={`Bin ${bin.bin}`}
                      rows={[
                        { label: "Predicted", value: pct(bin.mean_pred) },
                        { label: "Actually caught", value: pct(bin.actual) },
                        { label: "Plays", value: int(bin.plays) },
                      ]}
                    />
                  );
                }}
              />
              <Line
                type="linear"
                dataKey="actual"
                stroke={DIVERGING.positive}
                strokeWidth={2}
                isAnimationActive={false}
                dot={(props: { cx?: number; cy?: number; payload?: CalibrationBin }) => {
                  const { cx, cy, payload } = props;
                  if (cx === undefined || cy === undefined || !payload) return <g key="empty" />;
                  const r = MIN_RADIUS + Math.sqrt(payload.plays / maxPlays) * (MAX_RADIUS - MIN_RADIUS);
                  return (
                    <circle key={`bin-${payload.bin}`} cx={cx} cy={cy} r={r} fill={DIVERGING.positive} stroke={COLORS.bg} strokeWidth={1.5} />
                  );
                }}
              />
            </LineChart>
          </ResponsiveContainer>
        </figure>
        <p className="chart-note muted">
          Dashed line: perfect calibration. Dot size: plays in the bin ({int(totalPlays)} unseen plays in total).
        </p>
      </>
    );
  }

  return (
    <ChartPanel
      title={title}
      subtitle="Predicted catch chance against what actually happened, on unseen games."
      howToRead={howToRead}
    >
      {body}
    </ChartPanel>
  );
}
