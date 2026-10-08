// The browser demo's entry point: the editor with no CMS, its pages kept
// in this browser (../storage/browser.ts). A build for the browser's
// storage (npm run build:demo) names this file in index.html in place of
// ../main.tsx (../../build/storage-entry.ts).
//
// - On a first visit the browser gets the example site, the CMS's seed
//   (../storage/example-site.ts), before the editor lists the pages.
// - The editor's address with ?preview=<id> or ?published=<id> is a page
//   the demo draws itself (./PageView.tsx), where the full system's CMS
//   would serve it: Preview opens the first, Publish the second.
// - Under the editor's bottom line, and under every page it draws, the
//   demo's line (./DemoLine.tsx).
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../shared/editor-font.css";
import "../shared/site.css";
import "../editor/editor.css";
import "./demo.css";
import { randomIds } from "../document/ids.ts";
import { App, NO_PAGE } from "../editor/App.tsx";
import { keepOpenGroups, readOpenGroups } from "../editor/open-groups.ts";
import { createUiStore } from "../editor/ui-store.ts";
import { createBrowserAdapter } from "../storage/browser.ts";
import { systemClock } from "../storage/clock.ts";
import { builtSource, seedExampleSite, withExampleSite } from "../storage/example-site.ts";
import { createEditorStore } from "../store/editor-store.ts";
import { DemoLine } from "./DemoLine.tsx";
import { PageView } from "./PageView.tsx";
import { previewAddress, publishedAddress, readView } from "./views.ts";

const browser = createBrowserAdapter({ clock: systemClock, previewAddress });
const adapter = withExampleSite(browser, () => seedExampleSite(browser, builtSource()));
const view = readView(window.location.search);

const root = document.getElementById("editor_root");
if (!root) throw new Error("index.html has no #editor_root");

if (view) {
  createRoot(root).render(
    <StrictMode>
      <PageView adapter={adapter} view={view} />
    </StrictMode>,
  );
} else {
  const env = {
    store: createEditorStore({ document: NO_PAGE, now: () => systemClock.now() }),
    ui: createUiStore({ openGroups: readOpenGroups() }),
    clock: systemClock,
    newId: randomIds(),
  };
  keepOpenGroups(env.ui);
  createRoot(root).render(
    <StrictMode>
      <App env={env} adapter={adapter} cmsOrigin={null} publishedView={publishedAddress} foot={<DemoLine />} />
    </StrictMode>,
  );
}
