// The editor's entry point: the published page's stylesheets and fonts
// for the canvas, the editor's own chrome after them, and the shell
// (./editor/App.tsx) on the storage adapter the build names (VITE_STORAGE:
// the CMS's by default, or the browser's), the system clock and random
// block ids; the sidebar's open groups as this browser kept them.
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./shared/editor-font.css";
import "./shared/site.css";
import "./editor/editor.css";
import { randomIds } from "./document/ids.ts";
import { App, NO_PAGE } from "./editor/App.tsx";
import { keepOpenGroups, readOpenGroups } from "./editor/open-groups.ts";
import { createUiStore } from "./editor/ui-store.ts";
import { createBrowserAdapter } from "./storage/browser.ts";
import { systemClock } from "./storage/clock.ts";
import { cmsOrigin, storageKind } from "./storage/config.ts";
import { createRailsAdapter } from "./storage/rails.ts";
import { createEditorStore } from "./store/editor-store.ts";

const env = {
  store: createEditorStore({ document: NO_PAGE, now: () => systemClock.now() }),
  ui: createUiStore({ openGroups: readOpenGroups() }),
  clock: systemClock,
  newId: randomIds(),
};
keepOpenGroups(env.ui);
const browser = storageKind() === "browser";
const adapter = browser ? createBrowserAdapter({ clock: systemClock }) : createRailsAdapter();

const root = document.getElementById("editor_root");
if (!root) throw new Error("index.html has no #editor_root");
createRoot(root).render(
  <StrictMode>
    <App env={env} adapter={adapter} cmsOrigin={browser ? null : cmsOrigin()} />
  </StrictMode>,
);
