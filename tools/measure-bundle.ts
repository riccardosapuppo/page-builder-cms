// npm run measure:bundle
//
// What the editor's production bundle weighs: the main chunk the page loads
// at once, the chunks it loads later (the text editor, loaded when a text is
// first edited, and the upload code, loaded at the first upload), the
// stylesheet and the fonts, each raw and gzipped.
//
// It builds the editor twice, with the build `npm run build` makes (into
// folders of its own under the system's temporary folder, so builder/dist
// is left alone), and reports the first; the second shows the build is
// reproducible, byte for byte. What is lazy is read from the files, not
// taken from the names: index.html names only the entry, the entry imports
// the lazy chunks with import() and never statically, and a string that only
// the text editor's chunk holds is not in the entry. Sourcemaps are not
// part of what a visitor downloads and are left out.
//
// Gzip is zlib's level 9, which is what Vite's own size report and most
// static servers' best setting give. The sizes do not depend on the
// machine's load, so this tool does not wait for it to be quiet.
//
// Exits 0 when it measured and its checks passed, 1 when one failed, 2 when
// it could not run here.
import { createHash } from "node:crypto";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { banner, kib } from "./lib/measure.ts";
import { graph } from "./lib/bundle-graph.ts";
import { buildEditor } from "./lib/editor-build.ts";
import { CouldNotRun } from "./lib/processes.ts";

// Held by the text editor's chunk (ProseMirror's state module throws it)
// and by no other part of the editor.
const TEXT_EDITOR_MARK = "Adding different instances of a keyed plugin";

interface File {
  name: string;
  bytes: Buffer;
}

const results: string[] = [];
let failed = 0;
function check(ok: boolean, what: string, detail = ""): void {
  if (!ok) failed += 1;
  results.push(`${ok ? "ok  " : "FAIL"} ${what}${detail ? `: ${detail}` : ""}`);
}

// The files a visitor can download from a build: everything but sourcemaps,
// by their path under the folder.
function filesOf(folder: string): File[] {
  const out: File[] = [];
  const walk = (dir: string, prefix: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) walk(join(dir, entry.name), `${prefix}${entry.name}/`);
      else if (!entry.name.endsWith(".map")) out.push({ name: `${prefix}${entry.name}`, bytes: readFileSync(join(dir, entry.name)) });
    }
  };
  walk(folder, "");
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

const gzip = (bytes: Buffer): number => gzipSync(bytes, { level: 9 }).length;
const text = (file: File): string => file.bytes.toString("utf8");

// "TextEditor-CwxqqIQC.js" is "TextEditor"; "index-RI5M3DTl.js" is "index".
const stem = (name: string): string => name.replace(/^.*\//, "").replace(/-[A-Za-z0-9_-]{8}\.(js|css|woff2)$/, "");

const folders: string[] = [];
let exitCode = 0;
try {
  console.log(banner("measure-bundle"));
  const base = mkdtempSync(join(tmpdir(), "pbc-measure-bundle-"));
  folders.push(base);
  const first = buildEditor(join(base, "first"));
  const second = buildEditor(join(base, "second"));
  console.log(`built twice, into ${first.folder} and ${second.folder}`);

  const files = filesOf(first.folder);
  const again = filesOf(second.folder);
  const digest = (list: File[]): string[] => list.map((f) => `${f.name} ${createHash("sha256").update(f.bytes).digest("hex")}`);
  check(JSON.stringify(digest(files)) === JSON.stringify(digest(again)), "two builds give the same files, byte for byte", `${files.length} files`);

  // --- What index.html loads ---------------------------------------------------
  const html = files.find((f) => f.name === "index.html");
  if (!html) throw new Error("the build has no index.html");
  const scripts = [...text(html).matchAll(/<script[^>]*\ssrc="\/([^"]+)"/g)].map((m) => m[1]!);
  const sheets = [...text(html).matchAll(/<link[^>]*rel="stylesheet"[^>]*href="\/([^"]+)"/g)].map((m) => m[1]!);
  const preloads = [...text(html).matchAll(/<link[^>]*rel="modulepreload"[^>]*href="\/([^"]+)"/g)].map((m) => m[1]!);
  check(scripts.length === 1 && stem(scripts[0]!) === "index", "index.html loads one script, the entry", scripts.join(", "));
  check(preloads.length === 0, "index.html preloads no other module", preloads.join(", ") || "none");
  const entry = files.find((f) => f.name === scripts[0]);
  if (!entry) throw new Error(`the entry ${scripts[0]} is not in the build`);

  // --- Which chunks are loaded at once, which later ------------------------------
  const { atOnce, lazy } = graph(files.filter((f) => f.name.endsWith(".js")).map((f) => ({ name: f.name, text: text(f) })), entry.name);
  const editorChunk = [...lazy.keys()].find((name) => stem(name) === "TextEditor");
  check(editorChunk !== undefined, "the text editor is a chunk the entry loads with import()", editorChunk ?? "none among " + [...lazy.keys()].join(", "));
  check(editorChunk !== undefined && text(files.find((f) => f.name === editorChunk)!).includes(TEXT_EDITOR_MARK), "the text editor's chunk holds ProseMirror's code", TEXT_EDITOR_MARK);
  check(!text(entry).includes(TEXT_EDITOR_MARK), "the entry holds none of ProseMirror's code");
  check([...atOnce].every((name) => !name.includes("TextEditor")), "no chunk loaded at once imports the text editor statically");
  const jsFiles = files.filter((f) => f.name.endsWith(".js"));
  check(jsFiles.every((f) => atOnce.has(f.name) || lazy.has(f.name)), "every JavaScript file is either loaded at once or reached by import()", jsFiles.map((f) => f.name).join(", "));

  // --- The table ------------------------------------------------------------------
  const row = (f: File, what: string): string => `| ${f.name} | ${what} | ${f.bytes.length} (${kib(f.bytes.length)} KiB) | ${gzip(f.bytes)} (${kib(gzip(f.bytes))} KiB) |`;
  console.log("");
  console.log("| File | What | Raw, bytes | Gzip, bytes |");
  console.log("| --- | --- | --- | --- |");
  console.log(row(html, "the page"));
  const sum = { raw: html.bytes.length, gz: gzip(html.bytes) };
  const add = (f: File) => { sum.raw += f.bytes.length; sum.gz += gzip(f.bytes); };
  for (const name of atOnce) {
    const file = files.find((f) => f.name === name)!;
    console.log(row(file, name === entry.name ? "the main chunk, loaded at once" : "loaded at once, imported by the main chunk"));
    add(file);
  }
  for (const name of sheets) {
    const file = files.find((f) => f.name === name)!;
    console.log(row(file, "the stylesheet, loaded at once"));
    add(file);
  }
  console.log(`| (HTML, JavaScript and CSS loaded at once) | | ${sum.raw} (${kib(sum.raw)} KiB) | ${sum.gz} (${kib(sum.gz)} KiB) |`);
  for (const [name, from] of lazy) {
    const file = files.find((f) => f.name === name)!;
    const what = stem(name) === "TextEditor" ? "the text editor (TipTap, ProseMirror), loaded when a text is first edited" : `loaded later, by import() from ${from}`;
    console.log(row(file, what));
  }
  const fonts = files.filter((f) => f.name.endsWith(".woff2"));
  for (const font of fonts) console.log(row(font, "a font, fetched when a page uses it"));
  check(fonts.length === 4, "the build holds the four fonts", fonts.map((f) => f.name).join(", "));
  const other = files.filter((f) => !f.name.endsWith(".js") && !f.name.endsWith(".css") && !f.name.endsWith(".woff2") && f.name !== "index.html");
  console.log(`(also in the build, not counted: ${other.map((f) => `${f.name} ${f.bytes.length} bytes`).join(", ")})`);
  console.log("");
  console.log(`The entry holds ${entry.bytes.length} bytes of JavaScript; the lazy chunks together ${[...lazy.keys()].reduce((n, name) => n + files.find((f) => f.name === name)!.bytes.length, 0)} bytes.`);
} catch (error) {
  console.log(`the measurement stopped: ${(error as Error).message}`);
  if (error instanceof CouldNotRun) exitCode = 2;
  else check(false, "the measurement ran to its end", (error as Error).message);
} finally {
  for (const folder of folders) rmSync(folder, { recursive: true, force: true });
}

for (const line of results) console.log(line);
const total = results.length;
console.log(exitCode === 2 ? "RESULT: the measurement could not run to the end"
  : failed === 0 ? `RESULT: ${total} checks passed` : `RESULT: ${failed} of ${total} checks failed`);
process.exit(exitCode || (failed ? 1 : 0));
