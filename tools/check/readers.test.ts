// node --test tools/check/readers.test.ts
//
// npm run check's readers on samples of what each tool prints or writes,
// with the cases that must fail next to the ones that pass: a summary
// missing, a count of zero, a count under the floor, a failure the exit
// code hides. The Vitest samples follow the JSON reporter's file and the
// messages of Vitest 5.0.2's pool (dist/chunks/index.*.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  readBrakeman, readBuild, readChecks, readCompare, readLine, readMinitest, readNodeTap, readOxlint, readPlants,
  readPlaywright, readRedocly, readRubocop, readTsc, readVitest, type VitestReport,
} from "./readers.ts";

function vitestReport(passed: number, failed = 0, files: Array<{ status: string; message: string }> = []): VitestReport {
  return {
    numTotalTests: passed + failed, numPassedTests: passed, numFailedTests: failed, numPendingTests: 0, numTodoTests: 0,
    numFailedTestSuites: files.filter((f) => f.status === "failed").length,
    testResults: [
      { name: "a.test.ts", status: failed ? "failed" : "passed", message: "", assertionResults: [] },
      ...files.map((f, i) => ({ name: `f${i}.test.ts`, assertionResults: [], ...f })),
    ],
  };
}

const START_FAILURE = [
  "⎯⎯⎯⎯⎯⎯ Unhandled Errors ⎯⎯⎯⎯⎯⎯",
  "Error: [vitest-pool]: Failed to start forks worker for test files src/editor/App.test.tsx.",
  "Caused by: Error: [vitest-pool-runner]: Timeout waiting for worker to respond",
].join("\n");

test("Vitest: passes on its counts, and fails on a failed test, a broken file, zero, the floor, or a hidden error", () => {
  assert.equal(readVitest(vitestReport(371), "", 0, 349).status, "passed");
  assert.equal(readVitest(vitestReport(371), "", 0, 349).counts, "371 passed, 0 failed, 0 skipped, of 371 tests in 1 files");
  assert.match(readVitest(vitestReport(370, 1), "", 1, 349).why, /1 test\(s\) failed/);
  assert.match(readVitest(vitestReport(371, 0, [{ status: "failed", message: "SyntaxError: Unexpected token" }]), "", 1, 349).why, /failed outside any test: SyntaxError/);
  assert.match(readVitest(vitestReport(0), "", 0, 349).why, /no tests ran/);
  assert.match(readVitest(vitestReport(300), "", 0, 349).why, /300 tests, fewer than the 349/);
  assert.match(readVitest(vitestReport(371), "Unhandled Rejection", 1, 349).why, /exited 1 with every test passed/);
  assert.match(readVitest(null, "", 1, 349).why, /wrote no report/);
});

test("Vitest: workers that could not start are told apart, never when a test also failed", () => {
  const onlyStart = readVitest(vitestReport(360, 0, [{ status: "failed", message: "Error: [vitest-pool]: Failed to start forks worker for test files x.test.tsx." }]), START_FAILURE, 1, 349);
  assert.equal(onlyStart.status, "failed");
  assert.equal(onlyStart.workersFailedToStart, true);
  const timeoutOnly = readVitest(vitestReport(360), "Error: [vitest-pool]: Timeout starting forks runner.", 1, 349);
  assert.equal(timeoutOnly.workersFailedToStart, true);
  // A real failure in the same run is a failure, not a busy machine.
  const both = readVitest(vitestReport(359, 1), START_FAILURE, 1, 349);
  assert.equal(both.workersFailedToStart, false);
  assert.match(both.why, /1 test\(s\) failed/);
  // A message that merely mentions workers is not the pool's.
  assert.equal(readVitest(vitestReport(360), "worker failed to start the server", 1, 349).workersFailedToStart, false);
});

test("Playwright: its stats, with failures, flakes, errors outside the tests and zero all failing", () => {
  const stats = (expected: number, unexpected = 0, flaky = 0) => ({ stats: { expected, unexpected, flaky, skipped: 0 } });
  assert.equal(readPlaywright(stats(4), 0, 4).status, "passed");
  assert.match(readPlaywright(stats(3, 1), 1, 4).why, /1 test\(s\) failed/);
  assert.match(readPlaywright(stats(4, 0, 1), 0, 4).why, /passed only on a retry/);
  assert.match(readPlaywright({ ...stats(0), errors: [{ message: "Error: No tests found" }] }, 1, 1).why, /No tests found/);
  assert.match(readPlaywright(stats(0), 0, 1).why, /no tests ran/);
  assert.match(readPlaywright(null, 1, 4).why, /wrote no report/);
});

const MINITEST = [
  "Finished in 49.2s",
  "[draft concurrency] 10 rounds: requests overlapping in 10, transactions overlapping in 10",
  "225 runs, 1074 assertions, 0 failures, 0 errors, 0 skips",
  "openapi: 184 API response(s) checked against cms/openapi.yaml",
].join("\n");

test("minitest: runs and the OpenAPI count, each against its floor", () => {
  assert.deepEqual(readMinitest(MINITEST, 0, 225, 184), { status: "passed", counts: "225 runs, 1074 assertions, 0 failures, 0 errors, 0 skips; openapi 184", why: "" });
  assert.match(readMinitest(MINITEST.replace("0 failures", "2 failures"), 1, 225, 184).why, /2 failure\(s\)/);
  assert.match(readMinitest(MINITEST.replace("0 skips", "1 skips"), 0, 225, 184).why, /skip checks nothing/);
  assert.match(readMinitest(MINITEST.replace(/^openapi.*$/m, ""), 0, 225, 184).why, /no OpenAPI count/);
  assert.match(readMinitest(MINITEST, 0, 300, 184).why, /fewer than the 300/);
  assert.match(readMinitest("Finished", 1, 225, 184).why, /no minitest summary/);
});

test("node --test: the TAP summary", () => {
  const tap = "# tests 22\n# suites 0\n# pass 22\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n";
  assert.equal(readNodeTap(tap, 0, 22).status, "passed");
  assert.match(readNodeTap(tap.replace("# fail 0", "# fail 1"), 1, 22).why, /1 test\(s\) failed/);
  assert.match(readNodeTap(tap.replaceAll(/# (tests|pass) 22/g, "# $1 0"), 0, 22).why, /no tests ran/);
  assert.match(readNodeTap("", 1, 22).why, /no TAP summary/);
});

test("the summary lines of Oxlint, the comparator, the plants, RuboCop and Brakeman", () => {
  assert.equal(readOxlint("Found 0 warnings and 0 errors.\nFinished in 159ms on 211 files with 133 rules using 8 threads.", 0, 145).status, "passed");
  assert.match(readOxlint("Found 0 warnings and 3 errors.\nFinished in 159ms on 211 files with 133 rules using 8 threads.", 1, 145).why, /3 error/);
  assert.match(readOxlint("Found 0 warnings and 0 errors.\nFinished in 1ms on 0 files with 133 rules using 8 threads.", 0, 145).why, /no files ran/);
  assert.equal(readCompare("RESULT: PASS (214 files, 0 disagreements, 0 exceptions)", 0, 207).status, "passed");
  assert.equal(readCompare("RESULT: FAIL (214 files, 1 disagreements, 0 exceptions)", 1, 207).status, "failed");
  assert.equal(readPlants("planted 19, caught 19; temporary folder removed\nRESULT: PASS", 0, 19).status, "passed");
  assert.match(readPlants("planted 19, caught 18", 1, 19).why, /1 plant\(s\) not caught/);
  assert.equal(readRubocop("108 files inspected, no offenses detected", 0, 105).status, "passed");
  assert.match(readRubocop("108 files inspected, 2 offenses detected", 1, 105).why, /2 offense/);
  const brakeman = "Running 79 checks in parallel...\n== Overview ==\n\nControllers: 12\nErrors: 0\nSecurity Warnings: 0\n";
  assert.equal(readBrakeman(brakeman, 0, 70).status, "passed");
  assert.match(readBrakeman(brakeman.replace("Security Warnings: 0", "Security Warnings: 1"), 3, 70).why, /1 warning/);
});

test("the build's bundle line, tsc, Redocly, the checks' own RESULT lines and a one-line confirmation", () => {
  const line = "bundle check: 1 JavaScript file(s), 371.7 KiB, parsed; eval() 0, Function() 0, new Function() 0, require() 0; validator in index.js; fonts with their licence: 4/4";
  assert.equal(readBuild(line, 0).status, "passed");
  assert.match(readBuild(line.replace("new Function() 0", "new Function() 1"), 1).why, /new Function\(\) 1/);
  assert.match(readBuild(line.replace("4/4", "3/4"), 1).why, /licence/);
  assert.equal(readTsc("", 0, 3).status, "passed");
  assert.match(readTsc("src/a.ts(1,1): error TS2322: Type 'x'", 2, 3).why, /1 type error/);
  assert.equal(readRedocly("\u001b[32mWoohoo! Your API description is valid. 🎉\u001b[39m", 0).status, "passed");
  assert.match(readRedocly("Your API description is valid.\nYou have 2 warnings.", 0).why, /2 warning/);
  assert.equal(readChecks("ok   x\nRESULT: 35 checks passed", 0, 35).status, "passed");
  assert.equal(readChecks("[start] smoke: 6 checks passed", 0, 6).status, "passed");
  assert.match(readChecks("RESULT: 2 of 35 checks failed", 1, 35).why, /2 of 35 checks failed/);
  assert.match(readChecks("RESULT: 30 checks passed", 0, 35).why, /fewer than the 35/);
  assert.equal(readLine("corpus is up to date: 214 files (24 valid, 190 invalid)", 0, /corpus is up to date: (\d+) files/, (m) => `${m[1]} files`).counts, "214 files");
  assert.equal(readLine("corpus is out of date", 1, /corpus is up to date: (\d+) files/, (m) => `${m[1]} files`).status, "failed");
});
