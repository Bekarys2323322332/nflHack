/**
 * useMediaQuery: true while the given CSS media query matches.
 * Used by charts that need different pixel sizes on phones (Recharts sizes are
 * props, not CSS).
 */
import { useEffect, useState } from "react";

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);

  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}

/** Phones and small tablets, matching the 600px breakpoint in the CSS. */
export const useIsNarrow = () => useMediaQuery("(max-width: 600px)");
