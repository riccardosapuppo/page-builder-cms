// npm run check: every check of the repository, one after another, read
// from what each reporter says (tools/check/suites.ts has the list, with
// the floor each count must reach).
//
//   npm run check                     everything
//   npm run check -- --only rails,openapi
//   npm run check -- --skip start-stops
//   npm run check -- --list           the suites, by name
//
// Exits 0 when every suite passed, 1 when one failed, and 2 when none
// failed but some could not run here (no Ruby, no Chromium, a port taken):
// those are listed at the end, because a suite that did not run says
// nothing, and must never read as passed.
//
// Before and after the suites it checks that cms/public/assets is absent:
// a production build left there (assets:precompile) would be served in
// development instead of the stylesheets being edited.
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cmsRoot } from "./lib/commands.ts";
import { failed, passed, type Verdict } from "./check/readers.ts";
import { maxWorkers, SUITES, type Context, type Step } from "./check/suites.ts";

const args = process.argv.slice(2);
function names(flag: string): string[] | null {
  const at = args.indexOf(flag);
  if (at === -1) return null;
  return (args[at + 1] ?? "").split(",").map((n) => n.trim()).filter(Boolean);
}
const only = names("--only");
const skip = names("--skip") ?? [];
const known = new Set(SUITES.map((s) => s.name));
const unknown = [...(only ?? []), ...skip].filter((n) => !known.has(n));
const strayFlags = args.filter((a, i) => a.startsWith("--") && !["--only", "--skip", "--list"].includes(a) && !["--only", "--skip"].includes(args[i - 1] ?? ""));

if (args.includes("--list") || unknown.length || strayFlags.length) {
  if (unknown.length) console.log(`no suite called ${unknown.join(", ")}`);
  if (strayFlags.length) console.log(`unknown option ${strayFlags.join(" ")}`);
  for (const suite of SUITES) console.log(`${suite.name.padEnd(16)} ${suite.what}`);
  process.exit(unknown.length || strayFlags.length ? 2 : 0);
}

const say = (line: string) => console.log(`[check] ${line}`);

function step(command: string, commandArgs: string[], options: { cwd: string; env?: NodeJS.ProcessEnv }): Promise<Step> {
  return new Promise((done) => {
    say(`$ ${[command === process.execPath ? "node" : command, ...commandArgs].join(" ")}   (in ${options.cwd})`);
    const child = spawn(command, commandArgs, { cwd: options.cwd, env: options.env ?? process.env, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    const pass = (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      output += text;
      process.stdout.write(text);
    };
    child.stdout.on("data", pass);
    child.stderr.on("data", pass);
    child.on("error", (error) => {
      output += `\n${error.message}\n`;
      done({ code: -1, output });
    });
    child.on("close", (code) => done({ code, output }));
  });
}

const ASSETS = join(cmsRoot, "public", "assets");
function assetsAbsent(when: string): Verdict {
  return existsSync(ASSETS)
    ? failed("", `cms/public/assets exists ${when}: a production build left behind, which development would serve instead of the stylesheets being edited; remove it with ruby bin/rails assets:clobber, from cms/`)
    : passed("absent");
}

const tmp = mkdtempSync(join(tmpdir(), "pbc-check-"));
const ctx: Context = { say, step, tmp };
const results: Array<{ name: string; verdict: Verdict; seconds: number }> = [];
const selected = SUITES.filter((s) => (only ? only.includes(s.name) : true) && !skip.includes(s.name));

say(`${selected.length} suite(s), one after another; Vitest with at most ${maxWorkers()} worker(s) (CHECK_MAX_WORKERS sets it)`);
results.push({ name: "assets-before", verdict: assetsAbsent("before the run"), seconds: 0 });
try {
  for (const suite of selected) {
    say(`== ${suite.name}: ${suite.what}`);
    const started = Date.now();
    let verdict: Verdict;
    try {
      verdict = await suite.run(ctx);
    } catch (error) {
      verdict = failed("", `the suite stopped on an error: ${(error as Error).message}`);
    }
    const seconds = Math.round((Date.now() - started) / 100) / 10;
    results.push({ name: suite.name, verdict, seconds });
    say(`${suite.name}: ${verdict.status}${verdict.counts ? `, ${verdict.counts}` : ""}${verdict.why ? ` (${verdict.why})` : ""}, ${seconds} s`);
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
results.push({ name: "assets-after", verdict: assetsAbsent("after the run"), seconds: 0 });

console.log("");
say("summary");
for (const { name, verdict, seconds } of results) {
  const mark = verdict.status === "passed" ? "ok      " : verdict.status === "failed" ? "FAILED  " : "NOT RUN ";
  console.log(`  ${mark}${name.padEnd(16)} ${verdict.counts}${verdict.why ? `${verdict.counts ? "; " : ""}${verdict.why}` : ""}${seconds ? ` [${seconds} s]` : ""}`);
}
const failures = results.filter((r) => r.verdict.status === "failed");
const missing = results.filter((r) => r.verdict.status === "not-run");
if (missing.length) {
  console.log("");
  say(`NOT RUN, so nothing is known about these: ${missing.map((r) => r.name).join(", ")}`);
}
const ran = results.length - missing.length;
say(failures.length
  ? `RESULT: ${failures.length} of ${results.length} failed (${failures.map((r) => r.name).join(", ")})`
  : missing.length
    ? `RESULT: ${ran} passed, ${missing.length} could not run here`
    : `RESULT: all ${results.length} passed`);
process.exit(failures.length ? 1 : missing.length ? 2 : 0);
