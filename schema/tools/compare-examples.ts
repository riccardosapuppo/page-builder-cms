// The example site's pages, and the header and footer a site starts from,
// through the same comparison as the corpus (compare.ts): both validators,
// after their application rules, must call each document valid, report no
// exception, and normalise it to the same numbers and values.
//
//   node compare-examples.ts [--plant-invalid] [any option of compare.ts]
//
// The pages live once, in example-site/ at the repository's root, which the
// CMS's seed and the editor's browser demo read, and the starters of the
// header and footer in cms/config/parts/, which the CMS draws until a site
// publishes its own and the demo reads too; nothing here copies them into
// the corpus. For the run they are copied into a temporary corpus of
// valid/ files, with a manifest naming each by its address or its part, and
// the folder is removed afterwards. --plant-invalid exists only to show the
// comparison failing: it gives the first page's first heading level 7, in
// that temporary copy only.
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { REPO, TOOLS } from "./corpus.ts";

interface Site {
  pages: Array<{ slug: string; file: string; home: boolean }>;
}

const EXAMPLE_SITE = join(REPO, "example-site");
const PARTS = join(REPO, "cms", "config", "parts");
const KINDS = ["header", "footer"];
const site = JSON.parse(readFileSync(join(EXAMPLE_SITE, "site.json"), "utf8")) as Site;
const argv = process.argv.slice(2);
const plant = argv.includes("--plant-invalid");
const passed = argv.filter((arg) => arg !== "--plant-invalid");

const corpus = mkdtempSync(join(tmpdir(), "example-site-corpus-"));
let code = 2;
try {
  mkdirSync(join(corpus, "valid"));
  const manifest: Record<string, { rule: string }> = {};
  for (const page of site.pages) {
    const name = `valid/${basename(page.file)}`;
    copyFileSync(join(EXAMPLE_SITE, page.file), join(corpus, name));
    manifest[name] = { rule: `the example site's page at ${page.home ? "/" : `/${page.slug}`}` };
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
  writeFileSync(join(corpus, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  // The pages and the parts are the whole corpus here, so the floor is
  // their number.
  const result = spawnSync(process.execPath, [join(TOOLS, "compare.ts"), "--corpus", corpus, "--min-files", String(site.pages.length + KINDS.length), ...passed], { stdio: "inherit" });
  code = result.status ?? 1;
} finally {
  rmSync(corpus, { recursive: true, force: true });
}
process.exit(code);
