// The editor's identity, as files: its favicon is the approved design's
// mark, byte for byte, so the two cannot drift apart; the web app manifest
// names the product and points at that icon; the page links both, says it
// is in English and asks not to be translated; and no default icon of the
// tools the editor is built with is left anywhere in builder/. How the
// mark reads at 16 px is the browser's to say: e2e/identity.spec.ts.
// @vitest-environment node
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { expect, test } from "vitest";
import { builderRoot, repoRoot } from "./paths.ts";

// Files the scaffolding of a React and Vite project would leave: its logos.
const DEFAULT_ICONS = /^(vite|react)\.svg$|^(favicon\.ico|logo\d*\.png)$/i;

// Every file under a folder, as paths relative to it, without the folders
// that hold only what is installed or written by a run.
function filesUnder(root: string, skip = new Set(["node_modules", "dist", "test-results", ".mutants"])): string[] {
  const found: string[] = [];
  const walk = (folder: string) => {
    for (const name of readdirSync(folder)) {
      if (skip.has(name)) continue;
      const path = join(folder, name);
      if (statSync(path).isDirectory()) walk(path);
      else found.push(relative(root, path).replaceAll("\\", "/"));
    }
  };
  walk(root);
  return found;
}

test("the favicon is the design's mark, byte for byte", () => {
  expect(readFileSync(join(builderRoot, "public", "favicon.svg"))).toEqual(readFileSync(join(repoRoot, "design", "mark.svg")));
});

test("the manifest names the product and points at the mark, and the page links both", () => {
  const manifest = JSON.parse(readFileSync(join(builderRoot, "public", "manifest.webmanifest"), "utf8")) as { name: string; icons: Array<{ src: string; type: string }> };
  expect(manifest.name).toBe("Page Builder CMS");
  expect(manifest.icons).toEqual([expect.objectContaining({ src: "favicon.svg", type: "image/svg+xml" })]);
  const index = readFileSync(join(builderRoot, "index.html"), "utf8");
  expect(index).toContain('<link rel="icon" href="/favicon.svg" type="image/svg+xml">');
  expect(index).toContain('<link rel="manifest" href="/manifest.webmanifest">');
  expect(index).toContain("<title>Page Builder CMS</title>");
});

// The interface is in one language (en-US) and is not translated: the page
// says so, and asks the browser not to offer to translate it, since a
// translator that rewrites the text React keeps can make the editor fail.
test("the page is in English and asks browsers not to offer to translate it", () => {
  const index = readFileSync(join(builderRoot, "index.html"), "utf8");
  expect(index).toMatch(/<html lang="en" translate="no">/);
  expect(index).toContain('<meta name="google" content="notranslate">');
});

test("no default icon of the editor's tools is left in builder/", () => {
  const files = filesUnder(builderRoot);
  // The walk saw the folders that matter, so finding nothing means something.
  expect(files).toContain("public/favicon.svg");
  expect(files.filter((path) => path.startsWith("src/")).length).toBeGreaterThan(100);
  expect(files.filter((path) => DEFAULT_ICONS.test(path.split("/").at(-1)!))).toEqual([]);
  // The pattern finds what it is for.
  expect(["public/vite.svg", "src/assets/react.svg", "public/favicon.ico"].filter((path) => DEFAULT_ICONS.test(path.split("/").at(-1)!))).toHaveLength(3);
});
