/**
 * usePlayback: a clock for the simulator.
 *
 * Holds t (milliseconds since the start) and advances it with
 * requestAnimationFrame while playing. Pause, restart and seek only change t
 * and the playing flag; the picture is derived from t elsewhere.
 */
import { useCallback, useEffect, useRef, useState } from "react";

/** A background tab can deliver one huge frame gap; never jump more than this. */
const MAX_STEP_MS = 250;

export function usePlayback(totalMs: number, autoplay: boolean) {
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(autoplay);
  // The latest t, readable inside the animation loop without re-subscribing.
  const tRef = useRef(0);

  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    let last = performance.now();

    const tick = (now: number) => {
      // The rAF timestamp can be slightly EARLIER than performance.now() taken when the
      // effect started, so the first step may be negative. Clamp it so time never runs backwards.
      const step = Math.max(0, Math.min(now - last, MAX_STEP_MS));
      last = now;
      const next = Math.min(totalMs, tRef.current + step);
      tRef.current = next;
      setT(next);
      if (next >= totalMs) {
        setPlaying(false); // reached the end
        return;
      }
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, totalMs]);

  const seek = useCallback((ms: number) => {
    tRef.current = ms;
    setT(ms);
    setPlaying(false); // scrubbing pauses
  }, []);

  const restart = useCallback(() => {
    tRef.current = 0;
    setT(0);
    setPlaying(true);
  }, []);

  /** Play/pause. Pressing play at the very end replays from the start. */
  const toggle = useCallback(() => {
    if (!playing && tRef.current >= totalMs) {
      tRef.current = 0;
      setT(0);
    }
    setPlaying((p) => !p);
  }, [playing, totalMs]);

  return { t, playing, toggle, restart, seek };
}
