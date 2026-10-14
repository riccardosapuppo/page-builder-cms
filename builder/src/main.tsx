// The editor's entry point: the published page's stylesheets and fonts
// for the canvas, the editor's own chrome after them, and the shell
// (./editor/App.tsx) on the CMS's storage adapter, its pages opening on
// the CMS's origin, with the system clock and random block ids; the
// sidebar's open groups as this browser kept them.
//
// The browser demo starts from ./demo/main.tsx instead: a build for the
// browser's storage (VITE_STORAGE=browser, npm run build:demo) names that
// file in index.html (../build/storage-entry.ts), so neither build holds
// the other's storage, which ../build/bundle-check.ts holds each to.
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./shared/editor-font.css";
import "./shared/site.css";
import "./editor/editor.css";
import { randomIds } from "./document/ids.ts";
import { App, NO_PAGE } from "./editor/App.tsx";
import { layoutStart } from "./editor/layout-mode.ts";
import { keepOpenGroups, readOpenGroups } from "./editor/open-groups.ts";
import { createUiStore } from "./editor/ui-store.ts";
import { systemClock } from "./storage/clock.ts";
import { cmsOrigin } from "./storage/config.ts";
import { createRailsAdapter } from "./storage/rails.ts";
import { createEditorStore } from "./store/editor-store.ts";

const env = {
  store: createEditorStore({ document: NO_PAGE, now: () => systemClock.now() }),
  ui: createUiStore({ openGroups: readOpenGroups(), ...layoutStart() }),
  clock: systemClock,
  newId: randomIds(),
};
keepOpenGroups(env.ui);

const root = document.getElementById("editor_root");
if (!root) throw new Error("index.html has no #editor_root");
createRoot(root).render(
  <StrictMode>
    <App env={env} adapter={createRailsAdapter()} cmsOrigin={cmsOrigin()} />
  </StrictMode>,
);
