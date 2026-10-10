// node --test tools/lib/build-left-behind.test.ts
//
// The clearing of a build left in cms/public/assets that the production
// check and measure:server run before they precompile, on folders of the
// test's own: nothing there passes and removes nothing; a build left there
// is removed and said; and the two planted faults that leave it there (a
// removal that does nothing, one that fails as a file held open on Windows
// makes it fail) fail the check and stop the run, naming the folder and
// the command that clears it. tools/check-production.test.ts shows both
// tools calling it, on the real folder.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CLEARED, clearBuildLeftBehind } from "./build-left-behind.ts";

function within(body: (assets: string, checks: string[], check: (ok: boolean, what: string, detail?: string) => void) => void): void {
  const folder = mkdtempSync(join(tmpdir(), "pbc-build-left-"));
  try {
    const checks: string[] = [];
    body(join(folder, "assets"), checks, (ok, what, detail = "") => checks.push(`${ok ? "ok  " : "FAIL"} ${what}${detail ? `: ${detail}` : ""}`));
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
}

// A build as assets:precompile leaves it: the manifest and a fingerprinted
// stylesheet.
function plantBuild(assets: string): void {
  mkdirSync(assets, { recursive: true });
  writeFileSync(join(assets, ".manifest.json"), '{"tokens.css":{"digested_path":"tokens-5ta1eb11.css","integrity":null}}');
  writeFileSync(join(assets, "tokens-5ta1eb11.css"), ".site { }\r\n");
}

test("with no build there, the check passes and nothing is removed", () => {
  within((assets, checks, check) => {
    let removed = 0;
    clearBuildLeftBehind(assets, check, () => { removed += 1; });
    assert.deepEqual(checks, [`ok   ${CLEARED}`]);
    assert.equal(removed, 0);
  });
});

test("a build left there is removed, and the check says one was", () => {
  within((assets, checks, check) => {
    plantBuild(assets);
    clearBuildLeftBehind(assets, check);
    assert.equal(existsSync(assets), false);
    assert.deepEqual(checks, [`ok   ${CLEARED}: one was left there, and is removed`]);
  });
});

test("planted: a removal that leaves the build fails the check and stops the run before the precompile", () => {
  within((assets, checks, check) => {
    plantBuild(assets);
    assert.throws(() => clearBuildLeftBehind(assets, check, () => undefined), /holds a build left behind, which could not be removed; nothing was precompiled over it \(remove it with ruby bin\/rails assets:clobber, from cms\/\)/);
    assert.deepEqual(checks, [`FAIL ${CLEARED}: one was left there, and could not be removed`]);
    assert.equal(existsSync(join(assets, "tokens-5ta1eb11.css")), true);
  });
});

test("planted: a removal that fails, as on a file held open, fails the check with its reason", () => {
  within((assets, checks, check) => {
    plantBuild(assets);
    const busy = () => { throw new Error("EBUSY: resource busy or locked, unlink 'tokens-5ta1eb11.css'"); };
    assert.throws(() => clearBuildLeftBehind(assets, check, busy), /could not be removed: EBUSY: resource busy or locked/);
    assert.deepEqual(checks, [`FAIL ${CLEARED}: one was left there, and could not be removed: EBUSY: resource busy or locked, unlink 'tokens-5ta1eb11.css'`]);
  });
});
