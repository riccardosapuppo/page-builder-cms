// Which entry point the editor's page loads, by the storage the build
// chose: src/main.tsx on the CMS's, src/demo/main.tsx on the browser's.
// The choice is in index.html, so each build's module graph holds only its
// own storage: the CMS's never meets the demo, its example site and its
// pictures, and the demo's never meets the CMS adapter or its address.
// Applies to the development server too, where VITE_STORAGE=browser
// serves the demo.
import type { Plugin } from "vite";
import type { StorageKind } from "../src/storage/config.ts";

export const ENTRIES: Record<StorageKind, string> = {
  rails: "/src/main.tsx",
  browser: "/src/demo/main.tsx",
};

// The page with the entry of the storage chosen. Only the editor's page
// names the CMS's entry; a page that does not is left as it is.
export function chooseEntry(html: string, storage: StorageKind): string {
  const named = `<script type="module" src="${ENTRIES.rails}"></script>`;
  if (storage === "rails" || !html.includes(named)) return html;
  return html.replace(named, `<script type="module" src="${ENTRIES[storage]}"></script>`);
}

export function storageEntry(storage: StorageKind): Plugin {
  return {
    name: "page-builder-cms:storage-entry",
    // Before Vite reads the page's scripts.
    transformIndexHtml: { order: "pre", handler: (html) => chooseEntry(html, storage) },
  };
}
