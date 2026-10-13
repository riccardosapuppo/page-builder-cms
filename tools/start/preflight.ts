// What npm start checks before it installs or starts anything, with one
// sentence per problem, all of them at once: a reader who clones the
// repository on a machine that lacks two things learns both in one run.
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { builderRoot, cmsRoot, repoRoot, run, windows } from "../lib/commands.ts";
import { describeListeners, listeners } from "../lib/processes.ts";
import { missingPackages } from "./install.ts";

// The oldest Ruby the project is tested on: the lowest of the Rails job's
// matrix in .github/workflows/ci.yml (preflight.test.ts holds the two
// together).
export const RUBY_MINIMUM = "3.3";

const guard = createRequire(import.meta.url)("../start.cjs") as { satisfies(version: string, range: string): boolean };

export interface Port {
  port: number;
  // "the CMS", "the editor"
  what: string;
  // The variable that moves it.
  variable: string;
}

export interface Findings {
  // Each stops the start: nothing is installed or started.
  problems: string[];
  // What the installation will do, said before it does it.
  notes: string[];
  ruby?: string;
  bundler?: string;
}

function numbers(version: string): number[] {
  return version.split(".").map((part) => Number.parseInt(part, 10) || 0);
}

export function olderThan(version: string, minimum: string): boolean {
  const [a, b] = [numbers(version), numbers(minimum)];
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) < (b[i] ?? 0);
  }
  return false;
}

function engines(folder: string): string {
  return (JSON.parse(readFileSync(join(folder, "package.json"), "utf8")) as { engines: { node: string } }).engines.node;
}

export function checkNode(version = process.versions.node): string[] {
  const problems: string[] = [];
  // The root range was checked by tools/start.cjs before this file could
  // load; the editor's package declares its own.
  for (const [folder, what] of [[repoRoot, "the repository's tools (package.json)"], [builderRoot, "the editor (builder/package.json)"]] as const) {
    const range = engines(folder);
    if (!guard.satisfies(version, range)) problems.push(`This is Node ${version}, outside the versions ${what} declares, ${range}: install Node 24.`);
  }
  return problems;
}

export function checkRuby(): { problems: string[]; ruby?: string; bundler?: string } {
  const ruby = run("ruby", ["-e", "print RUBY_VERSION"], { cwd: cmsRoot });
  if (ruby.error) {
    const install = windows ? "RubyInstaller with its DevKit (https://rubyinstaller.org/)" : "your system's packages or a version manager";
    return { problems: [`Ruby is not on the PATH: install Ruby ${RUBY_MINIMUM} or later, from ${install}, then open a new terminal so the PATH is read again.`] };
  }
  if (ruby.status !== 0) {
    // A version manager's shim that does not have the version
    // cms/.ruby-version names says so here, and that is the sentence.
    const said = (ruby.stderr || ruby.stdout).trim().split(/\r?\n/)[0] ?? "";
    return { problems: [`Ruby is on the PATH but did not run in cms/ (exit ${ruby.status}): ${said}`] };
  }
  const version = ruby.stdout.trim();
  if (olderThan(version, RUBY_MINIMUM)) {
    return { problems: [`This is Ruby ${version}, and the CMS needs Ruby ${RUBY_MINIMUM} or later (the oldest its tests run on): install a newer Ruby and put it first on the PATH.`], ruby: version };
  }
  const bundler = run("ruby", ["-rbundler", "-e", "print Bundler::VERSION"], { cwd: cmsRoot });
  if (bundler.status !== 0) {
    return { problems: [`Ruby ${version} is here but Bundler is not: it ships with Ruby, so this Ruby is incomplete; reinstall it.`], ruby: version };
  }
  return { problems: [], ruby: version, bundler: bundler.stdout.trim() };
}

export function checkPorts(ports: Port[]): string[] {
  const problems: string[] = [];
  for (const { port, what, variable } of ports) {
    try {
      // Ask the system who listens: a test bind on 127.0.0.1
      // succeeds on Windows while another program holds 0.0.0.0.
      const found = listeners(port);
      if (found.length) problems.push(`Port ${port}, for ${what}, is taken by ${describeListeners(found)}: stop that program, or choose another port with ${variable}.`);
    } catch (error) {
      problems.push(`Cannot tell whether port ${port}, for ${what}, is free: ${(error as Error).message}.`);
    }
  }
  return problems;
}

export function checkPackages(): string[] {
  const notes: string[] = [];
  const missing = missingPackages(builderRoot);
  if (missing.length) notes.push(`The editor's packages are not all installed (${missing.length} to install): npm ci will install them into builder/node_modules.`);
  return notes;
}

// The site's database in development (cms/config/database.yml), which the
// seed fills only as db:prepare makes it.
export const DEVELOPMENT_DATABASE = join(cmsRoot, "storage", "development.sqlite3");

// --empty asks for a site with nothing in it, which only a new database can
// be: on one that exists the seed does not run again, and its pages stay.
// So the start stops there and says how to begin from nothing, deleting
// nothing; and where DATABASE_URL puts the database it cannot tell.
export function checkEmpty(empty: boolean, database = DEVELOPMENT_DATABASE, env: NodeJS.ProcessEnv = process.env): string[] {
  if (!empty) return [];
  if (env.DATABASE_URL) return ["--empty makes a site with nothing in it as it makes the database in cms/storage, and DATABASE_URL puts the database elsewhere: unset it to start from an empty site."];
  if (!existsSync(database)) return [];
  return ["--empty makes a site with nothing in it as it makes the database, and the database exists (cms/storage/development.sqlite3): its pages stay. To start from nothing, move the site's databases, cms/storage/development*.sqlite3*, somewhere else (keep them to go back to that site), then run npm start -- --empty again."];
}

export function preflight(ports: Port[], { empty = false }: { empty?: boolean } = {}): Findings {
  const ruby = checkRuby();
  const findings: Findings = {
    problems: [...checkNode(), ...ruby.problems, ...checkPorts(ports), ...checkEmpty(empty)],
    notes: checkPackages(),
  };
  if (ruby.ruby) findings.ruby = ruby.ruby;
  if (ruby.bundler) findings.bundler = ruby.bundler;
  return findings;
}
