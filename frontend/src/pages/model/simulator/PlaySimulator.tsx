/**
 * PlaySimulator: the main feature of the ML page.
 *
 * Left: filter chips and a list of plays (play_index.json).
 * Right: the animated field for the chosen play (plays/play_<game>_<play>.json).
 * On narrow screens the two stack, and choosing a play scrolls the field into view.
 */
import { useMemo, useRef, useState } from "react";
import { useMl, usePlay } from "../../../api";
import type { PlayIndexRow } from "../../../api";
import ChartPanel from "../../../components/ChartPanel";
import StateMessage from "../../../components/StateMessage";
import { useMediaQuery } from "../../../hooks/useMediaQuery";
import PlayList, { PLAY_FILTERS, playKey } from "./PlayList";
import type { PlayFilter } from "./PlayList";
import PlayStage from "./PlayStage";

export default function PlaySimulator() {
  const index = useMl("play_index");
  const [filter, setFilter] = useState<PlayFilter>("all");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const stacked = useMediaQuery("(max-width: 899px)");
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const stageRef = useRef<HTMLDivElement>(null);

  const all = useMemo(() => index.data ?? [], [index.data]);
  const visible = useMemo(() => {
    const test = PLAY_FILTERS.find((f) => f.id === filter)?.test ?? (() => true);
    return all.filter(test);
  }, [all, filter]);

  // If the chosen play is filtered out, fall back to the first visible one.
  const active: PlayIndexRow | null = visible.find((r) => playKey(r) === selectedKey) ?? visible[0] ?? null;
  const activeKey = active ? playKey(active) : null;
  const play = usePlay(active);

  const onSelect = (row: PlayIndexRow) => {
    setSelectedKey(playKey(row));
    // When the list sits above the field, bring the field into view.
    if (stacked) stageRef.current?.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" });
  };

  const howToRead = (
    <>
      Pick a play on the left. Blue circles are the offense, orange the defense, and the thick yellow ring marks the
      targeted receiver. The brown dot is the ball. Tracking data stops at the throw, so the ball flight is drawn for
      illustration. At the throw the model shows its catch probability, then the real result, then whether it was right
      (it leaned the correct way) or surprised. Route runners get their own catch % at the throw.
    </>
  );

  let body;
  if (!index.data) {
    body = <StateMessage loading={index.loading} error={index.error} onRetry={index.reload} what="the play list" />;
  } else {
    body = (
      <div className="sim">
        <PlayList
          all={all}
          visible={visible}
          filter={filter}
          onFilterChange={setFilter}
          activeKey={activeKey}
          onSelect={onSelect}
        />
        <div className="sim__stage" ref={stageRef}>
          {!active ? (
            <p className="chart-empty" role="status">
              Choose a filter with at least one play.
            </p>
          ) : play.data ? (
            // key: a new play remounts the stage, which resets the clock and starts playback.
            <PlayStage key={activeKey} play={play.data} meta={active} reducedMotion={reducedMotion} />
          ) : (
            <StateMessage loading={play.loading} error={play.error} onRetry={play.reload} what="the play" />
          )}
        </div>
      </div>
    );
  }

  return (
    <ChartPanel
      title="The model calls the catch at the moment of the throw"
      subtitle="Pick a play and watch it unfold. Tracking data ends at the throw."
      howToRead={howToRead}
    >
      {body}
    </ChartPanel>
  );
}
