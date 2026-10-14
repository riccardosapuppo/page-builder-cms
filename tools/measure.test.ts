// node --test tools/measure.test.ts
//
// The parts of the measurement tools that decide what a number means,
// without running a server or a browser: the statistics, the wait for a
// quiet machine, the guard that reads the Node version and the name, the
// page the measurements run on, and the reading of a bundle's chunks. Each
// reader is shown to find what it should in a sample, and to fail on one
// where it should find nothing.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createServer, type AddressInfo } from "node:net";
import { availableParallelism } from "node:os";
import { join } from "node:path";
import { graph, dynamicImports, staticImports } from "./lib/bundle-graph.ts";
import { repoRoot } from "./lib/commands.ts";
import { bySelf, byTotal, reduce } from "./lib/cpu-profile.ts";
import { busyRange, cpuBusy, discardedWords, median, newTally, percentBusy, percentile, quietRun, runsFrom, summary, waitForQuiet } from "./lib/measure.ts";
import { countBlocks, fixtureDocument, headings, mediaIds, withHeadingText, withLibraryIds } from "./lib/measure-site.ts";
import { CouldNotRun } from "./lib/processes.ts";

const guard = createRequire(import.meta.url)("./measure.cjs") as {
  NAMES: string[];
  problemWith(version: string, range: string, name: string): string | null;
};

test("the median is the middle value, or the mean of the two middle ones, whatever the order", () => {
  assert.equal(median([5, 1, 3]), 3);
  assert.equal(median([4, 1, 3, 2]), 2.5);
  assert.equal(median([7]), 7);
  assert.throws(() => median([]), /median of nothing/);
});

test("a percentile is a value that was measured: the nearest rank", () => {
  const twenty = Array.from({ length: 20 }, (_, i) => i + 1);
  // The 95th of 20 values is the 19th; the 50th the 10th; the 100th the last.
  assert.equal(percentile(twenty, 95), 19);
  assert.equal(percentile(twenty, 50), 10);
  assert.equal(percentile(twenty, 100), 20);
  assert.equal(percentile([5, 1, 9], 95), 9);
  assert.equal(percentile([3], 95), 3);
  assert.throws(() => percentile([], 95), /percentile of nothing/);
  assert.throws(() => percentile([1], 0), /above 0/);
  assert.throws(() => percentile([1], 101), /at most 100/);
  // One slow value in a hundred moves the maximum and not the 95th.
  const hundred = [...Array.from({ length: 99 }, () => 16.7), 400];
  assert.deepEqual(summary(hundred), { n: 100, min: 16.7, median: 16.7, p95: 16.7, max: 400 });
});

test("the share of busy time is worked out from two readings of the counters, and a reading with no time between is 0", () => {
  assert.equal(percentBusy({ idle: 100, busy: 0 }, { idle: 190, busy: 10 }), 10);
  assert.equal(percentBusy({ idle: 5, busy: 5 }, { idle: 5, busy: 105 }), 100);
  assert.equal(percentBusy({ idle: 5, busy: 5 }, { idle: 105, busy: 5 }), 0);
  assert.equal(percentBusy({ idle: 5, busy: 5 }, { idle: 5, busy: 5 }), 0);
});

test("how busy the machine is reads between 0 and 100, and reads high while every processor spins", async () => {
  const idle = await cpuBusy(300);
  assert.ok(idle >= 0 && idle <= 100, `${idle}`);
  // A loop on every processor must read high whatever else the machine is
  // doing, or the counters are not being read.
  const until = Date.now() + 3000;
  const spinners = Array.from({ length: availableParallelism() }, () => spawn(process.execPath, ["-e", `while(Date.now()<${until}){}`], { stdio: "ignore" }));
  await new Promise((done) => setTimeout(done, 800));
  const busy = await cpuBusy(600);
  await Promise.all(spinners.map((child) => new Promise((done) => child.once("exit", done))));
  assert.ok(busy > 70, `a spinning process on every processor read ${busy.toFixed(1)}%`);
});

test("the wait for a quiet machine returns when two readings are under the limit, and gives up, as could-not-run, when none is", async () => {
  const before = { limit: process.env.MEASURE_QUIET_MAX, allow: process.env.MEASURE_ALLOW_BUSY };
  delete process.env.MEASURE_ALLOW_BUSY;
  try {
    const quiet = await waitForQuiet({ limit: 101, window: 50, within: 1000, pause: 10 });
    assert.equal(quiet.underLoad, false);
    assert.equal(quiet.readings.length, 2);
    // No reading is under a limit below zero: it must give up, and say so.
    await assert.rejects(waitForQuiet({ limit: -1, window: 20, within: 200, pause: 10 }),(error: Error) => error instanceof CouldNotRun && /did not get quiet/.test(error.message) && /nothing was measured/.test(error.message));
    // Unless it is told to go on: then it says the numbers were taken under load.
    process.env.MEASURE_ALLOW_BUSY = "1";
    const loaded = await waitForQuiet({ limit: -1, window: 20, within: 200, pause: 10 });
    assert.equal(loaded.underLoad, true);
  } finally {
    if (before.allow === undefined) delete process.env.MEASURE_ALLOW_BUSY;
    else process.env.MEASURE_ALLOW_BUSY = before.allow;
    if (before.limit === undefined) delete process.env.MEASURE_QUIET_MAX;
    else process.env.MEASURE_QUIET_MAX = before.limit;
  }
  assert.equal(busyRange([3.2, 0.4, 7.9]), "0 to 8%");
  assert.equal(busyRange([]), "not read");
});

// A reader that gives the readings one after another, as the load would.
const readings = (...values: number[]) => {
  const list = [...values];
  return async () => {
    const next = list.shift();
    if (next === undefined) throw new Error("the test ran out of readings");
    return next;
  };
};

test("a run on a quiet machine is kept, one the machine was busy after is thrown away and taken again with a new attempt number", async () => {
  const before = process.env.MEASURE_ALLOW_BUSY;
  delete process.env.MEASURE_ALLOW_BUSY;
  try {
    const tally = newTally();
    const seen: number[] = [];
    // Quiet before, quiet after: kept at once.
    const first = await quietRun(async (attempt) => { seen.push(attempt); return "a"; }, tally, { read: readings(2, 3) });
    assert.deepEqual([first.value, first.busy, first.loud, tally.attempts, tally.discarded], ["a", [2, 3], false, 1, []]);
    // Busy before: waits for a quiet reading without running the body. Busy
    // after: thrown away, and the body is run again as attempt 3.
    const second = await quietRun(async (attempt) => { seen.push(attempt); return `b${attempt}`; }, tally, { read: readings(40, 4, 30, 5, 6), pause: 1 });
    assert.deepEqual([second.value, second.busy, second.loud], ["b3", [5, 6], false]);
    assert.deepEqual(seen, [1, 2, 3]);
    assert.deepEqual(tally.discarded, [[4, 30]]);
    assert.equal(discardedWords(tally), "1 (load after: 30%)");
    assert.equal(discardedWords(newTally()), "none");
    // Quiet before every run and busy after every run: too many are thrown
    // away, and the measurement gives up as could-not-run.
    let reads = 0;
    await assert.rejects(quietRun(async () => 0, newTally(), { read: async () => (reads++ % 2 === 0 ? 5 : 50), maxDiscards: 2, pause: 1 }),
      (error: Error) => error instanceof CouldNotRun && /3 runs were thrown away/.test(error.message));
    // Busy before, always: it waits for the time given and gives up, without
    // running the body.
    process.env.MEASURE_QUIET_WAIT_MINUTES = "0.0005";
    let ran = 0;
    await assert.rejects(quietRun(async () => { ran += 1; return 0; }, newTally(), { read: async () => 50, pause: 5 }),
      (error: Error) => error instanceof CouldNotRun && /did not get quiet again/.test(error.message));
    assert.equal(ran, 0);
  } finally {
    delete process.env.MEASURE_QUIET_WAIT_MINUTES;
    if (before === undefined) delete process.env.MEASURE_ALLOW_BUSY;
    else process.env.MEASURE_ALLOW_BUSY = before;
  }
});

test("with MEASURE_ALLOW_BUSY a busy run is kept and says it was loud", async () => {
  const before = process.env.MEASURE_ALLOW_BUSY;
  process.env.MEASURE_ALLOW_BUSY = "1";
  try {
    const kept = await quietRun(async () => "x", newTally(), { read: readings(50, 60) });
    assert.deepEqual([kept.value, kept.busy, kept.loud], ["x", [50, 60], true]);
  } finally {
    if (before === undefined) delete process.env.MEASURE_ALLOW_BUSY;
    else process.env.MEASURE_ALLOW_BUSY = before;
  }
});

test("a number of runs from the environment is a whole number of 1 or more, or the run could not start", () => {
  process.env.MEASURE_RUNS_TEST = "7";
  assert.equal(runsFrom("MEASURE_RUNS_TEST", 3), 7);
  for (const bad of ["0", "-2", "2.5", "many", " 4"]) {
    process.env.MEASURE_RUNS_TEST = bad;
    assert.throws(() => runsFrom("MEASURE_RUNS_TEST", 3), (error: Error) => error instanceof CouldNotRun, bad);
  }
  delete process.env.MEASURE_RUNS_TEST;
  assert.equal(runsFrom("MEASURE_RUNS_TEST", 3), 3);
});

test("the guard of npm run measure:* refuses an old Node and an unknown name in a sentence, and takes Node 24 and the three names", () => {
  assert.deepEqual(guard.NAMES, ["server", "builder", "bundle"]);
  const old = guard.problemWith("22.13.0", ">=24", "server");
  assert.ok(old?.startsWith("This is Node 22.13.0, and the repository's tools need Node >=24"), old ?? "no sentence");
  assert.match(old!, /Nothing was measured\./);
  assert.doesNotMatch(old!, /installed or started/);
  const unknown = guard.problemWith("24.19.0", ">=24", "everything");
  assert.match(unknown ?? "", /Measure what\? One of server, builder, bundle/);
  assert.equal(guard.problemWith("24.19.0", ">=24", undefined as unknown as string)?.includes("Measure what?"), true);
  for (const name of guard.NAMES) assert.equal(guard.problemWith("24.19.0", ">=24", name), null);
});

test("node tools/measure.cjs with a name that is none of the three starts nothing and exits 2", () => {
  const ran = spawnSync(process.execPath, ["tools/measure.cjs", "everything"], { cwd: repoRoot, encoding: "utf8" });
  assert.equal(ran.status, 2, `${ran.stdout}${ran.stderr}`);
  assert.match(ran.stdout, /Measure what\?/);
});

// A port held by this test, which the measurement is told to use: it must
// say so and start nothing, exit 2, and not measure beside another server.
async function withPortHeld(body: (port: number) => Promise<void>): Promise<void> {
  const holder = createServer();
  await new Promise<void>((done, fail) => {
    holder.once("error", fail);
    holder.listen(0, "127.0.0.1", done);
  });
  try {
    await body((holder.address() as AddressInfo).port);
  } finally {
    await new Promise((done) => holder.close(done));
  }
}

test("a measurement whose port is held by another process starts nothing and exits 2", async () => {
  await withPortHeld(async (port) => {
    const server = spawnSync(process.execPath, ["tools/measure.cjs", "server"], { cwd: repoRoot, encoding: "utf8", env: { ...process.env, MEASURE_SERVER_PORT: String(port) } });
    assert.match(server.stdout, new RegExp(`port ${port} is already taken .*: nothing was started`));
    assert.equal(server.status, 2, `${server.stdout}${server.stderr}`);
    const builder = spawnSync(process.execPath, ["tools/measure.cjs", "builder"], { cwd: repoRoot, encoding: "utf8", env: { ...process.env, MEASURE_CMS_PORT: String(port) } });
    assert.match(builder.stdout, new RegExp(`port ${port}, for the CMS, is already taken .*: nothing was started`));
    assert.equal(builder.status, 2, `${builder.stdout}${builder.stderr}`);
  });
});

test("a port that is not a port number is refused before anything starts", () => {
  const ran = spawnSync(process.execPath, ["tools/measure.cjs", "server"], { cwd: repoRoot, encoding: "utf8", env: { ...process.env, MEASURE_SERVER_PORT: "seventy" } });
  assert.match(ran.stdout, /MEASURE_SERVER_PORT must be a port number, not "seventy": nothing was started/);
  assert.equal(ran.status, 2);
});

test("the page the measurements run on has 500 blocks, and its library ids replace the fixture's, all of them", () => {
  const document = fixtureDocument();
  assert.equal(countBlocks(document.sections), 500);
  const names = [...new Set(mediaIds(document))].sort();
  assert.equal(names.length, 9, names.join(", "));
  assert.ok(mediaIds(document).length > 100, `${mediaIds(document).length} references`);

  const library = new Map(names.map((name, i) => [name, `lib${i}`]));
  const mapped = withLibraryIds(document, library);
  assert.equal(countBlocks(mapped.sections), 500);
  assert.deepEqual([...new Set(mediaIds(mapped))].sort(), [...library.values()].sort());
  // Nothing else changed: put the fixture's ids back and the documents are the same.
  const back = new Map([...library].map(([name, id]) => [id, name]));
  assert.deepEqual(withLibraryIds(mapped, back), document);
  // An image the library does not have is an error, not an image left as it was.
  library.delete("hero-dawn");
  assert.throws(() => withLibraryIds(document, library), /no image for the fixture's "hero-dawn"/);
});

test("one heading changed changes that heading and nothing else, and an id that is no heading is refused", () => {
  const document = fixtureDocument();
  const list = headings(document);
  assert.ok(list.length >= 15, `${list.length} headings`);
  assert.ok(new Set(list.map((h) => h.section)).size >= 15, "the headings are spread over the sections");
  const target = list[10]!;
  const changed = withHeadingText(document, target.id, "A new heading");
  assert.notDeepEqual(changed, document);
  const flat = (value: unknown): string[] => JSON.stringify(value, null, 1).split("\n");
  const was = flat(document);
  const now = flat(changed);
  assert.equal(now.length, was.length);
  assert.equal(now.filter((line, i) => line !== was[i]).length, 1);
  assert.throws(() => withHeadingText(document, "s1", "x"), /0 headings have the id "s1"/);
  assert.throws(() => withHeadingText(document, "no-such-block", "x"), /0 headings/);
});

test("the bundle's chunks are read for what loads at once and what loads later, in double quotes and in backticks", () => {
  const chunks = [
    { name: "assets/index-AAAAAAAA.js", text: 'import{r as e}from"./shared-BBBBBBBB.js";const l=()=>import(`./TextEditor-CCCCCCCC.js`);export{l}' },
    { name: "assets/shared-BBBBBBBB.js", text: "export const r=1;" },
    { name: "assets/TextEditor-CCCCCCCC.js", text: 'import{r}from"./shared-BBBBBBBB.js";import("./upload-DDDDDDDD.js")' },
    { name: "assets/upload-DDDDDDDD.js", text: "export const u=1;" },
  ];
  assert.deepEqual(staticImports(chunks[0]!.text), ["shared-BBBBBBBB.js"]);
  assert.deepEqual(dynamicImports(chunks[0]!.text), ["TextEditor-CCCCCCCC.js"]);
  const { atOnce, lazy } = graph(chunks, "assets/index-AAAAAAAA.js");
  assert.deepEqual([...atOnce].sort(), ["assets/index-AAAAAAAA.js", "assets/shared-BBBBBBBB.js"]);
  assert.deepEqual([...lazy], [["assets/TextEditor-CCCCCCCC.js", "assets/index-AAAAAAAA.js"], ["assets/upload-DDDDDDDD.js", "assets/TextEditor-CCCCCCCC.js"]]);
});

test("a chunk the entry imports statically is loaded at once, not lazy: the fault the lazy check exists to find", () => {
  const planted = [
    { name: "assets/index-AAAAAAAA.js", text: 'import{e}from"./TextEditor-CCCCCCCC.js";' },
    { name: "assets/TextEditor-CCCCCCCC.js", text: "export const e=1;" },
  ];
  const { atOnce, lazy } = graph(planted, "assets/index-AAAAAAAA.js");
  assert.ok(atOnce.has("assets/TextEditor-CCCCCCCC.js"));
  assert.equal(lazy.size, 0);
  // And an entry that names nothing finds nothing, rather than passing.
  const none = graph([{ name: "assets/index-AAAAAAAA.js", text: "console.log(1)" }], "assets/index-AAAAAAAA.js");
  assert.equal(none.lazy.size, 0);
  assert.throws(() => graph([], "assets/index-AAAAAAAA.js"), /not among the chunks/);
});

test("a chunk only a lazy chunk imports statically loads later too, with it, as a provider's SDK brings its own", () => {
  const chunks = [
    { name: "assets/index-AAAAAAAA.js", text: 'const a=()=>import("./anthropic-EEEEEEEE.js"),o=()=>import("./openai-FFFFFFFF.js")' },
    { name: "assets/anthropic-EEEEEEEE.js", text: 'import{n}from"./node.browser-GGGGGGGG.js";' },
    { name: "assets/openai-FFFFFFFF.js", text: 'import{n}from"./node.browser-GGGGGGGG.js";import{m}from"./more-HHHHHHHH.js";' },
    { name: "assets/node.browser-GGGGGGGG.js", text: 'import{d}from"./deeper-IIIIIIII.js";export const n=1;' },
    { name: "assets/more-HHHHHHHH.js", text: "export const m=1;" },
    { name: "assets/deeper-IIIIIIII.js", text: "export const d=1;" },
  ];
  const { atOnce, lazy, along } = graph(chunks, "assets/index-AAAAAAAA.js");
  assert.deepEqual([...atOnce], ["assets/index-AAAAAAAA.js"]);
  assert.deepEqual([...lazy.keys()].sort(), ["assets/anthropic-EEEEEEEE.js", "assets/openai-FFFFFFFF.js"]);
  assert.deepEqual([...along.keys()].sort(), ["assets/deeper-IIIIIIII.js", "assets/more-HHHHHHHH.js", "assets/node.browser-GGGGGGGG.js"]);
  assert.equal(along.get("assets/deeper-IIIIIIII.js"), "assets/node.browser-GGGGGGGG.js");
  assert.equal(along.get("assets/more-HHHHHHHH.js"), "assets/openai-FFFFFFFF.js");
});

test("a profile is reduced to own time and total time per function, idle left out and a recursion counted once", () => {
  const frame = (functionName: string, lineNumber = 0) => ({ functionName, url: "http://x/assets/index-AAAA.js", lineNumber, columnNumber: 0 });
  // (root) > render > walk > walk (a recursion) > leaf; and (root) > (idle).
  const profile = {
    nodes: [
      { id: 1, callFrame: frame("(root)"), children: [2, 6] },
      { id: 2, callFrame: frame("render", 9), children: [3] },
      { id: 3, callFrame: frame("walk", 19), children: [4] },
      { id: 4, callFrame: frame("walk", 19), children: [5] },
      { id: 5, callFrame: frame("leaf", 29) },
      { id: 6, callFrame: frame("(idle)") },
    ],
    // render 1 ms, walk 2 ms (in the outer) and 3 ms (in the inner), leaf 4 ms, idle 100 ms.
    samples: [2, 3, 4, 5, 6],
    timeDeltas: [1000, 2000, 3000, 4000, 100_000],
  };
  const reduced = reduce(profile);
  assert.equal(reduced.total, 10);
  const get = (name: string) => reduced.hot.find((h) => h.name === name)!;
  assert.deepEqual([get("render").self, get("render").total], [1, 10]);
  // The two frames of walk are one function: 5 ms of its own, and 9 in it
  // and below (not 9 + 7 from counting the inner one again).
  assert.deepEqual([get("walk").self, get("walk").total], [5, 9]);
  assert.deepEqual([get("leaf").self, get("leaf").total], [4, 4]);
  assert.equal(get("render").where, "index-AAAA.js:10");
  assert.equal(reduced.hot.some((h) => h.name === "(idle)"), false);
  assert.deepEqual(bySelf(reduced, 2).map((h) => h.name), ["walk", "leaf"]);
  assert.deepEqual(byTotal(reduced, 3).map((h) => h.name), ["render", "walk", "leaf"]);
  assert.throws(() => reduce({ ...profile, timeDeltas: [1] }), /without a time/);
  assert.throws(() => reduce({ ...profile, samples: [99, 3, 4, 5, 6] }), /does not hold: 99/);
});

test("the root package.json names the three measurements, each through the guard, and each has its script", () => {
  const scripts = (JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8")) as { scripts: Record<string, string> }).scripts;
  for (const name of guard.NAMES) {
    assert.equal(scripts[`measure:${name}`], `node tools/measure.cjs ${name}`);
    assert.ok(existsSync(join(repoRoot, "tools", `measure-${name}.ts`)), `tools/measure-${name}.ts`);
  }
  assert.deepEqual(Object.keys(scripts).filter((s) => s.startsWith("measure:")).sort(), guard.NAMES.map((n) => `measure:${n}`).sort());
});
