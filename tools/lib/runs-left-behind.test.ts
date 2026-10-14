// node --test tools/lib/runs-left-behind.test.ts
//
// The folders runs of the production check and of measure:server left in
// cms/tmp, deleted before a run makes its own, on a folder of the test's
// own: every folder a run of the same tool on the same port left goes, one
// named for this very process, its databases marked as production's,
// included; another tool's, another port's, and what is not a run's
// folder stay. tools/check-production.test.ts shows both tools doing it,
// on the real folder.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { clearRunsLeftBehind, runName } from "./runs-left-behind.ts";

function within(body: (tmp: string) => void): void {
  const folder = mkdtempSync(join(tmpdir(), "pbc-runs-left-"));
  try {
    body(join(folder, "tmp"));
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
}

// A run's folder as a run stopped before its end leaves it: its databases.
function plantRun(tmp: string, name: string): void {
  mkdirSync(join(tmp, name), { recursive: true });
  for (const database of ["production.sqlite3", "production_cache.sqlite3", "production_queue.sqlite3"]) writeFileSync(join(tmp, name, database), "");
}

test("a run is named for its tool, its port and its process", () => {
  assert.equal(runName("measure-server", 3902, 12092), "measure-server-3902-12092");
  assert.equal(runName("production-check", 3912), `production-check-3912-${process.pid}`);
});

test("every folder a run of the same tool on the same port left is deleted and said, one of this process's own name included", () => {
  within((tmp) => {
    const own = runName("measure-server", 3902);
    for (const name of [own, "measure-server-3902-12092", "measure-server-3902-160"]) plantRun(tmp, name);
    const said: string[] = [];
    const deleted = clearRunsLeftBehind(tmp, "measure-server", 3902, (line) => said.push(line));
    assert.deepEqual([...deleted].sort(), [own, "measure-server-3902-12092", "measure-server-3902-160"].sort());
    assert.deepEqual([...said].sort(), deleted.map((name) => `deleted what an earlier run left: cms/tmp/${name}`).sort());
    assert.equal(existsSync(join(tmp, own)), false);
    assert.deepEqual(readdirSync(tmp), []);
  });
});

test("another tool's folder, another port's, and what is no run's folder are kept", () => {
  within((tmp) => {
    const kept = ["production-check-3902-12092", "measure-server-3912-12092", "measure-server-3902-notes", "measure-server-12092", "e2e-3901-12092"];
    for (const name of kept) plantRun(tmp, name);
    writeFileSync(join(tmp, "restart.txt"), "");
    const said: string[] = [];
    assert.deepEqual(clearRunsLeftBehind(tmp, "measure-server", 3902, (line) => said.push(line)), []);
    assert.deepEqual(said, []);
    assert.deepEqual(readdirSync(tmp).sort(), [...kept, "restart.txt"].sort());
  });
});

test("with no cms/tmp at all, nothing is deleted", () => {
  within((tmp) => {
    assert.deepEqual(clearRunsLeftBehind(tmp, "production-check", 3902, () => assert.fail("nothing to say")), []);
    assert.equal(existsSync(tmp), false);
  });
});
