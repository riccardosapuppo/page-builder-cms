// node --test tools/readme-measurements.test.ts
//
// The README's "Measurements" section is tied to the tools that produce its
// numbers: every command it gives exists (the npm script, the file it runs,
// the measurement a name picks), each of the three measurements is given by
// a command, every measurement script of package.json is in the README, and
// every number is dated. A README whose commands have been renamed, or from
// which the section or its commands have gone, is found here and not by a
// reader who runs it. The reader is shown a missing command, a missing
// section and a section with no commands, each failing, so that a README
// that stopped matching would not pass by finding nothing.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { repoRoot } from "./lib/commands.ts";
import { commandsIn, problems, section, undated } from "./lib/readme-commands.ts";

// A small repository: a package.json with two scripts and the files they run.
function scratch(): string {
  const root = mkdtempSync(join(tmpdir(), "pbc-readme-commands-"));
  mkdirSync(join(root, "tools"));
  writeFileSync(join(root, "package.json"), JSON.stringify({ scripts: { "measure:server": "node tools/measure.cjs server", "measure:other": "node tools/other.ts", "build": "vite build" } }));
  writeFileSync(join(root, "tools", "measure.cjs"), "");
  writeFileSync(join(root, "tools", "measure-server.ts"), "");
  return root;
}

test("a section is the text under its heading, up to the next heading, and a heading inside a code block ends nothing", () => {
  const markdown = ["# Title", "## One", "a", "```", "## not a heading", "```", "b", "## Two", "c"].join("\n");
  assert.equal(section(markdown, "One"), ["a", "```", "## not a heading", "```", "b"].join("\n"));
  assert.equal(section(markdown, "Two"), "c");
  assert.equal(section(markdown, "Three"), null);
});

test("the commands of a section are those that run npm or node, in code spans and in code blocks, with their settings", () => {
  const text = [
    "Run `npm run measure:server` for the server, or `MEASURE_RUNS_COLD=3 npm run measure:builder`.",
    "The file `tools/measure-bundle.ts` and the variable `MEASURE_ALLOW_BUSY` are no commands.",
    "```",
    "node tools/measure.cjs bundle",
    "ruby bin/rails server",
    "npm start -- --smoke",
    "npm starter",
    "```",
    "And `npm start` alone is one too.",
  ].join("\n");
  assert.deepEqual(commandsIn(text), ["npm run measure:server", "MEASURE_RUNS_COLD=3 npm run measure:builder", "node tools/measure.cjs bundle", "npm start -- --smoke", "npm start"]);
  assert.deepEqual(commandsIn("nothing to run here, `a span`"), []);
});

test("a command that exists is accepted, and each way one can be missing is named", () => {
  const root = scratch();
  try {
    assert.deepEqual(problems(["npm run measure:server", "MEASURE_RUNS_COLD=2 npm run measure:server", "node tools/measure.cjs server"], root), []);
    assert.match(problems(["npm run measure:gone"], root)[0] ?? "", /package\.json has no script "measure:gone"/);
    assert.match(problems(["npm run measure:other"], root)[0] ?? "", /tools\/other\.ts does not exist/);
    assert.match(problems(["node tools/measure.cjs builder"], root)[0] ?? "", /tools\/measure-builder\.ts does not exist/);
    assert.match(problems(["node tools/measure.cjs"], root)[0] ?? "", /tools\/measure-\(no name\)\.ts does not exist/);
    assert.match(problems(["node tools/missing.ts"], root)[0] ?? "", /tools\/missing\.ts does not exist/);
    assert.match(problems(["npm run absent"], root)[0] ?? "", /package\.json has no script "absent"/);
    // `npm start` is the script named start, and is missing as one is.
    assert.equal(problems(["npm start -- --smoke"], root)[0], 'npm start -- --smoke: package.json has no script "start"');
    writeFileSync(join(root, "package.json"), JSON.stringify({ scripts: { start: "node tools/measure.cjs server", "measure:server": "node tools/measure.cjs server", "measure:other": "node tools/other.ts", build: "vite build" } }));
    assert.deepEqual(problems(["npm start", "npm start -- --smoke", "NO_OPEN=1 npm start"], root), []);
    // A script that runs something else is not followed past its name.
    assert.deepEqual(problems(["npm run build"], root), []);
    assert.match(problems(["node"], root)[0] ?? "", /does not exist|not a command/);
    // A script that runs node with an option is the script of package.json
    // all the same, and a script of another folder is looked for there.
    mkdirSync(join(root, "builder"));
    writeFileSync(join(root, "builder", "package.json"), JSON.stringify({ scripts: { build: "vite build" } }));
    writeFileSync(join(root, "package.json"), JSON.stringify({ scripts: { "test:tools": "node --test \"tools/**/*.test.ts\"", "builder:build": "npm run build --prefix builder", "builder:gone": "npm run gone --prefix builder" } }));
    assert.deepEqual(problems(["npm run test:tools", "npm run builder:build"], root), []);
    assert.equal(problems(["npm run builder:gone"], root)[0], 'npm run builder:gone: builder/package.json has no script "gone"');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a subsection with numbers and no command, or no date, is named; one on what the numbers do not say may have neither", () => {
  const text = [
    "intro", "### Fine", "`npm run measure:server` on 4 October 2026",
    "### No command", "taken on 4 October 2026",
    "### No date", "`npm run measure:server` once",
    "### What the numbers do not say", "nothing to run",
  ].join("\n");
  assert.deepEqual(undated(text, /do not say/), ['the subsection "No command" gives no command', 'the subsection "No date" gives no date']);
  assert.deepEqual(undated("no subsection at all", /x/), []);
});

test("the README has a Measurements section whose commands exist, one for each measurement, each number dated", () => {
  const readme = readFileSync(join(repoRoot, "README.md"), "utf8");
  const text = section(readme, "Measurements");
  assert.ok(text, "README.md has no \"## Measurements\" section");
  const commands = commandsIn(text);
  assert.ok(commands.length >= 3, `only ${commands.length} commands found in the section: ${commands.join(" | ")}`);
  assert.deepEqual(problems(commands, repoRoot), []);

  const scripts = Object.keys((JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8")) as { scripts: Record<string, string> }).scripts).filter((s) => s.startsWith("measure:"));
  assert.ok(scripts.length >= 3, `package.json has ${scripts.length} measure: scripts`);
  for (const script of scripts) {
    assert.ok(commands.some((c) => c.replace(/^(?:[A-Z][A-Z0-9_]*=\S+\s+)+/, "").startsWith(`npm run ${script}`)), `the section gives no command for npm run ${script}`);
  }
  // Every subsection that gives numbers gives a command and a date; the
  // last one, on what the numbers do not say, gives none.
  assert.ok(text.split(/^### /m).length >= 5, "the section has fewer than four subsections");
  assert.deepEqual(undated(text, /do not say/), []);
  // Every table of numbers carries the machine and its load.
  assert.match(text, /virtual machine/);
  assert.match(text, /8 logical processors/);
  assert.match(text, /busy/);
});
