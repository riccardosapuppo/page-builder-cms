// The browser demo's entry point: the editor with no CMS, its pages kept
// in this browser (../storage/browser.ts). A build for the browser's
// storage (npm run build:demo) names this file in index.html in place of
// ../main.tsx (../../build/storage-entry.ts).
//
// - On a first visit the browser gets the example site, the CMS's seed
//   (../storage/example-site.ts), before the editor lists the pages; on a
//   visit to a build of a newer edition, the new one, unless the visitor
//   worked on the site, which is kept and offered the new one in the
//   demo's line.
// - The editor's address with ?preview=<id>, ?published=<id>,
//   ?entry=<id>, ?cart or ?order=<id> is a page the demo draws itself
//   (./PageView.tsx), where the full system's CMS would serve it: Preview
//   opens the first, Publish the second, a Collection list's card and an
//   entry's View the third, Add to cart and a link to /cart the cart, and
//   the cart's Checkout, through the browser's storage (checkoutDemo), the
//   order it made.
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
import { layoutStart } from "../editor/layout-mode.ts";
import { keepOpenGroups, readOpenGroups } from "../editor/open-groups.ts";
import { createUiStore } from "../editor/ui-store.ts";
import { createBrowserAdapter } from "../storage/browser.ts";
import { systemClock } from "../storage/clock.ts";
import { builtSource, seedExampleEdition, startOver, withExampleSite } from "../storage/example-site.ts";
import { createEditorStore } from "../store/editor-store.ts";
import { DemoLine, seedNews } from "./DemoLine.tsx";
import { PageView } from "./PageView.tsx";
import { entryAddress, previewAddress, publishedAddress, readView } from "./views.ts";

const browser = createBrowserAdapter({ clock: systemClock, previewAddress });
// What the seed found, for the demo's line.
const news = seedNews();
const adapter = withExampleSite(browser, () => seedExampleEdition(browser, builtSource()).then((outcome) => {
  news.set(outcome);
  return outcome;
}));
// The visitor chose the new edition: the site this browser kept goes, and
// the page loads again to be given the new one.
const startingOver = () => startOver(browser).then(() => window.location.reload());
const view = readView(window.location.search);

const root = document.getElementById("editor_root");
if (!root) throw new Error("index.html has no #editor_root");

if (view) {
  createRoot(root).render(
    <StrictMode>
      <PageView adapter={adapter} view={view} checkout={(lines) => browser.checkoutDemo(lines)} />
    </StrictMode>,
  );
} else {
  const env = {
    store: createEditorStore({ document: NO_PAGE, now: () => systemClock.now() }),
    ui: createUiStore({ openGroups: readOpenGroups(), ...layoutStart() }),
    clock: systemClock,
    newId: randomIds(),
  };
  keepOpenGroups(env.ui);
  createRoot(root).render(
    <StrictMode>
      <App env={env} adapter={adapter} cmsOrigin={null} publishedView={publishedAddress} entryView={entryAddress} foot={<DemoLine news={news} startOver={startingOver} />} />
    </StrictMode>,
  );
}
