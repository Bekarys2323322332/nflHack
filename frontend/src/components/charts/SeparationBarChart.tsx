/**
 * "These receivers create the most space": horizontal bar chart of the top N
 * receivers. Data: separation_leaderboard.json.
 *
 * Controls: N (10/15/25), minimum targets, position chips, sort metric.
 * Bars are coloured by position.
 */
import { useMemo, useState } from "react";
import { Bar, BarChart, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useSeparationLeaderboard } from "../../api";
import type { SeparationRow } from "../../api";
import { COLORS, positionColor } from "../../config/theme";
import { useIsNarrow } from "../../hooks/useMediaQuery";
import { fmt1, int, pct } from "../../lib/format";
import ChartPanel from "../ChartPanel";
import StateMessage from "../StateMessage";
import PositionChips from "../PositionChips";
import { Control, PositionLegend, RECEIVER_POSITIONS, TooltipCard } from "./chartShared";
import type { ChartComponentProps } from "./chartShared";

type SortKey = "avg_sep" | "catch_rate" | "targets";

/** How each sort option is labelled, formatted and scaled. */
const METRICS: Record<SortKey, { label: string; axis: string; format: (v: number) => string; domain: [number, number | "auto"] }> = {
  avg_sep: { label: "Avg separation", axis: "Avg separation (yds)", format: fmt1, domain: [0, "auto"] },
  catch_rate: { label: "Catch rate", axis: "Catch rate", format: pct, domain: [0, 1] },
  targets: { label: "Targets", axis: "Targets", format: int, domain: [0, "auto"] },
};

const N_OPTIONS = [10, 15, 25];
const DEFAULT_MIN_TARGETS = 20;
const ROW_HEIGHT = 34;

export default function SeparationBarChart({ title, subtitle }: ChartComponentProps) {
  const { data, loading, error, reload } = useSeparationLeaderboard();
  // Narrow screens get a slimmer name column so the bars keep some width.
  const narrow = useIsNarrow();

  const [topN, setTopN] = useState(10);
  const [minTargets, setMinTargets] = useState(DEFAULT_MIN_TARGETS);
  const [positions, setPositions] = useState<string[]>(RECEIVER_POSITIONS);
  const [sortBy, setSortBy] = useState<SortKey>("avg_sep");

  /** The slider tops out at the largest target count in the data. */
  const maxTargets = useMemo(() => Math.max(DEFAULT_MIN_TARGETS, ...(data ?? []).map((r) => r.targets)), [data]);

  /** Filter, sort descending by the chosen metric, keep the first N. */
  const rows = useMemo<SeparationRow[]>(() => {
    if (!data) return [];
    return data
      .filter((r) => r.targets >= minTargets && positions.includes(r.position))
      .sort((a, b) => b[sortBy] - a[sortBy])
      .slice(0, topN);
  }, [data, minTargets, positions, sortBy, topN]);

  const metric = METRICS[sortBy];

  const howToRead = (
    <>
      Each bar is one receiver. A longer bar means more of the chosen measure. Separation is the distance in yards to
      the nearest defender at the moment the pass arrives. Raise the minimum targets to hide small samples.
    </>
  );

  const controls = (
    <>
      <Control label="Show top">
        <div className="segmented" role="group" aria-label="Number of receivers to show">
          {N_OPTIONS.map((n) => (
            <button
              key={n}
              type="button"
              className="btn"
              aria-pressed={topN === n}
              aria-label={`Show top ${n} receivers`}
              onClick={() => setTopN(n)}
            >
              {n}
            </button>
          ))}
        </div>
      </Control>

      <Control label="Sort by">
        <div className="segmented" role="group" aria-label="Sort receivers by">
          {(Object.keys(METRICS) as SortKey[]).map((key) => (
            <button
              key={key}
              type="button"
              className="btn"
              aria-pressed={sortBy === key}
              aria-label={`Sort by ${METRICS[key].label.toLowerCase()}`}
              onClick={() => setSortBy(key)}
            >
              {METRICS[key].label}
            </button>
          ))}
        </div>
      </Control>

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

      <Control label="Position">
        <PositionChips options={RECEIVER_POSITIONS} selected={positions} onChange={setPositions} label="Receiver position" />
      </Control>
    </>
  );

  let body;
  if (!data) {
    body = <StateMessage loading={loading} error={error} onRetry={reload} what="receiver separation" />;
  } else if (rows.length === 0) {
    body = (
      <p className="chart-empty" role="status">
        No receivers match these filters. Lower the minimum targets or add a position.
      </p>
    );
  } else {
    const summary = `Horizontal bar chart of the top ${rows.length} receivers by ${metric.label.toLowerCase()}. ${rows[0].name} leads with ${metric.format(rows[0][sortBy])}.`;
    body = (
      <>
        <figure className="chart-figure" role="img" aria-label={summary}>
          <ResponsiveContainer width="100%" height={rows.length * ROW_HEIGHT + 64}>
            <BarChart
              data={rows}
              layout="vertical"
              margin={{ top: 4, right: 44, bottom: 8, left: 0 }}
              accessibilityLayer={false}
            >
              <XAxis
                type="number"
                dataKey={sortBy}
                domain={metric.domain}
                tickFormatter={metric.format}
                tick={{ fill: COLORS.muted, fontSize: 14 }}
                stroke={COLORS.border}
                label={{ value: metric.axis, position: "insideBottom", offset: -4, fill: COLORS.muted, fontSize: 14 }}
                height={48}
              />
              <YAxis
                type="category"
                dataKey="name"
                width={narrow ? 116 : 150}
                interval={0}
                tick={{ fill: COLORS.text, fontSize: 14 }}
                tickLine={false}
                stroke={COLORS.border}
              />
              <Tooltip
                cursor={{ fill: COLORS.panelRaised }}
                content={({ active, payload }) => {
                  const row = active ? (payload?.[0]?.payload as SeparationRow | undefined) : undefined;
                  if (!row) return null;
                  return (
                    <TooltipCard
                      title={row.name}
                      rows={[
                        { label: "Position", value: row.position },
                        { label: "Targets", value: int(row.targets) },
                        { label: "Avg separation", value: `${fmt1(row.avg_sep)} yds` },
                        { label: "Catch rate", value: pct(row.catch_rate) },
                        { label: "Release speed", value: `${row.avg_release_speed.toFixed(1)} yds/s` },
                      ]}
                    />
                  );
                }}
              />
              <Bar dataKey={sortBy} radius={[0, 4, 4, 0]} isAnimationActive={false}>
                {rows.map((row) => (
                  <Cell key={row.nfl_id} fill={positionColor(row.position)} />
                ))}
                <LabelList
                  dataKey={sortBy}
                  position="right"
                  formatter={(v: unknown) => metric.format(Number(v))}
                  fill={COLORS.text}
                  fontSize={14}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </figure>
        <PositionLegend />
      </>
    );
  }

  return (
    <ChartPanel title={title} subtitle={subtitle} howToRead={howToRead} controls={controls}>
      {body}
    </ChartPanel>
  );
}
