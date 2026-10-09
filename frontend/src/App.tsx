/**
 * App shell: header + routes. Both are generated from src/config/pages.ts.
 */
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import Header from "./components/Header";
import { pages } from "./config/pages";

export default function App() {
  return (
    <BrowserRouter>
      <a className="skip-link" href="#main">
        Skip to main content
      </a>
      <Header />
      <main id="main" className="page" tabIndex={-1}>
        <Routes>
          {pages.map((page) => (
            <Route key={page.id} path={page.path} element={page.element} />
          ))}
          {/* Unknown URLs go back to the first page */}
          <Route path="*" element={<Navigate to={pages[0].path} replace />} />
        </Routes>
      </main>
    </BrowserRouter>
  );
}
