// How npm run check reads each suite's result: the counts from what its
// reporter printed or wrote, never the exit code alone. Each reader returns
// a verdict and the counts it read, and fails when the summary is missing,
// when something failed, when the count is zero, or below the floor
// written in the suite's table (a runner that finds no tests exits 0).
//
// Pure functions of text, tested on samples in readers.test.ts.

export type Status = "passed" | "failed" | "not-run";

export interface Verdict {
  status: Status;
  // "371 tests", "214 files, 0 disagreements"
  counts: string;
  // Why it failed or did not run; empty when it passed.
  why: string;
}

export const passed = (counts: string): Verdict => ({ status: "passed", counts, why: "" });
export const failed = (counts: string, why: string): Verdict => ({ status: "failed", counts, why });
export const notRun = (why: string): Verdict => ({ status: "not-run", counts: "", why });

// Colours and other terminal escapes, which some tools print even into a
// pipe.
export function plain(text: string): string {
  return text.replace(/\u001b\[[0-9;?]*[A-Za-z]/g, "");
}

// The count must be there, above zero, and at least the floor.
export function floor(count: number, min: number, unit: string, counts: string): Verdict | null {
  if (count === 0) return failed(counts, `no ${unit} ran: a runner that finds nothing exits 0, so zero is a failure`);
  if (count < min) return failed(counts, `${count} ${unit}, fewer than the ${min} this suite had when its floor was written`);
  return null;
}

function last<T>(matches: IterableIterator<RegExpMatchArray>, pick: (m: RegExpMatchArray) => T): T | undefined {
  let found: T | undefined;
  for (const m of matches) found = pick(m);
  return found;
}

// --- Vitest -----------------------------------------------------------------

export interface VitestReport {
  numTotalTests: number;
  numPassedTests: number;
  numFailedTests: number;
  numPendingTests: number;
  numTodoTests: number;
  numFailedTestSuites: number;
  testResults: Array<{ name: string; status: string; message: string; assertionResults: Array<{ status: string }> }>;
}

// A worker that could not start: Vitest gives one 60 seconds (90 for the
// runner), fixed, and on a machine other programs keep at 100% the jsdom
// workers can miss it. No test ran in it; it says nothing about the code.
export const WORKER_START = /\[vitest-pool(?:-runner)?\]: (?:Failed to start \S+ worker|Timeout starting \S+ runner|Timeout waiting for worker to respond)/;

export type VitestReading = Verdict & { workersFailedToStart: boolean };

// report: the JSON reporter's file, or null when it was not written.
export function readVitest(report: VitestReport | null, output: string, exitCode: number | null, min: number): VitestReading {
  const text = plain(output);
  const startFailure = WORKER_START.test(text);
  if (!report) {
    return { ...(startFailure ? failed("", "Vitest's workers could not start, and it wrote no report") : failed("", `Vitest wrote no report (exit ${exitCode})`)), workersFailedToStart: startFailure };
  }
  const counts = `${report.numPassedTests} passed, ${report.numFailedTests} failed, ${report.numPendingTests + report.numTodoTests} skipped, of ${report.numTotalTests} tests in ${report.testResults.length} files`;
  // A test that failed is a failure whatever else happened: never retried.
  if (report.numFailedTests > 0) return { ...failed(counts, `${report.numFailedTests} test(s) failed`), workersFailedToStart: false };
  const brokenFiles = report.testResults.filter((file) => file.status === "failed" && !WORKER_START.test(file.message));
  if (brokenFiles.length) {
    return { ...failed(counts, `${brokenFiles.length} file(s) failed outside any test: ${brokenFiles.map((f) => f.message.split("\n")[0]).join("; ")}`), workersFailedToStart: false };
  }
  if (startFailure) return { ...failed(counts, "some of Vitest's workers could not start within its fixed time"), workersFailedToStart: true };
  if (exitCode !== 0) return { ...failed(counts, `Vitest exited ${exitCode} with every test passed: an error outside the tests, in its output above`), workersFailedToStart: false };
  return { ...(floor(report.numPassedTests, min, "tests", counts) ?? passed(counts)), workersFailedToStart: false };
}

// --- Playwright -------------------------------------------------------------

export interface PlaywrightReport {
  stats: { expected: number; unexpected: number; flaky: number; skipped: number };
  errors?: Array<{ message?: string }>;
}

export function readPlaywright(report: PlaywrightReport | null, exitCode: number | null, min: number): Verdict {
  if (!report) return failed("", `Playwright wrote no report (exit ${exitCode})`);
  const { expected, unexpected, flaky, skipped } = report.stats;
  const counts = `${expected} passed, ${unexpected} failed, ${flaky} flaky, ${skipped} skipped`;
  if (unexpected > 0) return failed(counts, `${unexpected} test(s) failed`);
  if (flaky > 0) return failed(counts, `${flaky} test(s) passed only on a retry`);
  if (report.errors?.length) return failed(counts, `errors outside the tests: ${report.errors.map((e) => (e.message ?? "").split("\n")[0]).join("; ")}`);
  if (exitCode !== 0) return failed(counts, `Playwright exited ${exitCode}`);
  return floor(expected, min, "tests", counts) ?? passed(counts);
}

// --- Minitest (Rails) -------------------------------------------------------

// "225 runs, 1074 assertions, 0 failures, 0 errors, 0 skips" and
// "openapi: 184 API response(s) checked against cms/openapi.yaml".
export function readMinitest(output: string, exitCode: number | null, minRuns: number, minOpenapi: number): Verdict {
  const text = plain(output);
  const summary = last(text.matchAll(/(\d+) runs, (\d+) assertions, (\d+) failures, (\d+) errors, (\d+) skips/g), (m) => m.slice(1, 6).map(Number));
  if (!summary) return failed("", `no minitest summary in the output (exit ${exitCode})`);
  const [runs, assertions, failures, errors, skips] = summary as [number, number, number, number, number];
  const openapi = last(text.matchAll(/openapi: (\d+) API response\(s\) checked/g), (m) => Number(m[1]));
  const counts = `${runs} runs, ${assertions} assertions, ${failures} failures, ${errors} errors, ${skips} skips; openapi ${openapi ?? "missing"}`;
  if (failures + errors > 0) return failed(counts, `${failures} failure(s) and ${errors} error(s)`);
  if (skips > 0) return failed(counts, `${skips} test(s) skipped: a skip checks nothing`);
  if (exitCode !== 0) return failed(counts, `exited ${exitCode}`);
  if (openapi === undefined) return failed(counts, "no OpenAPI count: the responses were not held to openapi.yaml");
  return floor(runs, minRuns, "runs", counts) ?? floor(openapi, minOpenapi, "API responses held to openapi.yaml", counts) ?? passed(counts);
}

// --- node --test, TAP reporter ----------------------------------------------

export function readNodeTap(output: string, exitCode: number | null, min: number): Verdict {
  const text = plain(output);
  const value = (name: string) => last(text.matchAll(new RegExp(`^# ${name} (\\d+)$`, "gm")), (m) => Number(m[1]));
  const [tests, pass, fail, skipped, cancelled, todo] = ["tests", "pass", "fail", "skipped", "cancelled", "todo"].map(value);
  if (tests === undefined || pass === undefined) return failed("", `no TAP summary in the output (exit ${exitCode})`);
  const counts = `${pass} passed, ${fail ?? 0} failed, ${(skipped ?? 0) + (todo ?? 0)} skipped, ${cancelled ?? 0} cancelled, of ${tests} tests`;
  if ((fail ?? 0) + (cancelled ?? 0) > 0) return failed(counts, `${(fail ?? 0) + (cancelled ?? 0)} test(s) failed or were cancelled`);
  if (exitCode !== 0) return failed(counts, `exited ${exitCode}`);
  return floor(pass, min, "tests", counts) ?? passed(counts);
}

// --- Tools that print a summary line ------------------------------------------

// Oxlint: "Found 0 warnings and 0 errors." then "Finished in 159ms on 211
// files with 133 rules using 8 threads."
export function readOxlint(output: string, exitCode: number | null, minFiles: number): Verdict {
  const text = plain(output);
  const found = /Found (\d+) warnings? and (\d+) errors?/.exec(text);
  const files = /on (\d+) files?/.exec(text);
  if (!found || !files) return failed("", `no Oxlint summary in the output (exit ${exitCode})`);
  const [warnings, errors, count] = [Number(found[1]), Number(found[2]), Number(files[1])];
  const counts = `${count} files, ${warnings} warnings, ${errors} errors`;
  if (warnings + errors > 0 || exitCode !== 0) return failed(counts, `${errors} error(s) and ${warnings} warning(s)`);
  return floor(count, minFiles, "files", counts) ?? passed(counts);
}

// The schema comparator: "RESULT: PASS (214 files, 0 disagreements, 0 exceptions)".
export function readCompare(output: string, exitCode: number | null, minFiles: number): Verdict {
  const match = /RESULT: (PASS|FAIL) \((\d+) files, (\d+) disagreements, (\d+) exceptions\)/.exec(plain(output));
  if (!match) return failed("", `no RESULT line in the output (exit ${exitCode})`);
  const [files, disagreements, exceptions] = [Number(match[2]), Number(match[3]), Number(match[4])];
  const counts = `${files} files, ${disagreements} disagreements, ${exceptions} exceptions`;
  if (match[1] !== "PASS" || disagreements + exceptions > 0 || exitCode !== 0) return failed(counts, "the two validators disagree, or one failed");
  return floor(files, minFiles, "files", counts) ?? passed(counts);
}

// "RESULT: 35 checks passed", "smoke: 6 checks passed", "planted 19, caught 19".
export function readChecks(output: string, exitCode: number | null, min: number, pattern = /(?:RESULT|smoke): (\d+) checks passed/): Verdict {
  const text = plain(output);
  const match = last(text.matchAll(new RegExp(pattern.source, "g")), (m) => Number(m[1]));
  if (match === undefined) {
    const failedLine = /(?:RESULT|smoke): (.*(?:failed|could not run).*)$/m.exec(text)?.[1];
    return failed("", failedLine ?? `no summary line in the output (exit ${exitCode})`);
  }
  const counts = `${match} checks`;
  if (exitCode !== 0) return failed(counts, `exited ${exitCode}`);
  return floor(match, min, "checks", counts) ?? passed(counts);
}

// The schema tools' "planted 19, caught 19".
export function readPlants(output: string, exitCode: number | null, min: number): Verdict {
  const match = /planted (\d+), caught (\d+)/.exec(plain(output));
  if (!match) return failed("", `no plant summary in the output (exit ${exitCode})`);
  const [planted, caught] = [Number(match[1]), Number(match[2])];
  const counts = `${caught} of ${planted} plants caught`;
  if (caught !== planted || exitCode !== 0) return failed(counts, `${planted - caught} plant(s) not caught`);
  return floor(planted, min, "plants", counts) ?? passed(counts);
}

// RuboCop: "108 files inspected, no offenses detected".
export function readRubocop(output: string, exitCode: number | null, minFiles: number): Verdict {
  const text = plain(output);
  const clean = /(\d+) files? inspected, no offenses detected/.exec(text);
  if (!clean) {
    const dirty = /(\d+) files? inspected, (\d+) offenses? detected/.exec(text);
    return failed(dirty ? `${dirty[1]} files, ${dirty[2]} offenses` : "", dirty ? `${dirty[2]} offense(s)` : `no RuboCop summary in the output (exit ${exitCode})`);
  }
  const files = Number(clean[1]);
  if (exitCode !== 0) return failed(`${files} files`, `exited ${exitCode}`);
  return floor(files, minFiles, "files", `${files} files, no offenses`) ?? passed(`${files} files, no offenses`);
}

// Brakeman: "Running 79 checks", then "Errors: 0" and "Security Warnings: 0".
export function readBrakeman(output: string, exitCode: number | null, minChecks: number): Verdict {
  const text = plain(output);
  const checks = /Running (\d+) checks/.exec(text);
  const errors = /^Errors: (\d+)$/m.exec(text);
  const warnings = /^Security Warnings: (\d+)$/m.exec(text);
  if (!checks || !errors || !warnings) {
    if (/not the latest|latest version/i.test(text)) return notRun("Brakeman could not confirm it is the latest version (it asks the network)");
    return failed("", `no Brakeman report in the output (exit ${exitCode})`);
  }
  const counts = `${checks[1]} checks, ${warnings[1]} warnings, ${errors[1]} errors`;
  if (Number(warnings[1]) + Number(errors[1]) > 0 || exitCode !== 0) return failed(counts, `${warnings[1]} warning(s) and ${errors[1]} error(s)`);
  return floor(Number(checks[1]), minChecks, "checks", counts) ?? passed(counts);
}

// The build's own check of its bundle: "bundle check: 1 JavaScript
// file(s), 371.7 KiB, parsed; eval() 0, Function() 0, new Function() 0,
// require() 0; validator in ...; fonts with their licence: 4/4".
export function readBuild(output: string, exitCode: number | null): Verdict {
  const line = /bundle check: .*$/m.exec(plain(output))?.[0];
  if (!line) return failed("", `no bundle check line in the output (exit ${exitCode})`);
  const forbidden = [...line.matchAll(/(eval\(\)|new Function\(\)|Function\(\)|require\(\)) (\d+)/g)].filter((m) => Number(m[2]) > 0);
  const fonts = /fonts with their licence: (\d+)\/(\d+)/.exec(line);
  const counts = line.replace(/^bundle check: /, "");
  if (forbidden.length) return failed(counts, `the bundle holds ${forbidden.map((m) => `${m[1]} ${m[2]}`).join(", ")}`);
  if (!fonts || fonts[1] !== fonts[2] || Number(fonts[2]) === 0) return failed(counts, "fonts without their licence, or none");
  if (exitCode !== 0) return failed(counts, `exited ${exitCode}`);
  return passed(counts);
}

// tsc prints nothing when it passes, and "error TS" lines when not; with
// no input at all it fails too (TS18003), so silence is never "nothing
// checked".
export function readTsc(output: string, exitCode: number | null, programs: number): Verdict {
  const errors = (plain(output).match(/error TS\d+/g) ?? []).length;
  if (errors || exitCode !== 0) return failed(`${errors} type errors`, `${errors} type error(s) (exit ${exitCode})`);
  return passed(`${programs} program(s), 0 type errors`);
}

// Redocly: "Your API description is valid", and no warnings.
export function readRedocly(output: string, exitCode: number | null): Verdict {
  const text = plain(output);
  const warnings = /You have (\d+) warnings?/.exec(text);
  if (!/Your API description is valid/.test(text) || exitCode !== 0) return failed("", `the API description is not valid (exit ${exitCode})`);
  if (warnings) return failed(`${warnings[1]} warnings`, `${warnings[1]} warning(s)`);
  return passed("valid, 0 warnings");
}

// A tool that says, in one line, that what it checks is as committed.
export function readLine(output: string, exitCode: number | null, pattern: RegExp, counts: (m: RegExpExecArray) => string): Verdict {
  const match = pattern.exec(plain(output));
  if (!match || exitCode !== 0) return failed(match ? counts(match) : "", `no "${pattern.source}" in the output (exit ${exitCode})`);
  return passed(counts(match));
}
