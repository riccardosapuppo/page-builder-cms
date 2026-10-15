// The editor's tokens stay the chrome's. The page on the canvas inherits
// what the document's root holds, so no custom property the editor's
// stylesheets set on :root may be one the published page's stylesheets
// read or set: the page would be drawn on the canvas otherwise than a
// visitor gets it. (While the editor's mark rule was named --mark-line,
// as the site's logo waterline is, the logo drew its waterline graphite on
// every light band of the canvas.)
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

const EDITOR = fileURLToPath(new URL(".", import.meta.url));
const PAGE = ["site.css", "tokens.css"].map((file) => readFileSync(new URL(`../../../cms/app/assets/stylesheets/${file}`, import.meta.url), "utf8"));

// Every stylesheet of the editor, in its folder and below.
function stylesheets(folder: string): string[] {
  return readdirSync(folder, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? stylesheets(join(folder, entry.name)) : entry.name.endsWith(".css") ? [join(folder, entry.name)] : []);
}

// The custom properties a stylesheet's rules for :root alone set.
function rootTokens(css: string): string[] {
  const rules = [...css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/(?:^|})\s*:root\s*\{([^}]*)\}/g)];
  return rules.flatMap((rule) => [...rule[1]!.matchAll(/(--[\w-]+)\s*:/g)].map((found) => found[1]!));
}

test("no custom property the editor sets on the root is one the published page's stylesheets read or set", () => {
  const sheets = stylesheets(EDITOR);
  const tokens = new Set(sheets.flatMap((sheet) => rootTokens(readFileSync(sheet, "utf8"))));
  expect(tokens.size, "the editor's root tokens were found").toBeGreaterThan(20);
  const page = new Set(PAGE.flatMap((css) => [...css.matchAll(/--[\w-]+/g)].map((found) => found[0])));
  expect([...tokens].filter((token) => page.has(token))).toEqual([]);
});
