/**
 * Feature importance: horizontal bars. Data: feature_importance.json.
 *
 * Each value is the DROP IN TEST AUC when that feature is shuffled. It is an
 * AUC difference, not a percentage, and it can be slightly negative (noise).
 */
import { useMemo } from "react";
import { Bar, BarChart, Cell, LabelList, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useMl } from "../../api";
import ChartPanel from "../../components/ChartPanel";
import StateMessage from "../../components/StateMessage";
import { COLORS, DIVERGING } from "../../config/theme";
import { useIsNarrow } from "../../hooks/useMediaQuery";
import { TooltipCard } from "../../components/charts/chartShared";
import { featureLabel } from "./labels";
import { endValueLabel } from "./chartLabels";

const ROW_HEIGHT = 32;
const MINUS = "\u2212";
const drop = (v: number): string => `${v < 0 ? MINUS : ""}${Math.abs(v).toFixed(3)}`;

export default function FeatureImportanceChart() {
  const { data, loading, error, reload } = useMl("feature_importance");
  const narrow = useIsNarrow();

  const rows = useMemo(
    () => [...(data ?? [])].sort((a, b) => b.importance - a.importance).map((r) => ({ ...r, label: featureLabel(r.feature) })),
    [data],
  );

  const howToRead = (
    <>
      For each measurement, we shuffled its values on the unseen test plays and checked how far the model&apos;s AUC
      fell. A longer bar means the model leans on that measurement more. The numbers are AUC points (1.00 is perfect),
      not percentages. A bar at or below zero means shuffling it did not hurt.
    </>
  );

  // The headline always names the real leader, so it stays true if the data changes.
  const title = rows.length > 0 ? `${rows[0].label} is the #1 predictor of a catch` : "What predicts a catch";

  let body;
  if (!data) {
    body = <StateMessage loading={loading} error={error} onRetry={reload} what="feature importance" />;
  } else if (rows.length === 0) {
    body = <p className="chart-empty">No feature importance values were found.</p>;
  } else {
    const summary = `Horizontal bar chart of how much AUC drops without each feature. ${rows[0].label} is highest at ${drop(rows[0].importance)}.`;
    body = (
      <figure className="chart-figure" role="img" aria-label={summary}>
        <ResponsiveContainer width="100%" height={rows.length * ROW_HEIGHT + 72}>
          <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 56, bottom: 8, left: 0 }} accessibilityLayer={false}>
            <XAxis
              type="number"
              domain={[(min: number) => Math.min(0, min), "auto"]}
              tickFormatter={(v: number) => v.toFixed(2)}
              tick={{ fill: COLORS.muted, fontSize: 14 }}
              stroke={COLORS.border}
              label={{ value: "Drop in AUC (not a percentage)", position: "insideBottom", offset: -4, fill: COLORS.muted, fontSize: 14 }}
              height={52}
            />
            <YAxis
              type="category"
              dataKey="label"
              width={narrow ? 128 : 190}
              interval={0}
              tick={{ fill: COLORS.text, fontSize: 14 }}
              tickLine={false}
              stroke={COLORS.border}
            />
            <ReferenceLine x={0} stroke={COLORS.muted} />
            <Tooltip
              cursor={{ fill: COLORS.panelRaised }}
              content={({ active, payload }) => {
                const row = active ? (payload?.[0]?.payload as (typeof rows)[number] | undefined) : undefined;
                if (!row) return null;
                return (
                  <TooltipCard
                    title={row.label}
                    rows={[
                      { label: "AUC drop", value: drop(row.importance) },
                      { label: "Column", value: row.feature },
                    ]}
                  />
                );
              }}
            />
            <Bar dataKey="importance" radius={[0, 4, 4, 0]} isAnimationActive={false}>
              {rows.map((row) => (
                <Cell key={row.feature} fill={row.importance >= 0 ? DIVERGING.positive : DIVERGING.negative} />
              ))}
              <LabelList dataKey="importance" content={endValueLabel(drop)} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </figure>
    );
  }

  return (
    <ChartPanel
      title={title}
      subtitle="How much accuracy drops without each feature, in AUC points on unseen games."
      howToRead={howToRead}
    >
      {body}
    </ChartPanel>
  );
}
