// The browser half of e2e/canvas-css.spec.ts: the editor's own CSS entry
// points (src/shared/), and three page roots at the widths the editor
// previews, desktop, tablet and phone, each holding the markup the server's
// block partials write for a two-column section with a heading and text.
import "../../src/shared/editor-font.css";
import "../../src/shared/site.css";

const markup = `
  <div class="sw">
    <section class="sec">
      <div class="sw-inner">
        <div class="cols cols-2">
          <div class="col pad-none tablet-pad-l phone-pad-xl">
            <h2 class="w w-heading size-heading-2">Winter series</h2>
            <div class="w w-text"><p>Short, cold swims.</p></div>
          </div>
          <div class="col"></div>
        </div>
      </div>
    </section>
  </div>`;

for (const width of [1280, 768, 390]) {
  const site = document.createElement("div");
  site.className = "site";
  site.dataset.width = String(width);
  site.style.width = `${width}px`;
  site.innerHTML = markup;
  document.body.append(site);
}
// The editor's chrome font loads only once something uses it.
const chrome = document.createElement("p");
chrome.className = "chrome";
chrome.style.fontFamily = '"Instrument Sans"';
chrome.textContent = "Saved";
document.body.append(chrome);

document.body.dataset.ready = "true";
