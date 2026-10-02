// node --test tools/start/browser.test.ts
//
// When npm start opens the browser and with what, checked without opening
// anything: the decision is a function of the arguments, the environment
// and whether the output is a terminal, and the launch is handed a
// recorder instead of a spawn.
import { test } from "node:test";
import assert from "node:assert/strict";
import { decideOpen, openBrowser, openCommand } from "./browser.ts";

const base = { argv: [] as string[], env: {} as NodeJS.ProcessEnv, terminal: true, smoke: false };

test("opens only in a terminal, with no flag, no NO_OPEN, no CI and no smoke run", () => {
  assert.deepEqual(decideOpen(base), { open: true, reason: "" });
  const cases: Array<[Partial<typeof base>, string]> = [
    [{ argv: ["--no-open"] }, "--no-open was given"],
    [{ env: { NO_OPEN: "1" } }, "NO_OPEN is set"],
    [{ env: { NO_OPEN: "true" } }, "NO_OPEN is set"],
    [{ env: { CI: "true" } }, "CI is set"],
    [{ smoke: true }, "this is a smoke run"],
    [{ terminal: false }, "the output is not a terminal"],
  ];
  for (const [change, reason] of cases) {
    assert.deepEqual(decideOpen({ ...base, ...change }), { open: false, reason }, JSON.stringify(change));
  }
  // Set to nothing, or to a word for no, the variables do not stop it.
  for (const value of ["", "0", "false", "no"]) {
    assert.equal(decideOpen({ ...base, env: { NO_OPEN: value, CI: value } }).open, true, `"${value}"`);
  }
});

test("the system's own opener for each platform, with the address as one argument", () => {
  const url = "http://127.0.0.1:4900/";
  assert.deepEqual(openCommand("win32", url), ["rundll32.exe", ["url.dll,FileProtocolHandler", url]]);
  assert.deepEqual(openCommand("darwin", url), ["open", [url]]);
  assert.deepEqual(openCommand("linux", url), ["xdg-open", [url]]);
});

test("a dry run launches nothing and says what it would run; a real one launches that", () => {
  const launched: Array<[string, string[]]> = [];
  const launch = (command: string, args: string[]) => { launched.push([command, args]); };
  const url = "http://127.0.0.1:4900/";
  assert.equal(openBrowser(url, { dryRun: true, platform: "win32", launch }),
    "browser: START_OPEN_DRY_RUN is set, so not run: rundll32.exe url.dll,FileProtocolHandler http://127.0.0.1:4900/");
  assert.deepEqual(launched, []);
  assert.equal(openBrowser(url, { dryRun: false, platform: "linux", launch }), `browser: opened ${url} (xdg-open ${url})`);
  assert.deepEqual(launched, [["xdg-open", [url]]]);
});
