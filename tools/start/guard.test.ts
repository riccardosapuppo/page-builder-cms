// node --test tools/start/guard.test.ts
//
// The version check of tools/start.cjs, which must run on any Node and so
// cannot import a library, held to semver, the implementation npm itself
// uses (rule 45: two implementations written together err together), on
// every engines range of the repository's package.json files and on
// versions from Node 10 to 30. The range is read from package.json at run
// time, so the guard and the declared requirement cannot drift apart.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import semver from "semver";
import { repoRoot } from "../lib/commands.ts";

const guard = createRequire(import.meta.url)("../start.cjs") as {
  satisfies(version: string, range: string): boolean;
  problemWith(version: string, range: string): string | null;
  requiredRange(): string;
};

const engines = (folder: string) => (JSON.parse(readFileSync(join(repoRoot, folder, "package.json"), "utf8")) as { engines: { node: string } }).engines.node;
const ranges = [engines("."), engines("builder"), engines("schema/tools"), ">=24", "^22.13.0 || ^24.0.0 || >=26.0.0", "^0.4.2", "^0.0.3", "22.13.0"];

function versions(): string[] {
  const list: string[] = [];
  for (let major = 0; major <= 30; major++) {
    for (const minor of [0, 1, 4, 12, 13, 14]) {
      for (const patch of [0, 1, 2, 3, 9]) list.push(`${major}.${minor}.${patch}`);
    }
  }
  return list;
}

test("the guard agrees with semver on every range and version", () => {
  let compared = 0;
  for (const range of ranges) {
    for (const version of versions()) {
      assert.equal(guard.satisfies(version, range), semver.satisfies(version, range), `${version} in ${range}`);
      compared += 1;
    }
  }
  assert.ok(compared > 1000, `only ${compared} comparisons`);
});

test("the guard reads the root range, refuses Node 22 with a sentence, and takes Node 24", () => {
  assert.equal(guard.requiredRange(), engines("."));
  const sentence = guard.problemWith("22.13.0", guard.requiredRange());
  assert.ok(sentence && sentence.startsWith("This is Node 22.13.0, and the repository's tools need Node >=24"), sentence ?? "no sentence");
  assert.match(sentence!, /Install Node 24/);
  assert.equal(guard.problemWith("24.0.0", guard.requiredRange()), null);
  assert.equal(guard.problemWith(process.versions.node, guard.requiredRange()), null);
});

test("a range written in a form the guard does not know is refused, not let through", () => {
  for (const range of ["~24.1.0", "24.x", ">24", "<=22", "24 - 26"]) {
    assert.throws(() => guard.satisfies("24.1.0", range), /cannot read the version range part/, range);
  }
  assert.throws(() => guard.satisfies("v24.1.0", ">=24"), /cannot read the version/);
});

test("the guard is plain old JavaScript: no syntax newer than function and var", () => {
  // What a Node older than 10 could not parse, and the guard must not hold.
  const source = readFileSync(join(repoRoot, "tools", "start.cjs"), "utf8").replace(/\/\/.*$/gm, "");
  for (const [what, pattern] of [["let/const", /\b(let|const)\s/], ["arrow functions", /=>/], ["template strings", /`/], ["import", /\bimport\b/], ["class", /\bclass\s/], ["?. or ??", /\?\.|\?\?/]] as const) {
    assert.doesNotMatch(source, pattern, `tools/start.cjs uses ${what}`);
  }
});
