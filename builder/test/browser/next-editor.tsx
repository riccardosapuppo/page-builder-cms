// The editor as the next build would start on the browser's storage, for
// ../../e2e/browser/gives-up.spec.ts: the same shell and adapter as
// ../../src/main.tsx, but with one more step of the database's layout (a
// step that adds nothing), so that opening the database upgrades it, as
// a release that changed the layout would. An older tab must then let go
// of the database, or hold up the upgrade and be named for it.
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../../src/shared/editor-font.css";
import "../../src/shared/site.css";
import "../../src/editor/editor.css";
import { randomIds } from "../../src/document/ids.ts";
import { App, NO_PAGE } from "../../src/editor/App.tsx";
import { readOpenGroups } from "../../src/editor/open-groups.ts";
import { createUiStore } from "../../src/editor/ui-store.ts";
import { createBrowserAdapter, LAYOUT } from "../../src/storage/browser.ts";
import { systemClock } from "../../src/storage/clock.ts";
import { createEditorStore } from "../../src/store/editor-store.ts";

const env = {
  store: createEditorStore({ document: NO_PAGE, now: () => systemClock.now() }),
  ui: createUiStore({ openGroups: readOpenGroups() }),
  clock: systemClock,
  newId: randomIds(),
};
const adapter = createBrowserAdapter({ clock: systemClock, layout: [...LAYOUT, () => undefined] });

const root = document.getElementById("editor_root");
if (!root) throw new Error("next-editor.html has no #editor_root");
createRoot(root).render(
  <StrictMode>
    <App env={env} adapter={adapter} cmsOrigin={null} />
  </StrictMode>,
);
