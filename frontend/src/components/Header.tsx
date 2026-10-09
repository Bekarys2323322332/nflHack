/**
 * Header: logo slot, page title and generated page navigation.
 *
 * - Logo: loads /logo.png from public/. If the file is missing, a text
 *   wordmark is shown instead, so the header never has a broken image.
 * - Nav: one button per entry in src/config/pages.ts. The active page is red.
 */
import { useState } from "react";
import { NavLink } from "react-router-dom";
import { pages } from "../config/pages";
import "./Header.css";

export default function Header() {
  // Set to true if /logo.png fails to load.
  const [logoMissing, setLogoMissing] = useState(false);

  return (
    <header className="site-header">
      <div className="site-header__inner">
        {/* Logo slot */}
        <div className="site-header__logo">
          {logoMissing ? (
            <span className="wordmark" aria-label="Big Data Bowl London">
              BIG DATA BOWL · LONDON
            </span>
          ) : (
            <img src="/logo.png" alt="Big Data Bowl London" onError={() => setLogoMissing(true)} />
          )}
        </div>

        {/* Title block */}
        <div className="site-header__titles">
          <h1 className="site-header__title">OPEN ISN&apos;T ENOUGH</h1>
          <p className="site-header__subtitle muted">Who gets open, against what, and where</p>
        </div>

        {/* Navigation generated from the page registry */}
        <nav className="site-header__nav" aria-label="Pages">
          {pages.map((page) => (
            <NavLink
              key={page.id}
              to={page.path}
              end={page.path === "/"}
              className={({ isActive }) => `btn btn--nav${isActive ? " is-active btn--primary" : ""}`}
              aria-label={`Go to ${page.label}`}
            >
              {page.label}
            </NavLink>
          ))}
        </nav>
      </div>
    </header>
  );
}
