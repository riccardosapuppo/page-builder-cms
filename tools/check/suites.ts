// Every suite npm run check runs, in the order it runs them: the quick
// ones first, then one heavy one at a time. Each says what it needs, so a
// suite that cannot run here says why and counts as not run (exit 2), and
// each reads its own reporter's counts against a floor: the number of
// tests or files it had when the floor was written. Raise a floor when a
// suite grows; never lower one to make a run pass.
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { availableParallelism, homedir } from "node:os";
import { join } from "node:path";
import { builderRoot, cmsRoot, repoRoot, run, windows } from "../lib/commands.ts";
import { describeListeners, listeners } from "../lib/processes.ts";
import { missingPackages } from "../start/install.ts";
import {
  failed, notRun, readBrakeman, readBuild, readChecks, readCompare, readLine, readMinitest, readNodeTap, readOxlint,
  readPlants, readPlaywright, readRedocly, readRubocop, readTsc, readVitest,
  type PlaywrightReport, type Verdict, type VitestReport,
} from "./readers.ts";

export interface Step {
  code: number | null;
  output: string;
}

export interface Context {
  // A line of the check's own.
  say(line: string): void;
  // Runs a command to its end, passing its output on as it comes, and
  // keeps it for the reader.
  step(command: string, args: string[], options: { cwd: string; env?: NodeJS.ProcessEnv }): Promise<Step>;
  // A folder for the reporters' files, deleted when the check ends.
  tmp: string;
}

export interface Suite {
  name: string;
  what: string;
  run(ctx: Context): Promise<Verdict>;
}

const schemaTools = join(repoRoot, "schema", "tools");
const node = process.execPath;
const vitest = join(builderRoot, "node_modules", "vitest", "vitest.mjs");
const tsc = (folder: string) => join(folder, "node_modules", "typescript", "bin", "tsc");

// --- What a suite needs ---------------------------------------------------------

function packages(folder: string, label: string): string | null {
  if (!existsSync(join(folder, "node_modules"))) return `${label} has no node_modules: npm ci${folder === repoRoot ? "" : ` --prefix ${label}`}`;
  const missing = missingPackages(folder);
  return missing.length ? `${label}'s node_modules differs from its lockfile (${missing.slice(0, 3).join(", ")}): npm ci${folder === repoRoot ? "" : ` --prefix ${label}`}` : null;
}

let rubyState: string | null | undefined;
function ruby(): string | null {
  if (rubyState !== undefined) return rubyState;
  const version = run("ruby", ["-v"]);
  if (version.error || version.status !== 0) return (rubyState = "Ruby is not on the PATH");
  const check = run("ruby", ["-S", "bundle", "check"], { cwd: cmsRoot });
  rubyState = check.status === 0 ? null : "the CMS's gems are not installed: npm run setup";
  return rubyState;
}

let chromiumState: string | null | undefined;
function chromium(): string | null {
  if (chromiumState !== undefined) return chromiumState;
  try {
    const playwright = createRequire(join(builderRoot, "package.json"))("playwright-core") as { chromium: { executablePath(): string } };
    const path = playwright.chromium.executablePath();
    chromiumState = existsSync(path) ? null : `Playwright's Chromium is not in its cache (${path}): npx playwright install chromium, from builder/`;
  } catch (error) {
    chromiumState = `Playwright cannot be loaded from builder/: ${(error as Error).message.split("\n")[0]}`;
  }
  return chromiumState;
}

function portNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  return raw ? Number(raw) : fallback;
}

function freePorts(ports: Array<[string, number]>): string | null {
  const taken: string[] = [];
  for (const [what, port] of ports) {
    try {
      const found = listeners(port);
      if (found.length) taken.push(`${port} (${what}) is held by ${describeListeners(found)}`);
    } catch (error) {
      taken.push(`cannot tell who listens on ${port}: ${(error as Error).message}`);
    }
  }
  return taken.length ? `port ${taken.join("; port ")}` : null;
}

const first = (...reasons: Array<string | null>) => reasons.find((r) => r !== null) ?? null;

// --- Vitest, robust to a busy machine -------------------------------------------

// Half the logical processors, from one to four: Vitest's own default
// (all but one) starts that many workers at once, and on a machine other
// programs already keep busy their start can miss Vitest's fixed 60 s.
// CHECK_MAX_WORKERS sets it.
export function maxWorkers(): number {
  const raw = process.env.CHECK_MAX_WORKERS;
  if (raw && /^[1-9][0-9]*$/.test(raw)) return Number(raw);
  return Math.max(1, Math.min(4, Math.floor(availableParallelism() / 2)));
}

// A test's own time limit, raised from Vitest's 5 s for tests that set
// none: with the unit project held to one processor beside two busy loops,
// a canvas test took 14.7 s and failed on the 5 s. A test that hangs still
// fails, 30 s later.
const TEST_TIMEOUT_MS = 30_000;

async function vitestOnce(ctx: Context, project: string, workers: number, min: number, label: string): Promise<ReturnType<typeof readVitest>> {
  const file = join(ctx.tmp, `vitest-${project}-${label}.json`);
  rmSync(file, { force: true });
  const step = await ctx.step(node, [vitest, "run", "--project", project, "--pool", "forks", "--maxWorkers", String(workers),
    "--testTimeout", String(TEST_TIMEOUT_MS), "--hookTimeout", String(TEST_TIMEOUT_MS),
    "--reporter=default", "--reporter=json", `--outputFile.json=${file}`], { cwd: builderRoot });
  const report = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) as VitestReport : null;
  return readVitest(report, step.output, step.code, min);
}

// One project, alone (the projects run one after another, not together).
// When the only trouble is workers that could not start, the project runs
// again with one worker; a test that failed is never run again. Workers
// that cannot start even one at a time mean the machine is too busy to say
// anything about these tests: not run, not passed.
export async function vitestProject(ctx: Context, project: string, min: number): Promise<Verdict> {
  const firstRun = await vitestOnce(ctx, project, maxWorkers(), min, "first");
  if (!firstRun.workersFailedToStart) return firstRun;
  ctx.say(`${project}: some workers could not start within Vitest's fixed time, and no test failed; running the project again with one worker`);
  const again = await vitestOnce(ctx, project, 1, min, "again");
  if (again.workersFailedToStart) return notRun("Vitest's workers could not start, even one at a time: the machine is too busy for this run to say anything about these tests");
  return { ...again, counts: `${again.counts} (run again with one worker: in the first run some workers could not start)` };
}

// --- Playwright ---------------------------------------------------------------

async function playwright(ctx: Context, script: string, min: number): Promise<Verdict> {
  const file = join(ctx.tmp, `playwright-${script.replace(/\W/g, "-")}.json`);
  rmSync(file, { force: true });
  const step = await ctx.step(...npmRun(script, ["--reporter=list,json"]), {
    cwd: builderRoot,
    env: { ...process.env, PLAYWRIGHT_JSON_OUTPUT_FILE: file, PLAYWRIGHT_JSON_OUTPUT_NAME: file },
  });
  const report = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) as PlaywrightReport : null;
  return readPlaywright(report, step.code, min);
}

// npm run <script> -- <args>, through npm's own script with this Node.
function npmRun(script: string, args: string[] = []): [string, string[]] {
  const fromNpm = process.env.npm_execpath;
  const cli = fromNpm && /npm-cli\.(c?js)$/.test(fromNpm) ? fromNpm
    : windows ? join(node, "..", "node_modules", "npm", "bin", "npm-cli.js") : join(node, "..", "..", "lib", "node_modules", "npm", "bin", "npm-cli.js");
  return [node, [cli, "run", script, ...(args.length ? ["--", ...args] : [])]];
}

function hasScript(folder: string, script: string): boolean {
  const scripts = (JSON.parse(readFileSync(join(folder, "package.json"), "utf8")) as { scripts?: Record<string, string> }).scripts ?? {};
  return script in scripts;
}

// --- The Rails suite's lock -------------------------------------------------------

// The Rails tests share one test database (cms/storage/test.sqlite3): two
// runs at once on one checkout would corrupt each other's transactions.
// The run takes cms/tmp/suite.lock while it uses it, and waits while
// another holds it.
const LOCK = join(cmsRoot, "tmp", "suite.lock");
let holdingLock = false;
process.on("exit", () => { if (holdingLock) rmSync(LOCK, { recursive: true, force: true }); });

async function withLock(ctx: Context, body: () => Promise<Verdict>): Promise<Verdict> {
  mkdirSync(join(cmsRoot, "tmp"), { recursive: true });
  const until = Date.now() + 30 * 60_000;
  for (;;) {
    try {
      mkdirSync(LOCK);
      holdingLock = true;
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      if (Date.now() > until) return notRun("another run held cms/tmp/suite.lock, the test database's lock, for 30 minutes");
      ctx.say("another run holds cms/tmp/suite.lock (the test database is one); waiting 30 s");
      await new Promise((done) => setTimeout(done, 30_000));
    }
  }
  try {
    return await body();
  } finally {
    rmSync(LOCK, { recursive: true, force: true });
    holdingLock = false;
  }
}

// --- The table --------------------------------------------------------------------


export const SUITES: Suite[] = [
  {
    name: "tools-types",
    what: "the repository's tools type-check (tsc, tsconfig.json)",
    async run(ctx) {
      const why = packages(repoRoot, "the repository root");
      if (why) return notRun(why);
      const step = await ctx.step(node, [tsc(repoRoot), "-p", "tsconfig.json"], { cwd: repoRoot });
      return readTsc(step.output, step.code, 1);
    },
  },
  {
    name: "tools-tests",
    what: "the tools' own tests: npm start's parts, this check's readers, the CI file, no reference to a document the repository does not hold (node --test)",
    async run(ctx) {
      const why = first(packages(repoRoot, "the repository root"), ruby());
      if (why) return notRun(why);
      const step = await ctx.step(node, ["--test", "--test-reporter=tap", "tools/**/*.test.ts"], { cwd: repoRoot });
      return readNodeTap(step.output, step.code, 124);
    },
  },
  {
    name: "editor-types",
    what: "the editor type-checks (three tsc programs)",
    async run(ctx) {
      const why = packages(builderRoot, "builder");
      if (why) return notRun(why);
      let output = "";
      for (const config of ["tsconfig.app.json", "tsconfig.test.json", "tsconfig.node.json"]) {
        const step = await ctx.step(node, [tsc(builderRoot), "-p", config], { cwd: builderRoot });
        output += step.output;
        if (step.code !== 0) return readTsc(output, step.code, 3);
      }
      return readTsc(output, 0, 3);
    },
  },
  {
    name: "editor-lint",
    what: "Oxlint on the editor, the fence around src/storage included",
    async run(ctx) {
      const why = packages(builderRoot, "builder");
      if (why) return notRun(why);
      const step = await ctx.step(...npmRun("lint"), { cwd: builderRoot });
      return readOxlint(step.output, step.code, 447);
    },
  },
  {
    name: "editor-unit",
    what: "the editor's unit tests (Vitest, project unit)",
    async run(ctx) {
      const why = packages(builderRoot, "builder");
      return why ? notRun(why) : vitestProject(ctx, "unit", 937);
    },
  },
  {
    name: "editor-contract",
    what: "the render contract, the editor's half (Vitest, project contract)",
    async run(ctx) {
      const why = packages(builderRoot, "builder");
      return why ? notRun(why) : vitestProject(ctx, "contract", 28);
    },
  },
  {
    name: "editor-build",
    what: "the editor builds, and its bundle passes its own check",
    async run(ctx) {
      const why = packages(builderRoot, "builder");
      if (why) return notRun(why);
      const step = await ctx.step(...npmRun("build"), { cwd: builderRoot });
      return readBuild(step.output, step.code);
    },
  },
  {
    name: "schema-compare",
    what: "the schema's two validators agree on the corpus, and on the example site's pages and the header and footer a site starts from",
    async run(ctx) {
      const why = first(packages(schemaTools, "schema/tools"), ruby());
      if (why) return notRun(why);
      const step = await ctx.step(...npmRun("compare"), { cwd: schemaTools });
      const corpus = readCompare(step.output, step.code, 283);
      if (corpus.status !== "passed") return corpus;
      const examples = await ctx.step(...npmRun("compare:examples"), { cwd: schemaTools });
      const pages = readCompare(examples.output, examples.code, 5);
      return pages.status === "passed" ? { ...pages, counts: `${corpus.counts}; the example site's pages and the starting header and footer: ${pages.counts}` } : pages;
    },
  },
  {
    name: "schema-corpus",
    what: "the corpus is what its generator writes",
    async run(ctx) {
      const why = packages(schemaTools, "schema/tools");
      if (why) return notRun(why);
      const step = await ctx.step(...npmRun("corpus:check"), { cwd: schemaTools });
      return readLine(step.output, step.code, /corpus is up to date: (\d+) files/, (m) => `${m[1]} files`);
    },
  },
  {
    name: "schema-lint",
    what: "the schema's lint, and the lint failing on its planted faults",
    async run(ctx) {
      const why = first(packages(schemaTools, "schema/tools"), ruby());
      if (why) return notRun(why);
      const lint = await ctx.step(...npmRun("lint"), { cwd: schemaTools });
      if (lint.code !== 0 || !/^RESULT: PASS$/m.test(lint.output)) return failed("", `the schema's lint did not pass (exit ${lint.code})`);
      const plants = await ctx.step(...npmRun("lint:plants"), { cwd: schemaTools });
      return readPlants(plants.output, plants.code, 19);
    },
  },
  {
    name: "schema-types",
    what: "the schema tools type-check",
    async run(ctx) {
      const why = packages(schemaTools, "schema/tools");
      if (why) return notRun(why);
      const step = await ctx.step(node, [tsc(schemaTools), "-p", "."], { cwd: schemaTools });
      return readTsc(step.output, step.code, 1);
    },
  },
  {
    name: "fixtures",
    what: "the 500-block contract fixture, the seed's images and the header's measured letters are what their generators write",
    async run(ctx) {
      const why = first(packages(repoRoot, "the repository root"), chromium());
      if (why) return notRun(why);
      const large = await ctx.step(node, ["tools/gen-contract-500.ts", "--check"], { cwd: repoRoot });
      const a = readLine(large.output, large.code, /is what the generator writes \((\d+) blocks\)/, (m) => `${m[1]} blocks`);
      if (a.status !== "passed") return a;
      const images = await ctx.step(node, ["tools/seed-images.ts", "--check"], { cwd: repoRoot });
      const b = readLine(images.output, images.code, /RESULT: (\d+) images, all as committed/, (m) => `${m[1]} images`);
      if (b.status !== "passed") return b;
      const metrics = await ctx.step(node, ["tools/header-metrics.ts", "--check"], { cwd: repoRoot });
      // Exit 2: this machine draws a script the face lacks with other fonts
      // than the file was measured with, whose widths only the machine that
      // measured can compare; all the rest compared and agreed.
      if (metrics.code === 2) {
        const said = /^header-metrics\.json (could not be compared here .*)$/m.exec(metrics.output)?.[1] ?? "could not be compared here";
        return notRun(`${a.counts} and ${b.counts} are as committed, but header-metrics.json ${said}`);
      }
      const c = readLine(metrics.output, metrics.code, /header-metrics\.json is what the fonts and styles give: (\d+) characters/, (m) => `${m[1]} header letters`);
      return c.status === "passed" ? { ...c, counts: `${a.counts}; ${b.counts}; ${c.counts}` } : c;
    },
  },
  {
    name: "openapi",
    what: "the API description lints clean (Redocly)",
    async run(ctx) {
      const why = packages(repoRoot, "the repository root");
      if (why) return notRun(why);
      const step = await ctx.step(...npmRun("lint:openapi"), { cwd: repoRoot });
      return readRedocly(step.output, step.code);
    },
  },
  {
    name: "rails",
    what: "the Rails tests, every API answer held to openapi.yaml (db:test:prepare, then test)",
    async run(ctx) {
      const why = ruby();
      if (why) return notRun(why);
      return withLock(ctx, async () => {
        const prepare = await ctx.step("ruby", ["bin/rails", "db:test:prepare"], { cwd: cmsRoot });
        if (prepare.code !== 0) return failed("", `db:test:prepare failed (exit ${prepare.code})`);
        const tests = await ctx.step("ruby", ["bin/rails", "test"], { cwd: cmsRoot });
        return readMinitest(tests.output, tests.code, 411, 374);
      });
    },
  },
  {
    name: "rubocop",
    what: "RuboCop on the CMS",
    async run(ctx) {
      const why = ruby();
      if (why) return notRun(why);
      const step = await ctx.step("ruby", ["bin/rubocop"], { cwd: cmsRoot });
      return readRubocop(step.output, step.code, 159);
    },
  },
  {
    name: "brakeman",
    what: "Brakeman on the CMS",
    async run(ctx) {
      const why = ruby();
      if (why) return notRun(why);
      const step = await ctx.step("ruby", ["bin/brakeman", "--no-pager"], { cwd: cmsRoot });
      return readBrakeman(step.output, step.code, 79);
    },
  },
  {
    name: "bundler-audit",
    what: "the CMS's gems against the Ruby advisory database",
    async run(ctx) {
      const why = ruby();
      if (why) return notRun(why);
      // Without its database the audit downloads one into the home
      // folder; the check does not write outside the repository.
      const database = join(homedir(), ".local", "share", "ruby-advisory-db");
      if (!existsSync(database)) return notRun(`bundler-audit has no advisory database here (${database}), and the check does not download one into the home folder; CI runs it`);
      const step = await ctx.step("ruby", ["bin/bundler-audit"], { cwd: cmsRoot });
      return readLine(step.output, step.code, /No vulnerabilities found/, () => "no vulnerabilities");
    },
  },
  {
    name: "editor-rails",
    what: "the editor against a CMS of its own: storage battery, the random-page agreement check, canvas parity (Vitest, project rails)",
    async run(ctx) {
      const why = first(packages(builderRoot, "builder"), ruby(), chromium(),
        freePorts([["the test CMS", portNumber("E2E_CMS_PORT", 3901)]]));
      // 84 on every platform; the test of cms/README.md's PowerShell example
      // runs only where Windows PowerShell is, and makes 85 there.
      return why ? notRun(why) : vitestProject(ctx, "rails", 85);
    },
  },
  {
    name: "editor-e2e",
    what: "the editor in Chromium against a CMS of its own (Playwright, npm run e2e)",
    async run(ctx) {
      const why = first(packages(builderRoot, "builder"), ruby(), chromium(),
        freePorts([["the test CMS", portNumber("E2E_CMS_PORT", 3901)], ["the test editor", portNumber("E2E_BUILDER_PORT", 4901)]]));
      return why ? notRun(why) : playwright(ctx, "e2e", 229);
    },
  },
  {
    name: "editor-browser",
    what: "the editor on the browser's own storage, IndexedDB in Chromium with no CMS: the storage battery, two tabs, giving up (Playwright, npm run e2e:browser)",
    async run(ctx) {
      if (!hasScript(builderRoot, "e2e:browser")) return failed("", "builder/package.json has no e2e:browser script");
      const why = first(packages(builderRoot, "builder"), chromium(),
        freePorts([["the editor on the browser's storage", portNumber("E2E_BROWSER_PORT", 4902)]]));
      return why ? notRun(why) : playwright(ctx, "e2e:browser", 78);
    },
  },
  {
    name: "editor-demo",
    what: "the browser demo, built for GitHub Pages and served as Pages serves it: its story in Chromium (Playwright, npm run e2e:demo)",
    async run(ctx) {
      if (!hasScript(builderRoot, "e2e:demo")) return failed("", "builder/package.json has no e2e:demo script");
      const why = first(packages(builderRoot, "builder"), chromium(),
        freePorts([["the demo, served as GitHub Pages serves it", portNumber("E2E_DEMO_PORT", 4903)]]));
      return why ? notRun(why) : playwright(ctx, "e2e:demo", 9);
    },
  },
  {
    name: "editor-a11y",
    what: "accessibility: the keyboard path, focus, axe, the shortcut window (Playwright, npm run check:a11y)",
    async run(ctx) {
      if (!hasScript(builderRoot, "check:a11y")) return failed("", "builder/package.json has no check:a11y script");
      const why = first(packages(builderRoot, "builder"), ruby(), chromium(),
        freePorts([["the test CMS", portNumber("E2E_CMS_PORT", 3901)], ["the test editor", portNumber("E2E_BUILDER_PORT", 4901)]]));
      return why ? notRun(why) : playwright(ctx, "check:a11y", 48);
    },
  },
  {
    name: "serving",
    what: "how the editor's shell, the demo's on GitHub Pages and the published pages are served (npm run check:serving)",
    async run(ctx) {
      // builder/'s e2e/serving/check-serving.ts, written with the editor's
      // publishing (the root is looked at too); it ends with "RESULT: <n>
      // checks passed", and exits 2 when its ports are taken.
      const folder = hasScript(repoRoot, "check:serving") ? repoRoot : hasScript(builderRoot, "check:serving") ? builderRoot : null;
      if (!folder) return failed("", "there is no check:serving script, in package.json or builder/package.json");
      const why = first(packages(folder, folder === repoRoot ? "the repository root" : "builder"), ruby(), chromium());
      if (why) return notRun(why);
      const step = await ctx.step(...npmRun("check:serving"), { cwd: folder });
      if (step.code === 2) return notRun(/^RESULT: .*$/m.exec(step.output)?.[0] ?? "it could not run");
      return readChecks(step.output, step.code, 60);
    },
  },
  {
    name: "production",
    what: "the CMS in production on 127.0.0.1, over HTTP and in Chromium (tools/check-production.ts)",
    async run(ctx) {
      const why = first(packages(repoRoot, "the repository root"), ruby(), chromium());
      if (why) return notRun(why);
      const step = await ctx.step(node, ["tools/check-production.ts"], { cwd: repoRoot });
      if (step.code === 2) return notRun(/^RESULT: .*$/m.exec(step.output)?.[0] ?? step.output.trim().split(/\r?\n/).slice(-1)[0] ?? "it could not run");
      // What the header's checks did not hold here, which the RESULT line
      // says after the count, is said beside it.
      const verdict = readChecks(step.output, step.code, 63);
      const notHeld = /^RESULT: \d+ checks passed; ([^\r\n]+)$/m.exec(step.output)?.[1];
      return verdict.status === "passed" && notHeld ? { ...verdict, counts: `${verdict.counts} (${notHeld})` } : verdict;
    },
  },
  {
    name: "start-smoke",
    what: "npm start in smoke mode: ready, answering, stopped, nothing changed outside the repository",
    async run(ctx) {
      const why = ruby();
      if (why) return notRun(why);
      const step = await ctx.step(node, ["tools/start.cjs", "--smoke"], { cwd: repoRoot });
      if (step.code === 2) return notRun(step.output.trim().split(/\r?\n/).filter((l) => l.startsWith("[start]")).slice(-2).join(" "));
      return readChecks(step.output, step.code, 7);
    },
  },
  {
    name: "start-stops",
    what: "npm start stops on a real Ctrl+C and when a child dies (tools/start/interrupt-check.ts)",
    async run(ctx) {
      const why = ruby();
      if (why) return notRun(why);
      const step = await ctx.step(node, ["tools/start/interrupt-check.ts"], { cwd: repoRoot });
      if (step.code === 2) return notRun(step.output.trim().split(/\r?\n/).slice(-1)[0] ?? "it could not run");
      return readChecks(step.output, step.code, 11);
    },
  },
];
