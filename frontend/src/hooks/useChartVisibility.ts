/**
 * useChartVisibility: which charts are shown, remembered in localStorage.
 *
 * Starts from each chart's `defaultVisible` in src/config/charts.ts. Charts
 * added to the registry later automatically use their default until the user
 * changes them.
 */
import { useCallback, useState } from "react";
import { charts } from "../config/charts";

const STORAGE_KEY = "bdb.chartVisibility.v1";

type VisibilityMap = Record<string, boolean>;

function load(): VisibilityMap {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? (parsed as VisibilityMap) : {};
  } catch {
    // Storage can be blocked (private mode). Fall back to defaults.
    return {};
  }
}

export function useChartVisibility() {
  const [saved, setSaved] = useState<VisibilityMap>(load);

  const isVisible = useCallback(
    (id: string) => saved[id] ?? charts.find((c) => c.id === id)?.defaultVisible ?? false,
    [saved],
  );

  const persist = (next: VisibilityMap) => {
    setSaved(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* ignore: the setting just will not survive a reload */
    }
  };

  const setVisible = (id: string, visible: boolean) => persist({ ...saved, [id]: visible });
  const reset = () => persist({});

  return { isVisible, setVisible, reset };
}

export type ChartVisibility = ReturnType<typeof useChartVisibility>;
