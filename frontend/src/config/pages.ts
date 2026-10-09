/**
 * Page registry. The header navigation and the router are both generated from
 * this array, so adding a page means adding ONE entry here:
 *
 *   1. Create the page component, e.g. src/pages/foo/FooPage.tsx
 *   2. Import it below and add:
 *        { id: "foo", label: "Foo", path: "/foo", element: createElement(FooPage) }
 *
 * `element` is built with createElement so this file can stay plain .ts.
 */
import { createElement } from "react";
import type { ReactElement } from "react";
import InsightsPage from "../pages/insights/InsightsPage";
import ModelPage from "../pages/model/ModelPage";

export interface PageConfig {
  /** Unique, stable id. */
  id: string;
  /** Text on the header nav button. */
  label: string;
  /** Route path. */
  path: string;
  /** What the route renders. */
  element: ReactElement;
}

export const pages: PageConfig[] = [
  { id: "insights", label: "Insights", path: "/", element: createElement(InsightsPage) },
  { id: "model", label: "ML Predictions", path: "/model", element: createElement(ModelPage) },
];
