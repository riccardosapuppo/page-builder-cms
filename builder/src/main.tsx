// The editor's entry point. For now it shows that the bundle works end to
// end in a browser: the fonts and the published page's stylesheets load,
// and the schema's validator, compiled ahead of time, runs. The editor's
// shell (src/editor/) takes its place.
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./shared/editor-font.css";
import "./shared/site.css";
import { validateDocument } from "./shared/validate.ts";

const newPage = validateDocument({ schemaVersion: 1, title: "Untitled page", sections: [] });

function Placeholder() {
  return (
    <main>
      <h1>Page Builder CMS</h1>
      <p data-check="validator">{newPage.valid ? "A new page passes the document schema." : "A new page fails the document schema."}</p>
    </main>
  );
}

const root = document.getElementById("root");
if (!root) throw new Error("index.html has no #root");
createRoot(root).render(
  <StrictMode>
    <Placeholder />
  </StrictMode>,
);
