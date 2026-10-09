/**
 * Catches over expected (COE): a diverging bar chart of the top 10 and bottom
 * 10 receivers. Data: coe_leaderboard.json.
 *
 *   COE = actual catches - the sum of the model's catch probabilities
 *
 * Positive (blue): caught more than the model expected. Negative (vermillion):
 * caught fewer. Receivers need a minimum number of targets (default 20).
 */
import { useMemo, useState } from "react";
import { Bar, BarChart, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { LabelList } from "recharts";
import { useMl } from "../../api";
import type { CoeRow } from "../../api";
import ChartPanel from "../../components/ChartPanel";
import StateMessage from "../../components/StateMessage";
import { Control, TooltipCard } from "../../components/charts/chartShared";
import { COLORS, DIVERGING } from "../../config/theme";
import { useIsNarrow } from "../../hooks/useMediaQuery";
import { int, shortName } from "../../lib/format";
import { endValueLabel } from "./chartLabels";

const DEFAULT_MIN_TARGETS = 20;
const EDGE_COUNT = 10;
const ROW_HEIGHT = 30;
const MINUS = "\u2212";
const signed = (v: number): string => `${v < 0 ? MINUS : "+"}${Math.abs(v).toFixed(1)}`;

export default function CoeChart() {
  const { data, loading, error, reload } = useMl("coe_leaderboard");
  const narrow = useIsNarrow();
  const [minTargets, setMinTargets] = useState(DEFAULT_MIN_TARGETS);

  const maxTargets = useMemo(() => Math.max(DEFAULT_MIN_TARGETS, ...(data ?? []).map((r) => r.targets)), [data]);

  /** Best 10 on top, worst 10 at the bottom. With 20 or fewer receivers, show them all once. */
  const rows = useMemo<CoeRow[]>(() => {
    const eligible = (data ?? []).filter((r) => r.targets >= minTargets).sort((a, b) => b.coe - a.coe);
    if (eligible.length <= EDGE_COUNT * 2) return eligible;
    return [...eligible.slice(0, EDGE_COUNT), ...eligible.slice(-EDGE_COUNT)];
  }, [data, minTargets]);

  const top = rows[0];
  const title = top && top.coe > 0 ? `${top.name} caught ${top.coe.toFixed(1)} more passes than the model expected` : "Who catches more than expected?";

  // Symmetric domain so zero sits in the middle and both sides use the same scale.
  const extent = Math.max(1, ...rows.map((r) => Math.abs(r.coe)));
  const bound = Math.ceil(extent / 2) * 2;

  const howToRead = (
    <>
      Expected catches add up the model&apos;s catch chance on every pass thrown to a receiver. Catches over expected
      is real catches minus that total. Blue bars caught more than the situation predicted (separation, depth,
      pressure), orange-red bars caught fewer. It shows the best 10 and worst 10 receivers with enough targets.
    </>
  );

  const controls = (
    <Control label="Minimum targets" value={minTargets}>
      <input
        type="range"
        min={0}
        max={maxTargets}
        step={1}
        value={minTargets}
        aria-label="Minimum targets"
        aria-valuetext={`${minTargets} targets`}
        onChange={(e) => setMinTargets(Number(e.target.value))}
      />
    </Control>
  );

  let body;
  if (!data) {
    body = <StateMessage loading={loading} error={error} onRetry={reload} what="catches over expected" />;
  } else if (rows.length === 0) {
    body = (
      <p className="chart-empty" role="status">
        No receivers have {minTargets} or more targets. Lower the minimum.
      </p>
    );
  } else {
    const worst = rows[rows.length - 1];
    const summary = `Diverging bar chart of catches over expected for ${rows.length} receivers. ${top.name} is highest at ${signed(top.coe)}; ${worst.name} is lowest at ${signed(worst.coe)}.`;
    body = (
      <>
        <figure className="chart-figure" role="img" aria-label={summary}>
          <ResponsiveContainer width="100%" height={rows.length * ROW_HEIGHT + 72}>
            <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 48, bottom: 8, left: 0 }} accessibilityLayer={false}>
              <XAxis
                type="number"
                domain={[-bound, bound]}
                tickFormatter={(v: number) => (v > 0 ? `+${v}` : v < 0 ? `${MINUS}${Math.abs(v)}` : "0")}
                tick={{ fill: COLORS.muted, fontSize: 14 }}
                stroke={COLORS.border}
                label={{ value: "Catches over expected", position: "insideBottom", offset: -4, fill: COLORS.muted, fontSize: 14 }}
                height={52}
              />
              <YAxis
                type="category"
                dataKey="name"
                width={narrow ? 124 : 160}
                interval={0}
                tickFormatter={narrow ? shortName : undefined}
                tick={{ fill: COLORS.text, fontSize: 14 }}
                tickLine={false}
                stroke={COLORS.border}
              />
              <ReferenceLine x={0} stroke={COLORS.muted} />
              <Tooltip
                cursor={{ fill: COLORS.panelRaised }}
                content={({ active, payload }) => {
                  const row = active ? (payload?.[0]?.payload as CoeRow | undefined) : undefined;
                  if (!row) return null;
                  return (
                    <TooltipCard
                      title={row.name}
                      rows={[
                        { label: "Position", value: row.position },
                        { label: "Targets", value: int(row.targets) },
                        { label: "Catches", value: int(row.catches) },
                        { label: "Expected", value: row.expected.toFixed(1) },
                        { label: "Over expected", value: signed(row.coe) },
                        { label: "Per target", value: `${row.coe_per_target >= 0 ? "+" : MINUS}${Math.abs(row.coe_per_target).toFixed(2)}` },
                      ]}
                    />
                  );
                }}
              />
              <Bar dataKey="coe" isAnimationActive={false}>
                {rows.map((row) => (
                  <Cell key={row.nfl_id} fill={row.coe >= 0 ? DIVERGING.positive : DIVERGING.negative} />
                ))}
                <LabelList dataKey="coe" content={endValueLabel(signed)} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </figure>
        <ul className="legend" aria-label="Colour key">
          <li className="legend__item">
            <span className="legend__swatch" style={{ backgroundColor: DIVERGING.positive }} aria-hidden="true" />
            Caught more than expected
          </li>
          <li className="legend__item">
            <span className="legend__swatch" style={{ backgroundColor: DIVERGING.negative }} aria-hidden="true" />
            Caught fewer
          </li>
        </ul>
      </>
    );
  }

  return (
    <ChartPanel
      title={title}
      subtitle={`Real catches minus the model's expected catches. Top 10 and bottom 10 with ${minTargets}+ targets.`}
      howToRead={howToRead}
      controls={controls}
    >
      {body}
    </ChartPanel>
  );
}
