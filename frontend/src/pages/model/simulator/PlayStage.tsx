/**
 * PlayStage: the animated field for one play, with its controls.
 *
 * Everything on screen is derived from the clock `t` (see timeline.ts):
 *   tracking frames at 10 fps -> hold 0.5 s -> probability card
 *   -> illustrated ball flight (0.8 s) -> result badge -> verdict.
 *
 * Layout, top to bottom:
 *   "broadcast bar" (card, badge, verdict; reserved space so nothing jumps)
 *   field -> controls -> caption -> legend -> description / down & distance / coverage
 */
import { useMemo } from "react";
import type { PlayDetail, PlayFrame, PlayIndexRow } from "../../../api";
import Field from "../../../components/Field";
import { COLORS, SIM_COLORS } from "../../../config/theme";
import { pct } from "../../../lib/format";
import { FIELD_WIDTH } from "../../../lib/heatmap";
import { downAndDistance } from "../labels";
import ResultBadge from "./ResultBadge";
import { useIsNarrow } from "../../../hooks/useMediaQuery";
import {
  DESKTOP_MIN_VIEW_YARDS,
  MARKER_RADIUS,
  PHONE_MIN_VIEW_YARDS,
  arcPath,
  ballAt,
  bestOption,
  describeState,
  buildTimeline,
  modelWasRight,
  playGeometry,
  stateAt,
} from "./timeline";
import { usePlayback } from "./usePlayback";

interface PlayStageProps {
  play: PlayDetail;
  /** Index row for the same play: supplies down, distance and coverage. */
  meta: PlayIndexRow | undefined;
  reducedMotion: boolean;
}

export default function PlayStage({ play, meta, reducedMotion }: PlayStageProps) {
  const timeline = useMemo(() => buildTimeline(play.frames.length), [play]);
  const narrow = useIsNarrow();
  const geometry = useMemo(
    () => playGeometry(play, narrow ? PHONE_MIN_VIEW_YARDS : DESKTOP_MIN_VIEW_YARDS),
    [play, narrow],
  );
  // With reduced motion nothing starts by itself: the user presses Play.
  const { t, playing, toggle, restart, seek } = usePlayback(timeline.totalMs, !reducedMotion);

  const state = stateAt(timeline, t, reducedMotion);
  const frame = play.frames[state.frameIndex];
  const lastFrame = play.frames[play.frames.length - 1];

  const best = bestOption(play.options);
  const right = modelWasRight(play.p_catch, play.result);
  const stateText = describeState(state, timeline.frameCount);
  const [x0, x1] = geometry.xRange;
  const viewWidth = x1 - x0;

  // Defense first, then offense, with the target last so its ring is on top.
  const players = useMemo(() => orderPlayers(frame), [frame]);

  const flight = state.flightProgress === null ? null : ballAt(geometry, state.flightProgress);
  const flying = state.phase === "flight";
  // After the throw the ball is shown in flight, or landed at the target.
  const ball = flight ?? { x: frame.ball.x, y: frame.ball.y, shadowX: 0, shadowY: 0, scale: 1 };

  const playLabel = playing ? "Pause" : t >= timeline.totalMs ? "Replay" : "Play";

  return (
    <div className="sim-stage">
      {/* ----- Broadcast bar: sequential reveal. aria-live so screen readers hear each step. ----- */}
      <div className="throw-bar" role="status" aria-live="polite">
        <div className="throw-bar__slot">
          {state.showCard ? (
            <div className="throw-card">
              <span className="throw-card__label">Model:</span>
              <span className="throw-card__value num">{pct(play.p_catch)}</span>
              <span className="throw-card__label">catch probability</span>
            </div>
          ) : (
            <p className="throw-bar__hint muted">The model&apos;s catch probability appears at the throw.</p>
          )}
        </div>
        <div className="throw-bar__slot">
          {state.showBadge && <ResultBadge result={play.result} size="full" />}
        </div>
        <div className="throw-bar__slot">
          {state.showVerdict && (
            <p className={`verdict ${right ? "verdict--right" : "verdict--surprised"}`}>
              <strong>{right ? "Model was right" : "Model was surprised"}</strong>
              <span className="muted">
                {` It gave ${pct(play.p_catch)} and the pass was ${play.result === "C" ? "caught" : play.result === "I" ? "incomplete" : "intercepted"}.`}
              </span>
            </p>
          )}
        </div>
      </div>

      {/* ----- Field ----- */}
      {/* max-width keeps the zoomed field from becoming taller than the screen. */}
      <div className="sim-field" style={{ maxWidth: `calc(72svh * ${viewWidth / FIELD_WIDTH})` }}>
        <Field
          xRange={geometry.xRange}
          losX={play.line_of_scrimmage_x}
          endZoneText={["BIG DATA BOWL", "LONDON"]}
          ariaLabel={`Overhead view of the play to ${play.receiver.name}. ${stateText}.`}
        >
          <g aria-hidden="true" pointerEvents="none">
            {/* Illustrated arc trail and ground shadow */}
            {flight && (
              <>
                <path d={arcPath(geometry)} fill="none" stroke="#FFFFFF" strokeWidth="0.25" strokeDasharray="0.8 0.6" opacity="0.8" />
                {flying && <ellipse cx={flight.shadowX} cy={flight.shadowY} rx="0.55" ry="0.3" fill="#000000" opacity="0.4" />}
              </>
            )}

            {players.map((p) => (
              <g key={p.nfl_id}>
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={MARKER_RADIUS}
                  fill={p.is_offense ? SIM_COLORS.offense : SIM_COLORS.defense}
                  stroke={p.is_offense ? "#FFFFFF" : COLORS.bg}
                  strokeWidth="0.2"
                />
                {p.is_target && (
                  <circle cx={p.x} cy={p.y} r={MARKER_RADIUS + 0.55} fill="none" stroke={SIM_COLORS.targetRing} strokeWidth="0.55" />
                )}
                <text
                  x={p.x}
                  y={p.y}
                  textAnchor="middle"
                  dominantBaseline="central"
                  className="sim-jersey"
                >
                  {p.jersey}
                </text>
              </g>
            ))}

            {/* The ball: a small brown dot with a light outline so it reads on green */}
            <circle
              cx={ball.x}
              cy={ball.y}
              r={0.6 * ball.scale}
              fill={SIM_COLORS.ball}
              stroke="#FFFFFF"
              strokeWidth="0.18"
            />
          </g>
        </Field>

        {/* Option labels: HTML so the text stays 14px at any field size */}
        {state.showCard &&
          play.options.map((option) => {
            const p = lastFrame.players.find((q) => q.nfl_id === option.nfl_id);
            if (!p) return null;
            const isBest = best?.nfl_id === option.nfl_id;
            return (
              <span
                key={option.nfl_id}
                className={`option-label num${isBest ? " option-label--best" : ""}${p.is_target ? " option-label--target" : ""}`}
                style={{
                  left: `${((p.x - x0) / viewWidth) * 100}%`,
                  top: `${((p.y - MARKER_RADIUS - 0.9) / FIELD_WIDTH) * 100}%`,
                }}
              >
                {isBest && "BEST "}
                {pct(option.p_catch)}
              </span>
            );
          })}
      </div>

      {/* ----- Controls ----- */}
      <div className="sim-controls">
        <button type="button" className="btn btn--primary-fill" onClick={toggle} aria-label={`${playLabel} the play`}>
          {playLabel}
        </button>
        <button type="button" className="btn" onClick={restart} aria-label="Restart the play from the beginning">
          Restart
        </button>
        <input
          className="sim-controls__scrubber"
          type="range"
          min={0}
          max={timeline.totalMs}
          step={10}
          value={t}
          aria-label="Play position"
          aria-valuetext={stateText}
          onChange={(e) => seek(Number(e.target.value))}
        />
        <span className="sim-controls__readout num" aria-hidden="true">
          {stateText}
        </span>
      </div>

      {/* Reserved line so the layout does not jump when the caption appears */}
      <p className="sim-caption muted">
        {state.flightProgress !== null && "Ball flight illustrated \u2013 tracking ends at the throw"}
        {reducedMotion && state.flightProgress === null && "Reduced motion is on: press Play to start. The ball will jump to the target."}
      </p>

      {best && state.showCard && (
        <p className="sim-best">
          {best.nfl_id === play.receiver.nfl_id ? (
            <>
              Best option at the throw: <strong>{best.name}</strong>, the target, at {pct(best.p_catch)}.
            </>
          ) : (
            <>
              Best option at the throw: <strong>{best.name}</strong>
              {best.jersey != null && ` (#${best.jersey})`} at {pct(best.p_catch)}. The target, {play.receiver.name}, was{" "}
              {pct(play.p_catch)}.
            </>
          )}
        </p>
      )}

      {/* ----- Legend ----- */}
      <ul className="legend sim-legend" aria-label="Field key">
        <li className="legend__item">
          <span className="legend__swatch sim-dot" style={{ backgroundColor: SIM_COLORS.offense }} aria-hidden="true" />
          Offense
        </li>
        <li className="legend__item">
          <span className="legend__swatch sim-dot" style={{ backgroundColor: SIM_COLORS.defense }} aria-hidden="true" />
          Defense
        </li>
        <li className="legend__item">
          <span className="legend__swatch sim-dot sim-dot--ring" style={{ borderColor: SIM_COLORS.targetRing }} aria-hidden="true" />
          Target
        </li>
        <li className="legend__item">
          <span className="legend__swatch sim-dot sim-dot--ball" style={{ backgroundColor: SIM_COLORS.ball }} aria-hidden="true" />
          Ball
        </li>
        <li className="legend__item">
          <span className="legend__swatch sim-dot sim-dot--los" aria-hidden="true" />
          Line of scrimmage
        </li>
      </ul>

      {/* ----- Play details ----- */}
      <div className="sim-details">
        <p className="sim-details__desc">{play.description}</p>
        <dl className="sim-details__meta">
          {meta && (
            <>
              <div>
                <dt className="muted">Down &amp; distance</dt>
                <dd className="num">{downAndDistance(meta.down, meta.yards_to_go)}</dd>
              </div>
              <div>
                <dt className="muted">Coverage</dt>
                <dd className="num">{meta.coverage}</dd>
              </div>
            </>
          )}
          <div>
            <dt className="muted">Target</dt>
            <dd className="num">
              {play.receiver.name}, {play.receiver.position} #{play.receiver.jersey}
            </dd>
          </div>
        </dl>
      </div>
    </div>
  );
}

/** Draw order: defense, then offense, then the target. */
function orderPlayers(frame: PlayFrame): PlayFrame["players"] {
  const rank = (p: PlayFrame["players"][number]) => (p.is_target ? 2 : p.is_offense ? 1 : 0);
  return [...frame.players].sort((a, b) => rank(a) - rank(b));
}
