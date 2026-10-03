// The text editor's chunk (src/editor/rich/) is loaded only when a text is
// first edited. A package it imports that Vite's development server has
// not bundled at its start is found then: Vite bundles it anew and tells
// the page to reload, and the first edit of the session is lost. So every
// package the chunk's code imports is named in vite.config.ts's
// optimizeDeps.include, which this reads as written.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";
import { builderRoot } from "./paths.ts";

const config = readFileSync(join(builderRoot, "vite.config.ts"), "utf8");
const block = /include:\s*\[([\s\S]*?)\]/.exec(config)?.[1] ?? "";
const included = new Set([...block.matchAll(/"([^"]+)"/g)].map((m) => m[1]!));

// The bare imports of a source: a package, not a path.
export function packagesImported(source: string): string[] {
  return [...source.matchAll(/^\s*import\s+(?:type\s+)?[^;]*?from\s+"([^"./][^"]*)";/gm)]
    .filter((m) => !/^\s*import\s+type\b/.test(m[0]))
    .map((m) => m[1]!);
}

test("the reader finds a package's import and leaves a type import or a path alone", () => {
  expect(packagesImported('import { Plugin } from "@tiptap/pm/state";\nimport type { Node } from "@tiptap/pm/model";\nimport { x } from "./limits.ts";\n')).toEqual(["@tiptap/pm/state"]);
});

test("every package the text editor's chunk imports is bundled when the development server starts", () => {
  const folder = join(builderRoot, "src", "editor", "rich");
  const sources = readdirSync(folder).filter((name) => /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name));
  const imported = new Set(sources.flatMap((name) => packagesImported(readFileSync(join(folder, name), "utf8"))));
  // React and the editor's own packages are in the main chunk already.
  const missing = [...imported].filter((name) => name.startsWith("@tiptap/") && !included.has(name));
  expect(imported.size).toBeGreaterThan(5);
  expect(missing).toEqual([]);
});
