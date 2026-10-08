// node --test tools/ci.test.ts
//
// .github/workflows/ci.yml read as GitHub reads it, before it is pushed:
// it parses as YAML and holds no control character, every job has a time
// limit, and every command it runs exists where it runs it: the
// npm scripts in the package.json of the step's folder, the lockfile npm ci
// needs, the files node and bin/ are given. A workflow whose command does
// not exist fails on GitHub only after a push; here it fails first.
// The browser demo's deploy to GitHub Pages is held to running from main
// only while the repository is public, shown failing on copies of the
// workflow planted with each way of letting it through.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { repoRoot } from "./lib/commands.ts";

const FILE = join(repoRoot, ".github", "workflows", "ci.yml");
const source = readFileSync(FILE, "utf8");

interface Step {
  if?: string;
  run?: string;
  uses?: string;
  with?: Record<string, unknown>;
  "working-directory"?: string;
  shell?: string;
}

interface Job {
  if?: string;
  needs?: string | string[];
  permissions?: Record<string, string> | string;
  "timeout-minutes"?: number;
  defaults?: { run?: { "working-directory"?: string } };
  steps: Step[];
}

interface Workflow {
  on: Record<string, unknown>;
  permissions?: Record<string, string> | string;
  jobs: Record<string, Job>;
}

const workflow = parse(source) as Workflow;

function scripts(folder: string): Record<string, string> {
  const file = join(repoRoot, folder, "package.json");
  assert.ok(existsSync(file), `${folder}/package.json does not exist`);
  return (JSON.parse(readFileSync(file, "utf8")) as { scripts?: Record<string, string> }).scripts ?? {};
}

// Every command line a step runs, with the folder it runs in.
function commands(): Array<{ job: string; folder: string; line: string }> {
  const found: Array<{ job: string; folder: string; line: string }> = [];
  for (const [name, job] of Object.entries(workflow.jobs)) {
    for (const step of job.steps) {
      if (!step.run) continue;
      const folder = step["working-directory"] ?? job.defaults?.run?.["working-directory"] ?? ".";
      for (const raw of step.run.split("\n")) {
        const line = raw.trim();
        if (line) found.push({ job: name, folder, line });
      }
    }
  }
  return found;
}

test("ci.yml parses, holds no control character, and every job has a time limit", () => {
  assert.doesNotMatch(source, /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/);
  assert.ok(Object.keys(workflow.jobs).length >= 10, `only ${Object.keys(workflow.jobs).length} jobs`);
  for (const [name, job] of Object.entries(workflow.jobs)) {
    assert.equal(typeof job["timeout-minutes"], "number", `${name} has no timeout-minutes`);
  }
});

test("the jobs of stages 1 and 2 are all there", () => {
  for (const name of ["rails", "schema", "ruby-lint", "production", "builder", "builder-e2e", "contract", "tools", "start-guard", "start-smoke"]) {
    assert.ok(workflow.jobs[name], `no job ${name}`);
  }
  const text = JSON.stringify(workflow.jobs);
  for (const needed of ["npm run check:a11y", "npm run check:serving", "npm start -- --smoke", "npm run check:start-interrupt", "npm run test:contract"]) {
    assert.ok(text.includes(needed), `no step runs ${needed}`);
  }
});

// tools/readme-widget.test.ts reads the commit the README links and fails,
// not skips, when this checkout has not got it, which a shallow clone (the
// checkout action's default) never has.
test("the job that runs the tools' tests checks out the whole history", () => {
  const job = workflow.jobs.tools!;
  assert.ok(job.steps.some((step) => step.run === "npm run test:tools"), "the tools job does not run npm run test:tools");
  const checkout = job.steps.find((step) => step.uses?.startsWith("actions/checkout@"));
  assert.ok(checkout, "the tools job has no checkout step");
  assert.equal(checkout.with?.["fetch-depth"], 0, "the tools job's checkout is shallow, and tools/readme-widget.test.ts needs the linked commit");
});

test("every command a step runs exists in the folder it runs in", () => {
  let checked = 0;
  for (const { job, folder, line } of commands()) {
    const where = `${job}, in ${folder}: ${line}`;
    const npmRun = /^npm run ([\w:.-]+)/.exec(line);
    const npmOwn = /^npm (start|test)\b/.exec(line);
    if (npmRun || npmOwn) {
      const script = npmRun ? npmRun[1]! : npmOwn![1]!;
      assert.ok(script in scripts(folder), `${where}: there is no script "${script}"`);
      checked += 1;
    } else if (/^npm ci\b/.test(line)) {
      assert.ok(existsSync(join(repoRoot, folder, "package-lock.json")), `${where}: no package-lock.json for npm ci`);
      checked += 1;
    } else if (/^npx playwright /.test(line)) {
      const manifest = JSON.parse(readFileSync(join(repoRoot, folder, "package.json"), "utf8")) as { devDependencies?: Record<string, string> };
      assert.ok(Object.keys(manifest.devDependencies ?? {}).some((p) => p === "playwright" || p === "@playwright/test"), `${where}: Playwright is not a dependency here`);
      checked += 1;
    } else if (/^node --test /.test(line)) {
      // Every test file named, none of them a pattern Node would expand
      // to nothing.
      const files = line.split(/\s+/).slice(2);
      assert.ok(files.length > 0, `${where}: no test file named`);
      for (const file of files) assert.ok(existsSync(join(repoRoot, folder, file)), `${where}: ${file} does not exist`);
      checked += 1;
    } else if (/^node /.test(line)) {
      const file = line.split(/\s+/)[1]!;
      assert.ok(existsSync(join(repoRoot, folder, file)), `${where}: ${file} does not exist`);
      checked += 1;
    } else if (/^bin\//.test(line)) {
      const parts = line.split(/\s+/);
      assert.ok(existsSync(join(repoRoot, folder, parts[0]!)), `${where}: ${parts[0]} does not exist`);
      // A test file named on the line must exist too.
      for (const part of parts.slice(1).filter((p) => /\.rb$/.test(p))) assert.ok(existsSync(join(repoRoot, folder, part)), `${where}: ${part} does not exist`);
      checked += 1;
    }
  }
  assert.ok(checked >= 30, `only ${checked} commands checked`);
});

test("every folder a step or an action is pointed at exists", () => {
  for (const [name, job] of Object.entries(workflow.jobs)) {
    const folders = [job.defaults?.run?.["working-directory"], ...job.steps.flatMap((s) => [s["working-directory"], s.with?.["working-directory"] as string | undefined])];
    for (const folder of folders.filter((f): f is string => Boolean(f))) {
      assert.ok(existsSync(join(repoRoot, folder)), `${name}: ${folder} does not exist`);
    }
  }
});

// The browser demo's deploy to GitHub Pages, and what keeps it from
// running while the repository is private.
const PRIVATE_FALSE = "github.event.repository.private == false";
const VISIBILITY_PUBLIC = "github.event.repository.visibility == 'public'";
const FROM_MAIN = "github.ref == 'refs/heads/main'";

// The parts of a condition joined by && at its top level, or null when an
// || joins any at that level: then one side alone could let the job run.
function conjuncts(condition: string): string[] | null {
  const text = condition.trim().replace(/^\$\{\{([\s\S]*)\}\}$/, "$1").trim();
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (c === "(") depth += 1;
    else if (c === ")") depth -= 1;
    else if (depth === 0 && text.startsWith("||", i)) return null;
    else if (depth === 0 && text.startsWith("&&", i)) {
      parts.push(text.slice(start, i).trim());
      start = i + 2;
      i += 1;
    }
  }
  parts.push(text.slice(start).trim());
  return parts.map((part) => part.replace(/\s+/g, " "));
}

// What would let a deploy run from a private repository, or with more
// than it needs: nothing, for a workflow that keeps it in.
function deployProblems(flow: Workflow): string[] {
  const problems: string[] = [];
  const pages = flow.jobs.pages;
  if (!pages) return ["no pages job"];
  const guarded = (where: string, condition: string | undefined) => {
    const parts = condition === undefined ? [] : conjuncts(condition);
    if (parts === null) problems.push(`${where}: its condition has an || at its top level, so one side alone runs it`);
    else for (const needed of [PRIVATE_FALSE, VISIBILITY_PUBLIC, FROM_MAIN]) if (!parts.includes(needed)) problems.push(`${where}: its condition does not require ${needed}`);
  };
  guarded("the pages job", pages.if);
  const needs = typeof pages.needs === "string" ? [pages.needs] : pages.needs ?? [];
  if (!needs.includes("demo")) problems.push("the pages job does not wait for the demo job, which builds and tries what it deploys");
  if (!pages.steps.some((step) => step.uses?.startsWith("actions/deploy-pages@"))) problems.push("the pages job does not deploy with actions/deploy-pages");
  const upload = flow.jobs.demo?.steps.find((step) => step.uses?.startsWith("actions/upload-pages-artifact@"));
  if (!upload) problems.push("the demo job keeps no build for Pages");
  else guarded("the demo job's upload for Pages", upload.if);
  if (JSON.stringify(pages.permissions) !== JSON.stringify({ pages: "write", "id-token": "write" })) problems.push(`the pages job's permissions are ${JSON.stringify(pages.permissions)}, not pages and id-token write alone`);
  const writes = (permissions: Workflow["permissions"]) => typeof permissions === "string" ? permissions.includes("write") : Object.entries(permissions ?? {}).some(([name, level]) => (name === "pages" || name === "id-token") && level === "write");
  if (writes(flow.permissions)) problems.push("the workflow grants Pages or token writes to every job");
  for (const [name, job] of Object.entries(flow.jobs)) if (name !== "pages" && writes(job.permissions)) problems.push(`the ${name} job may write to Pages or ask for a token`);
  if (!("workflow_dispatch" in (flow.on ?? {}))) problems.push("the workflow cannot be run by hand (workflow_dispatch)");
  if (!JSON.stringify(flow.on?.push ?? {}).includes('"main"')) problems.push("the workflow does not run on a push to main");
  return problems;
}

test("the demo is built for Pages, served and tried in Chromium on every run", () => {
  const demo = workflow.jobs.demo;
  assert.ok(demo, "no demo job");
  assert.equal(typeof demo["timeout-minutes"], "number");
  assert.ok(demo.steps.some((step) => step.run === "npm run e2e:demo" && step["working-directory"] === "builder"), "the demo job does not run npm run e2e:demo in builder/");
  assert.equal(demo.if, undefined, "the demo job must run on every run, pull requests and private repositories included");
});

test("the deploy to Pages runs from main only while the repository is public, with its permissions on that job alone", () => {
  assert.deepEqual(deployProblems(workflow), []);
});

test("a copy of the workflow that would deploy from a private repository fails the guard", () => {
  const planted = (change: (flow: Workflow) => void): string[] => {
    const copy = structuredClone(workflow);
    change(copy);
    return deployProblems(copy);
  };
  const without = (condition: string, part: string) => condition.replace(` && ${part}`, "");
  assert.ok(planted((flow) => { delete flow.jobs.pages!.if; }).some((p) => p.includes(PRIVATE_FALSE)), "a pages job with no condition passed");
  assert.ok(planted((flow) => { flow.jobs.pages!.if = without(without(flow.jobs.pages!.if!, PRIVATE_FALSE), VISIBILITY_PUBLIC); }).some((p) => p.includes(PRIVATE_FALSE)), "a pages job that ignores the visibility passed");
  assert.ok(planted((flow) => { flow.jobs.pages!.if = flow.jobs.pages!.if!.replace(PRIVATE_FALSE, "!github.event.repository.private"); }).some((p) => p.includes(PRIVATE_FALSE)), "a negation, which a missing field passes, passed");
  assert.ok(planted((flow) => { flow.jobs.pages!.if = `${flow.jobs.pages!.if} || github.event_name == 'workflow_dispatch'`; }).some((p) => p.includes("||")), "an || around the guard passed");
  assert.ok(planted((flow) => { flow.permissions = { contents: "read", pages: "write", "id-token": "write" }; }).some((p) => p.includes("every job")), "Pages writes for every job passed");
  assert.ok(planted((flow) => { delete flow.jobs.demo!.steps.find((s) => s.uses?.startsWith("actions/upload-pages-artifact@"))!.if; }).some((p) => p.includes("upload")), "an upload kept from a private repository passed");
});
