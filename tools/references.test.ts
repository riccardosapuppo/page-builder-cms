// node --test tools/references.test.ts
//
// The repository stands on its own: no file it holds points a reader to a
// document it does not hold. A comment or a README that names a Markdown
// file missing here, that cites a section of a document by a name no
// file here bears, or that cites a rule by its number (from a list kept
// nowhere here) sends the reader nowhere; the reason is said in plain
// words, or the repository's own source is named instead (the schema,
// cms/openapi.yaml, docs/decisions/, design/NOTES.md). Every file git
// tracks is read; the matcher is shown finding each kind of reference
// first, and leaving the repository's own documents alone, so a tree that
// passes is one that was looked at.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { repoRoot } from "./lib/commands.ts";

// A Markdown file named anywhere on a line.
const MARKDOWN = /\b([\w.-]+\.md)\b/g;
// A section cited by its document: a name in capitals (README, NOTES.md)
// or a file's name (styles.css), then "section 4" or "§4".
const SECTION = /(?:^|[\s(/`'"])([A-Z][A-Z0-9_-]{2,}(?:\.[A-Za-z]+)?|[\w-]+\.[A-Za-z]{1,5}),? (?:section|§) ?[0-9]/g;
const NUMBERED_RULE = /\brule [0-9]+\b/i;

// The lines of a text that cite what `held` (the base names of the files
// the repository holds) does not name: a document cited without its
// extension is held when a file of that name is, whatever its extension.
export function references(text: string, held: ReadonlySet<string>): string[] {
  const stems = new Set([...held].map((name) => name.replace(/\..*$/, "")));
  const missing = (name: string) => (name.includes(".") ? !held.has(name) : !stems.has(name));
  return text.split(/\r?\n/).flatMap((line, index) => {
    const cited = [...line.matchAll(MARKDOWN), ...line.matchAll(SECTION)].map((match) => match[1] ?? "");
    return NUMBERED_RULE.test(line) || cited.some(missing) ? [`${index + 1}: ${line.trim()}`] : [];
  });
}

const BINARY = /\.(png|jpe?g|gif|webp|ico|woff2?|ttf|otf|pdf|zip|gz)$/i;

// The samples are put together here, so this file, read with the rest,
// cites nothing itself.
const section = (name: string, number: number) => `${name}, sec${"tion"} ${number}`;
const rule = (number: number) => `Ru${"le"} ${number}`;
const markdown = (name: string) => `${name}.m${"d"}`;

test("the matcher finds each kind of reference, and leaves the repository's own documents and plain words alone", () => {
  const held = new Set(["NOTES.md", "styles.css", "README.md"]);
  assert.equal(references(`// placed as one command (${section("GUIDE", 7)})`, held).length, 1);
  assert.equal(references(`see ${markdown("HANDBOOK")} for the reason`, held).length, 1);
  assert.equal(references(`// as ${section("handbook.txt", 2)} asks`, held).length, 1);
  assert.equal(references(`said as the CMS's: ${rule(33)}, who refused`, held).length, 1);
  assert.equal(references(`(design/${section("NOTES.md", 4)}) and design/${section("styles.css", 5)}`, held).length, 0);
  assert.equal(references(`see ${markdown("README")}, ${section("NOTES", 4)}`, held).length, 0);
  assert.equal(references(`the nesting rule, page > section > column > widget; "Section 3" for the third one; at the end of ${section("this", 3)}; 33 rules`, held).length, 0);
});

test("no tracked file cites a document the repository does not hold, or a rule by its number", () => {
  const files = execFileSync("git", ["ls-files", "-z"], { cwd: repoRoot, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }).split("\0").filter((file) => file !== "");
  assert.ok(files.length > 100, `git listed only ${files.length} files`);
  const held = new Set(files.map((file) => basename(file)));
  const found = files.filter((file) => !BINARY.test(file)).flatMap((file) => references(readFileSync(join(repoRoot, file), "utf8"), held).map((line) => `${file}:${line}`));
  assert.deepEqual(found, []);
});
