// The example site's pages, its collections' templates, and the header and
// footer a site starts from, through the same comparison as the corpus
// (compare.ts): both validators, after their application rules, must call
// each document valid, report no exception, and normalise it to the same
// numbers and values. Then its collections, each entry with its
// collection's definition, through the collection corpus's comparison
// (compare.ts --kind collection), under the same conditions.
//
//   node compare-examples.ts [--plant-invalid] [any option of compare.ts]
//
// The pages and the collections live once, in example-site/ at the
// repository's root, which the CMS's seed and the editor's browser demo
// read, and the starters of the header and footer in cms/config/parts/,
// which the CMS draws until a site publishes its own and the demo reads
// too; nothing here copies them into the corpora. For the run they are
// copied into two temporary corpora of valid/ files, the documents' with a
// manifest naming each by its address, its collection or its part, the
// collections' with one naming each entry by its address, and the folders
// are removed afterwards. --plant-invalid exists only to show the
// comparison failing: it gives the first page's first heading level 7,
// and the first entry a value under a key no field has, in those
// temporary copies only.
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { REPO, TOOLS } from "./corpus.ts";

interface Site {
  collections: Array<{ id: number; file: string }>;
  pages: Array<{ slug: string; file: string; home: boolean }>;
}

interface CollectionFile {
  collection: { name: string; prefix: string };
  entries: Array<{ slug: string; values: Record<string, unknown> }>;
  template: unknown;
}

const EXAMPLE_SITE = join(REPO, "example-site");
const PARTS = join(REPO, "cms", "config", "parts");
const KINDS = ["header", "footer"];
const site = JSON.parse(readFileSync(join(EXAMPLE_SITE, "site.json"), "utf8")) as Site;
const collections = site.collections.map((listed) => ({ listed, held: JSON.parse(readFileSync(join(EXAMPLE_SITE, listed.file), "utf8")) as CollectionFile }));
const argv = process.argv.slice(2);
const plant = argv.includes("--plant-invalid");
const passed = argv.filter((arg) => arg !== "--plant-invalid");

const writeJson = (path: string, value: unknown): void => writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);

// The documents: each page, each collection's template, each part.
function documents(corpus: string): number {
  mkdirSync(join(corpus, "valid"));
  const manifest: Record<string, { rule: string }> = {};
  for (const page of site.pages) {
    const name = `valid/${basename(page.file)}`;
    copyFileSync(join(EXAMPLE_SITE, page.file), join(corpus, name));
    manifest[name] = { rule: `the example site's page at ${page.home ? "/" : `/${page.slug}`}` };
  }
  for (const { listed, held } of collections) {
    const name = `valid/template-${basename(listed.file)}`;
    writeJson(join(corpus, name), held.template);
    manifest[name] = { rule: `the template of the example site's ${held.collection.name}, ${listed.file}` };
  }
  for (const kind of KINDS) {
    const name = `valid/part-${kind}.json`;
    copyFileSync(join(PARTS, `${kind}.json`), join(corpus, name));
    manifest[name] = { rule: `the ${kind} a site starts from, cms/config/parts/${kind}.json` };
  }
  if (plant) {
    const first = join(corpus, `valid/${basename(site.pages[0]!.file)}`);
    const planted = readFileSync(first, "utf8").replace(/"level": \d/, '"level": 7');
    writeFileSync(first, planted);
  }
  writeJson(join(corpus, "manifest.json"), manifest);
  return Object.keys(manifest).length;
}

// The collections: each entry, a case of its own with its collection's
// definition, as the collection corpus holds them.
function entries(corpus: string): number {
  mkdirSync(join(corpus, "valid"));
  const manifest: Record<string, { rule: string }> = {};
  for (const { listed, held } of collections) {
    for (const entry of held.entries) {
      const name = `valid/${held.collection.prefix}-${entry.slug}.json`;
      writeJson(join(corpus, name), { collection: held.collection, entry });
      manifest[name] = { rule: `the example site's entry at /${held.collection.prefix}/${entry.slug}, ${listed.file}` };
    }
  }
  if (plant) {
    const [first] = Object.keys(manifest);
    const path = join(corpus, first!);
    const held = JSON.parse(readFileSync(path, "utf8")) as { entry: { values: Record<string, unknown> } };
    held.entry.values.summery = "A key no field has";
    writeJson(path, held);
  }
  writeJson(join(corpus, "manifest.json"), manifest);
  return Object.keys(manifest).length;
}

// One comparison over a corpus made for it, the folder removed afterwards;
// its number of files is the floor.
function compare(make: (corpus: string) => number, kind: "page" | "collection"): number {
  const corpus = mkdtempSync(join(tmpdir(), `example-site-${kind}-corpus-`));
  try {
    const count = make(corpus);
    const result = spawnSync(process.execPath, [join(TOOLS, "compare.ts"), "--kind", kind, "--corpus", corpus, "--min-files", String(count), ...passed], { stdio: "inherit" });
    return result.status ?? 1;
  } finally {
    rmSync(corpus, { recursive: true, force: true });
  }
}

let code = 2;
try {
  const pages = compare(documents, "page");
  const kept = compare(entries, "collection");
  code = pages === 0 && kept === 0 ? 0 : 1;
} finally {
  process.exit(code);
}
