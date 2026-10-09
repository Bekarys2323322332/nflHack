/**
 * "Who beats man, who beats zone": scatter of separation against man (x) and
 * zone (y). Data: man_vs_zone.json.
 *
 * - Dashed diagonal (y = x): equal separation against both coverages.
 * - Dashed median lines split the chart into four labelled corners.
 * - Dot size = total targets. Dot colour = position.
 * - Search highlights players; a toggle labels the top 10 or everyone.
 */
import { useMemo, useState } from "react";
import { ReferenceArea, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from "recharts";
import { useManVsZone } from "../../api";
import type { ManVsZoneRow } from "../../api";
import { COLORS, positionColor } from "../../config/theme";
import { useIsNarrow } from "../../hooks/useMediaQuery";
import { fmt1, int, median } from "../../lib/format";
import ChartPanel from "../ChartPanel";
import StateMessage from "../StateMessage";
import PositionChips from "../PositionChips";
import { Control, PositionLegend, RECEIVER_POSITIONS, TooltipCard } from "./chartShared";
import type { ChartComponentProps } from "./chartShared";

const DEFAULT_MIN_TARGETS = 10;
const MIN_RADIUS = 5;
const MAX_RADIUS = 13;
const TOP_LABELS = 10;

/** A plotted receiver with the values the chart derives from the raw row. */
interface Point extends ManVsZoneRow {
  total: number;
  /** sep_man - sep_zone, recomputed so it always matches the axes. */
  gap: number;
  radius: number;
  matches: boolean;
  showLabel: boolean;
}

/** Props that Recharts passes to a custom scatter shape (only the ones we use). */
interface DotProps {
  cx?: number;
  cy?: number;
  payload?: Point;
}

export default function ManVsZoneScatter({ title, subtitle }: ChartComponentProps) {
  const { data, loading, error, reload } = useManVsZone();
  const narrow = useIsNarrow();

  const [minTargets, setMinTargets] = useState(DEFAULT_MIN_TARGETS);
  const [positions, setPositions] = useState<string[]>(RECEIVER_POSITIONS);
  const [query, setQuery] = useState("");
  const [labelAll, setLabelAll] = useState(false);

  const maxTargets = useMemo(
    () => Math.max(DEFAULT_MIN_TARGETS, ...(data ?? []).map((r) => Math.min(r.targets_man, r.targets_zone))),
    [data],
  );

  const search = query.trim().toLowerCase();

  /** Everything the chart needs, derived in one pass. */
  const view = useMemo(() => {
    if (!data) return null;
    const kept = data.filter(
      (r) => r.targets_man >= minTargets && r.targets_zone >= minTargets && positions.includes(r.position),
    );
    if (kept.length === 0) return { points: [] as Point[], medMan: 0, medZone: 0, lo: 0, hi: 1, matchCount: 0 };

    const maxTotal = Math.max(...kept.map((r) => r.targets_man + r.targets_zone));
    // The "top 10" are the receivers with the most combined separation.
    const topIds = new Set(
      [...kept]
        .sort((a, b) => b.sep_man + b.sep_zone - (a.sep_man + a.sep_zone))
        .slice(0, TOP_LABELS)
        .map((r) => r.nfl_id),
    );

    const points: Point[] = kept.map((r) => {
      const total = r.targets_man + r.targets_zone;
      const matches = search !== "" && r.name.toLowerCase().includes(search);
      return {
        ...r,
        total,
        gap: r.sep_man - r.sep_zone,
        radius: MIN_RADIUS + Math.sqrt(total / maxTotal) * (MAX_RADIUS - MIN_RADIUS),
        matches,
        showLabel: matches || labelAll || topIds.has(r.nfl_id),
      };
    });
    // Draw highlighted players last so they sit on top.
    points.sort((a, b) => Number(a.matches) - Number(b.matches));

    // Both axes share one domain so the y = x diagonal is a true 45 degree line.
    const all = points.flatMap((p) => [p.sep_man, p.sep_zone]);
    const lo = Math.floor((Math.min(...all) - 0.1) * 2) / 2;
    const hi = Math.ceil((Math.max(...all) + 0.1) * 2) / 2;

    return {
      points,
      medMan: median(points.map((p) => p.sep_man)),
      medZone: median(points.map((p) => p.sep_zone)),
      lo,
      hi,
      matchCount: points.filter((p) => p.matches).length,
    };
  }, [data, minTargets, positions, labelAll, search]);

  /** Custom dot: a circle sized by targets, with an optional name label. */
  const renderDot = (props: DotProps) => {
    const { cx, cy, payload } = props;
    if (cx === undefined || cy === undefined || !payload || !view) return <g />;

    const dimmed = search !== "" && !payload.matches;
    // Labels flip to the left of the dot near the right edge so they stay inside the chart.
    const nearRight = (payload.sep_man - view.lo) / (view.hi - view.lo) > 0.65;
    return (
      <g opacity={dimmed ? 0.3 : 1}>
        <circle
          cx={cx}
          cy={cy}
          r={payload.radius}
          fill={positionColor(payload.position)}
          fillOpacity={0.85}
          stroke={payload.matches ? "#FFFFFF" : COLORS.bg}
          strokeWidth={payload.matches ? 3 : 1}
        />
        {payload.showLabel && !dimmed && (
          <text
            x={nearRight ? cx - payload.radius - 4 : cx + payload.radius + 4}
            y={cy}
            textAnchor={nearRight ? "end" : "start"}
            dominantBaseline="central"
            fill={COLORS.text}
            fontSize={14}
            stroke={COLORS.bg}
            strokeWidth={3}
            paintOrder="stroke"
          >
            {payload.name}
          </text>
        )}
      </g>
    );
  };

  const howToRead = (
    <>
      Each dot is a receiver. Right means more separation against man coverage, up means more against zone. Dots above
      the dashed diagonal do better against zone; dots below it do better against man. The dashed median lines mark the
      typical receiver, so the corners show who beats both, one, or neither. Bigger dots have more targets.
    </>
  );

  const controls = (
    <>
      <Control label="Minimum targets vs each coverage" value={minTargets}>
        <input
          type="range"
          min={0}
          max={maxTargets}
          step={1}
          value={minTargets}
          aria-label="Minimum targets against each coverage"
          aria-valuetext={`${minTargets} targets`}
          onChange={(e) => setMinTargets(Number(e.target.value))}
        />
      </Control>

      <Control label="Position">
        <PositionChips options={RECEIVER_POSITIONS} selected={positions} onChange={setPositions} label="Receiver position" />
      </Control>

      <Control label="Find a player">
        <input
          type="search"
          className="input"
          placeholder="Search by name"
          value={query}
          aria-label="Search for a player to highlight"
          onChange={(e) => setQuery(e.target.value)}
        />
      </Control>

      <Control label="Labels">
        <div className="segmented" role="group" aria-label="Which dots get name labels">
          <button type="button" className="btn" aria-pressed={!labelAll} aria-label="Label the top 10 players" onClick={() => setLabelAll(false)}>
            Label top 10
          </button>
          <button type="button" className="btn" aria-pressed={labelAll} aria-label="Label all players" onClick={() => setLabelAll(true)}>
            Label all
          </button>
        </div>
      </Control>
    </>
  );

  let body;
  if (!data || !view) {
    body = <StateMessage loading={loading} error={error} onRetry={reload} what="man versus zone data" />;
  } else if (view.points.length === 0) {
    body = (
      <p className="chart-empty" role="status">
        No receivers match these filters. Lower the minimum targets or add a position.
      </p>
    );
  } else {
    const { points, medMan, medZone, lo, hi } = view;
    const corner = { fill: COLORS.muted, fontSize: 14, fontFamily: "var(--font-heading)" };
    const summary = `Scatter chart of ${points.length} receivers: separation against man coverage on the horizontal axis, against zone on the vertical axis. Dot size shows total targets.`;

    body = (
      <>
        {search !== "" && (
          <p className="chart-note" role="status">
            {view.matchCount === 0 ? "No player matches that search." : `${view.matchCount} player${view.matchCount === 1 ? "" : "s"} highlighted.`}
          </p>
        )}
        <figure className="chart-figure" role="img" aria-label={summary}>
          {/* Phones get a fixed tall plot; wider screens keep a near-square one so the diagonal reads as 45 degrees. */}
          <ResponsiveContainer width="100%" {...(narrow ? { height: 420 } : { aspect: 1.05, maxHeight: 560 })}>
            <ScatterChart margin={{ top: 8, right: 16, bottom: 28, left: 8 }} accessibilityLayer={false}>
              {/* Quadrant corner labels. The areas have no fill; they only carry the labels. */}
              <ReferenceArea x1={medMan} x2={hi} y1={medZone} y2={hi} fill="none" stroke="none" ifOverflow="visible"
                label={{ value: "Beats both", position: "insideTopRight", ...corner }} />
              <ReferenceArea x1={lo} x2={medMan} y1={medZone} y2={hi} fill="none" stroke="none" ifOverflow="visible"
                label={{ value: "Zone specialist", position: "insideTopLeft", ...corner }} />
              <ReferenceArea x1={medMan} x2={hi} y1={lo} y2={medZone} fill="none" stroke="none" ifOverflow="visible"
                label={{ value: "Man specialist", position: "insideBottomRight", ...corner }} />
              <ReferenceArea x1={lo} x2={medMan} y1={lo} y2={medZone} fill="none" stroke="none" ifOverflow="visible"
                label={{ value: "Struggles vs both", position: "insideBottomLeft", ...corner }} />

              <XAxis
                type="number"
                dataKey="sep_man"
                name="Separation vs man"
                domain={[lo, hi]}
                tickFormatter={fmt1}
                tick={{ fill: COLORS.muted, fontSize: 14 }}
                stroke={COLORS.border}
                label={{ value: "Separation vs man (yds)", position: "insideBottom", offset: -16, fill: COLORS.muted, fontSize: 14 }}
              />
              <YAxis
                type="number"
                dataKey="sep_zone"
                name="Separation vs zone"
                domain={[lo, hi]}
                tickFormatter={fmt1}
                tick={{ fill: COLORS.muted, fontSize: 14 }}
                stroke={COLORS.border}
                width={52}
                label={{ value: "Separation vs zone (yds)", angle: -90, position: "insideLeft", offset: 12, fill: COLORS.muted, fontSize: 14, style: { textAnchor: "middle" } }}
              />

              {/* y = x: equal separation against both coverages */}
              <ReferenceLine segment={[{ x: lo, y: lo }, { x: hi, y: hi }]} stroke={COLORS.muted} strokeDasharray="10 5" ifOverflow="visible" />
              {/* Medians of the receivers currently shown (shorter dashes, brighter colour) */}
              <ReferenceLine x={medMan} stroke={COLORS.text} strokeOpacity={0.7} strokeDasharray="4 4" />
              <ReferenceLine y={medZone} stroke={COLORS.text} strokeOpacity={0.7} strokeDasharray="4 4" />

              <Tooltip
                cursor={{ stroke: COLORS.muted, strokeDasharray: "3 3" }}
                content={({ active, payload }) => {
                  const p = active ? (payload?.[0]?.payload as Point | undefined) : undefined;
                  if (!p) return null;
                  const better = p.gap === 0 ? "equal" : p.gap > 0 ? "better vs man" : "better vs zone";
                  return (
                    <TooltipCard
                      title={`${p.name} (${p.position})`}
                      rows={[
                        { label: "Vs man", value: `${fmt1(p.sep_man)} yds (${int(p.targets_man)} targets)` },
                        { label: "Vs zone", value: `${fmt1(p.sep_zone)} yds (${int(p.targets_zone)} targets)` },
                        { label: "Difference", value: `${p.gap > 0 ? "+" : ""}${p.gap.toFixed(2)} yds, ${better}` },
                        { label: "Total targets", value: int(p.total) },
                      ]}
                    />
                  );
                }}
              />

              <Scatter data={points} shape={renderDot as never} isAnimationActive={false} />
            </ScatterChart>
          </ResponsiveContainer>
        </figure>
        <div className="chart-footer">
          <PositionLegend />
          <p className="chart-note muted">Long dashes (diagonal): equal separation. Short dashes: median. Dot size: total targets.</p>
        </div>
      </>
    );
  }

  return (
    <ChartPanel title={title} subtitle={subtitle} howToRead={howToRead} controls={controls}>
      {body}
    </ChartPanel>
  );
}
