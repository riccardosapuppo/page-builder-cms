// node --test tools/references.test.ts
//
// The repository stands on its own: no file it holds points a reader to a
// document it does not hold. The plans the work was made from are not in
// the repository, so a comment or a README that cites them (a section of
// one, a numbered rule of another) sends the reader nowhere; the reason is said
// in plain words, or the repository's own source is named instead (the
// schema, cms/openapi.yaml, docs/decisions/). Every file git tracks is
// read; the matcher is shown finding each kind of reference first, so a
// tree that passes is one that was looked at.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { repoRoot } from "./lib/commands.ts";

// The names of the documents the work was planned in, written in parts so
// this file does not name them itself, and a rule cited by its number.
const DOCUMENTS = ["PIA" + "NO", "PROM" + "PT", "STA" + "TO"];
const PATTERNS: readonly RegExp[] = [
  new RegExp(`\\b(${DOCUMENTS.join("|")})\\b`),
  new RegExp("\\b" + "rule" + " [0-9]+\\b", "i"),
];

export function references(text: string): string[] {
  return text.split(/\r?\n/).flatMap((line, index) => (PATTERNS.some((pattern) => pattern.test(line)) ? [`${index + 1}: ${line.trim()}`] : []));
}

const BINARY = /\.(png|jpe?g|gif|webp|ico|woff2?|ttf|otf|pdf|zip|gz)$/i;

test("the matcher finds each kind of reference, and leaves plain words alone", () => {
  assert.deepEqual(references(`// placed as one command (${DOCUMENTS[0]}, section 7)`).length, 1);
  assert.deepEqual(references(`// the ${DOCUMENTS[1]}'s rule`).length, 1);
  assert.deepEqual(references(`see ${DOCUMENTS[2]}.md`).length, 1);
  assert.deepEqual(references("said as the CMS's: Rule " + "33, who refused").length, 1);
  assert.deepEqual(references("the nesting rule, page > section > column > widget; a prompt; 33 rules").length, 0);
});

test("no tracked file cites a planning document or a numbered rule", () => {
  const files = execFileSync("git", ["ls-files", "-z"], { cwd: repoRoot, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }).split("\0").filter((file) => file !== "" && !BINARY.test(file));
  assert.ok(files.length > 100, `git listed only ${files.length} files`);
  const found = files.flatMap((file) => references(readFileSync(join(repoRoot, file), "utf8")).map((line) => `${file}:${line}`));
  assert.deepEqual(found, []);
});
