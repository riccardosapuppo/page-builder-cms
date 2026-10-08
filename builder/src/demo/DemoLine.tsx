// The demo's line at the bottom of the window, under the editor's bottom
// line and under each page the demo draws: what the demo is, and where the
// source is. Word for word as the project gives it; the demo carries no
// other line about itself.
export const SOURCE_ADDRESS = "https://github.com/riccardosapuppo/page-builder-cms";

export function DemoLine() {
  return (
    <aside className="demo-line chrome" aria-label="About this demo">
      <p>
        Browser demo: drafts stay in this browser. The full CMS runs on Rails 8, with publishing, shared versions and caching.{" "}
        <a href={SOURCE_ADDRESS}>Source on GitHub</a>.
      </p>
    </aside>
  );
}
