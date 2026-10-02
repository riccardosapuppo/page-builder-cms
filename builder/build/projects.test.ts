// Every test file under src/, build/ and test/ runs in the one Vitest
// project its name says: *.rails.test.* in "rails", *.contract.test.* in
// "contract", any other *.test.* in "unit". A file no project's pattern
// takes (a .tsx where a pattern lists only .ts) would never run, and no
// run would say so. Vitest itself lists what each project takes, so the
// check reads the configuration as Vitest reads it, not a copy of its
// patterns.
// @vitest-environment node
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { expect, test } from "vitest";
import { builderRoot } from "./paths.ts";

const TEST_FILE = /\.test\.(ts|tsx)$/;

function testFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...testFiles(path));
    else if (TEST_FILE.test(entry.name)) found.push(path);
  }
  return found;
}

const projectOf = (file: string): string => (file.includes(".rails.test.") ? "rails" : file.includes(".contract.test.") ? "contract" : "unit");
const name = (file: string): string => relative(builderRoot, file).replaceAll("\\", "/");

test("each test file runs in exactly the project its name says", { timeout: 120_000 }, () => {
  const onDisk = ["src", "build", "test"].flatMap((folder) => testFiles(join(builderRoot, folder))).map(name).sort();
  expect(onDisk.length).toBeGreaterThan(30);

  // Listing files starts no server: the rails project's global setup runs
  // only when its tests do.
  const vitest = join(builderRoot, "node_modules", "vitest", "vitest.mjs");
  // Without this run's own VITEST* variables, the listing is a run of its own.
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("VITEST")));
  const listed = spawnSync(process.execPath, [vitest, "list", "--filesOnly", "--json"], { cwd: builderRoot, env, encoding: "utf8", timeout: 100_000 });
  expect(listed.status, listed.stderr).toBe(0);
  const entries = JSON.parse(listed.stdout.slice(listed.stdout.indexOf("["))) as Array<{ file: string; projectName: string }>;

  const projects = new Map<string, string[]>();
  for (const entry of entries) {
    const file = name(entry.file);
    projects.set(file, [...(projects.get(file) ?? []), entry.projectName]);
  }
  expect(onDisk.map((file) => [file, projects.get(file) ?? []])).toEqual(onDisk.map((file) => [file, [projectOf(file)]]));
  // And Vitest runs nothing that is not one of them.
  expect([...projects.keys()].sort()).toEqual(onDisk);
});
