// node --test tools/start/preflight.test.ts (Ruby on the PATH)
//
// The preflight's checks on this machine: a port held by a real listener
// is named with its program and process, a free one is not; Ruby's
// minimum is the lowest Ruby CI tests on; versions compare as numbers.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";
import { repoRoot } from "../lib/commands.ts";
import { checkNode, checkPorts, checkRuby, olderThan, RUBY_MINIMUM } from "./preflight.ts";

test("a port held by a listener is a problem that names the program and the process; once closed it is not", async () => {
  const server = createServer();
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const { port } = server.address() as { port: number };
  try {
    const [problem, ...rest] = checkPorts([{ port, what: "the CMS", variable: "CMS_PORT" }]);
    assert.equal(rest.length, 0);
    assert.ok(problem, "no problem reported for a port in use");
    assert.match(problem, new RegExp(`^Port ${port}, for the CMS, is taken by node(\\.exe)? \\(process ${process.pid}\\) on 127\\.0\\.0\\.1:${port}: stop that program, or choose another port with CMS_PORT\\.$`));
  } finally {
    await new Promise((done) => server.close(done));
  }
  assert.deepEqual(checkPorts([{ port, what: "the CMS", variable: "CMS_PORT" }]), []);
});

test("Ruby's minimum is the lowest Ruby of the Rails job in CI", () => {
  const ci = readFileSync(join(repoRoot, ".github", "workflows", "ci.yml"), "utf8");
  const matrix = /^\s*ruby:\s*\[([^\]]+)\]/m.exec(ci);
  assert.ok(matrix, "no ruby matrix in ci.yml");
  const lowest = matrix[1]!.split(",").map((v) => v.trim().replace(/"/g, "")).sort((a, b) => (olderThan(a, b) ? -1 : 1))[0];
  assert.equal(lowest, RUBY_MINIMUM);
});

test("versions compare as numbers, part by part", () => {
  assert.equal(olderThan("3.2.9", "3.3"), true);
  assert.equal(olderThan("3.3.0", "3.3"), false);
  assert.equal(olderThan("3.10.0", "3.3"), false);
  assert.equal(olderThan("2.7.8", "3.3"), true);
});

test("on this machine: this Node and this Ruby pass, a Node outside the editor's range does not", () => {
  assert.deepEqual(checkNode(), []);
  const [problem] = checkNode("25.1.0");
  assert.match(problem ?? "", /^This is Node 25\.1\.0, outside the versions the editor \(builder\/package\.json\) declares, /);
  const ruby = checkRuby();
  assert.deepEqual(ruby.problems, []);
  assert.ok(ruby.ruby && ruby.bundler, JSON.stringify(ruby));
});
