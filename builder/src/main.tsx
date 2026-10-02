// The editor's entry point: the published page's stylesheets and fonts
// for the canvas, the editor's own chrome after them, and the shell
// (./editor/App.tsx) on the Rails storage adapter, the system clock and
// random block ids.
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./shared/editor-font.css";
import "./shared/site.css";
import "./editor/editor.css";
import { randomIds } from "./document/ids.ts";
import { App, NO_PAGE } from "./editor/App.tsx";
import { createUiStore } from "./editor/ui-store.ts";
import { systemClock } from "./storage/clock.ts";
import { createRailsAdapter } from "./storage/rails.ts";
import { createEditorStore } from "./store/editor-store.ts";

const env = {
  store: createEditorStore({ document: NO_PAGE, now: () => systemClock.now() }),
  ui: createUiStore(),
  clock: systemClock,
  newId: randomIds(),
};
const adapter = createRailsAdapter();

const root = document.getElementById("root");
if (!root) throw new Error("index.html has no #root");
createRoot(root).render(
  <StrictMode>
    <App env={env} adapter={adapter} />
  </StrictMode>,
);
