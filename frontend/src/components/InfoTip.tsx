/**
 * InfoTip: a small "?" icon button that reveals a "How to read this" note.
 *
 * Opens on hover, on keyboard focus and on click/tap. Escape closes it.
 * The note is linked to the button with aria-describedby while open.
 */
import { useId, useState } from "react";
import type { ReactNode } from "react";

interface InfoTipProps {
  /** The explanation shown in the popover. */
  children: ReactNode;
  /** Accessible name of the button. */
  label?: string;
}

export default function InfoTip({ children, label = "How to read this" }: InfoTipProps) {
  const [hover, setHover] = useState(false);
  const [focus, setFocus] = useState(false);
  const [pinned, setPinned] = useState(false); // toggled by click/tap
  const id = useId();
  const open = hover || focus || pinned;

  return (
    <span
      className="infotip"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          setPinned(false);
          setHover(false);
        }
      }}
    >
      <button
        type="button"
        className="infotip__button"
        aria-label={label}
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        onFocus={() => setFocus(true)}
        onBlur={() => setFocus(false)}
        onClick={() => setPinned((p) => !p)}
      >
        <span aria-hidden="true">?</span>
      </button>
      {open && (
        <span role="tooltip" id={id} className="infotip__popover">
          <strong className="infotip__title">{label}</strong>
          {children}
        </span>
      )}
    </span>
  );
}
