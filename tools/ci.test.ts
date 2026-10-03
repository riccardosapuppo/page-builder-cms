// node --test tools/ci.test.ts
//
// .github/workflows/ci.yml read as GitHub reads it, before it is pushed:
// it parses as YAML and holds no control character, every job has a time
// limit, and every command it runs exists where it runs it: the
// npm scripts in the package.json of the step's folder, the lockfile npm ci
// needs, the files node and bin/ are given. A workflow whose command does
// not exist fails on GitHub only after a push; here it fails first.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { repoRoot } from "./lib/commands.ts";

const FILE = join(repoRoot, ".github", "workflows", "ci.yml");
const source = readFileSync(FILE, "utf8");

interface Step {
  run?: string;
  uses?: string;
  with?: Record<string, unknown>;
  "working-directory"?: string;
  shell?: string;
}

interface Job {
  "timeout-minutes"?: number;
  defaults?: { run?: { "working-directory"?: string } };
  steps: Step[];
}

const workflow = parse(source) as { jobs: Record<string, Job> };

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
