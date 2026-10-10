// node --test tools/lib/header-metrics-verdict.test.ts
//
// The verdict of tools/header-metrics.ts --check as the production check
// reads it: each of the three the tool gives, read back from the line the
// tool writes with the same module, with the exit code it comes with; and
// each way an output can fail to give one (no line, as when the tool
// stops on an error; a line that is not JSON; a verdict the tool does not
// give; one at odds with the exit code; other fonts named for a script the
// file does not hold; "face" naming none, "file" naming some), read as
// "unknown", which holds back every script.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readVerdict, verdictLine } from "./header-metrics-verdict.ts";

const SCRIPTS = ["Greek", "Cyrillic", "Hebrew", "Arabic", "CJK"];
const output = (sentence: string, line: string) => `${sentence}\n  /link/scripts/3/letters/x: the file has 1, the fonts and styles give 2\n${line}\n`;

test("the three verdicts the tool gives, read back with their exit codes", () => {
  const same = "header-metrics.json is what the fonts and styles give: 248 characters of the face";
  assert.deepEqual(readVerdict(0, output(same, verdictLine("file", [])), SCRIPTS), { verdict: "file", others: [], line: same });
  const other = "header-metrics.json could not be compared here for the letters of Arabic: this machine draws them with other fonts";
  assert.deepEqual(readVerdict(2, output(other, verdictLine("face", ["Arabic"])), SCRIPTS), { verdict: "face", others: ["Arabic"], line: other });
  const stale = "header-metrics.json is NOT what the fonts and styles give (1 difference(s)); run node tools/header-metrics.ts";
  assert.deepEqual(readVerdict(1, output(stale, verdictLine("neither", [])), SCRIPTS), { verdict: "neither", others: [], line: stale });
  // Not what this machine draws, on a machine that draws some scripts
  // with other fonts: those are named still.
  assert.deepEqual(readVerdict(1, output(stale, verdictLine("neither", ["Greek", "CJK"])), SCRIPTS).others, ["Greek", "CJK"]);
});

test("an output that gives no verdict that holds together is unknown, and holds back every script", () => {
  const cases: Array<[number | null, string, RegExp]> = [
    [1, "file:///tools/header-metrics.ts:132\nError: browserType.launch: Executable doesn't exist\n    at file:///tools/header-metrics.ts:132:32", /^Error: browserType\.launch.*\(no verdict line, exit 1\)$/],
    [0, 'header-metrics.json is what the fonts and styles give\nheader-metrics verdict: {"verdict":"file",', /a verdict line that is not JSON/],
    [0, 'header-metrics verdict: {"verdict":"fine","others":[]}', /a verdict the tool does not give/],
    [0, 'header-metrics verdict: {"verdict":"toString","others":[]}', /a verdict the tool does not give/],
    [0, verdictLine("face", ["Arabic"]), /"face" with another exit code/],
    [1, verdictLine("file", []), /"file" with another exit code/],
    [null, verdictLine("file", []), /"file" with another exit code, exit null/],
    [2, verdictLine("face", ["Latin"]), /not given as scripts the file holds/],
    [2, 'header-metrics verdict: {"verdict":"face"}', /not given as scripts the file holds/],
    [2, verdictLine("face", []), /"face" with 0 script\(s\)/],
    [0, verdictLine("file", ["Greek"]), /"file" with 1 script\(s\)/],
  ];
  for (const [code, text, why] of cases) {
    const read = readVerdict(code, text, SCRIPTS);
    assert.equal(read.verdict, "unknown", text);
    assert.deepEqual(read.others, SCRIPTS, text);
    assert.match(read.line, why, text);
  }
});

test("the last verdict line counts, and the sentence a person reads is kept apart from it", () => {
  const same = "header-metrics.json is what the fonts and styles give: 248 characters of the face";
  const text = `${verdictLine("face", ["Arabic"])}\n${same}\r\n${verdictLine("file", [])}\r\n`;
  assert.deepEqual(readVerdict(0, text, SCRIPTS), { verdict: "file", others: [], line: same });
});
