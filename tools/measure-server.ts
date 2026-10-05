// npm run measure:server
//
// What the CMS takes to answer a visit to a published page of 500 blocks
// (contract/fixtures/large-500.json), in production mode, over HTTP on
// 127.0.0.1:3902 (MEASURE_SERVER_PORT moves it), in each state its caches
// can be in:
// - the floor: the health check, /up, which touches no database and draws
//   nothing, so that what a request costs on this stack by itself is read
//   beside what the page costs;
// - drawn with no cache at all: the draft preview, which goes through the
//   same layout and partials and neither reads nor writes a fragment;
// - cold: Solid Cache emptied from outside on the running server, then one
//   visit, which draws the 500 blocks and writes the page's fragments;
// - the first visit after a start: the server stopped and started again
//   with Solid Cache emptied, then, a second after it answers /up, one
//   visit (MEASURE_RUNS_START of them, 8 by default, each on a server of
//   its own), which is what a deploy costs the first visitor: the same, and a new
//   process whose templates are not yet compiled and whose code has not
//   yet run;
// - warm: the whole page read from Solid Cache in one fragment;
// - one block changed: a heading edited, saved and published, then one
//   visit, which redraws that heading, its column, its section and the
//   page and reads the rest back;
// - the site style changed: the page's key changes, none of its blocks';
// - a 304: the validator sent back, no body.
// Each is timed twice, as the server says it (X-Runtime, the time the
// application took) and as the client sees it (until the last byte). How
// many fragments a visit reads, finds and writes is counted apart, as the
// store receives the calls (tools/lib/count-reuse.rb, run in production on
// the same databases), and the rows in Solid Cache are counted at every
// run.
//
// It waits for the machine to be quiet first, reads how busy it is before
// and after every run, and stops, exit 2, if it never gets quiet (see
// tools/lib/measure.ts). It repeats each state and reports the median and
// the spread, not one run.
//
// It leaves nothing behind: the three production databases, the Active
// Storage root and the uploaded pictures are in a folder under cms/tmp
// made for this run, the precompiled assets are removed with
// assets:clobber, the server's tree is stopped and its port shown closed
// before the folder is deleted. Ruby on the PATH, the CMS's gems installed.
//
// Exits 0 when it measured and its own checks passed, 1 when one of them
// failed, 2 when it could not run here (the port taken, no Ruby, a machine
// that never got quiet).
import { spawnSync, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import { Agent, request as httpRequest } from "node:http";
import { existsSync, mkdirSync, openSync, closeSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { banner, busyRange, discardedWords, kib, ms, newTally, quietRun, runsFrom, summary, waitForQuiet, type Summary, type Tally } from "./lib/measure.ts";
import { api, countBlocks, headings, publishLargePage, withHeadingText, type Document } from "./lib/measure-site.ts";
import { CouldNotRun, heldByTree, listeners, startTree, stopTree } from "./lib/processes.ts";

// The experimental-feature notice node:sqlite prints is the only warning
// this tool filters out.
process.removeAllListeners("warning");
process.on("warning", (warning) => {
  if (!/SQLite/.test(warning.message)) console.error(`${warning.name}: ${warning.message}`);
});
const { DatabaseSync } = await import("node:sqlite");

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const cms = join(root, "cms");
const PORT = ((raw) => {
  if (raw === undefined || raw === "") return 3902;
  const port = Number(raw);
  if (!/^[0-9]+$/.test(raw) || !Number.isInteger(port) || port <= 0 || port > 65535) {
    console.log(`MEASURE_SERVER_PORT must be a port number, not "${raw}": nothing was started`);
    process.exit(2);
  }
  return port;
})(process.env.MEASURE_SERVER_PORT);
const BASE = `http://127.0.0.1:${PORT}`;
const SLUG = "five-hundred-blocks";
const run = `measure-server-${process.pid}`;
const tmp = join(cms, "tmp", run);
const env: NodeJS.ProcessEnv = {
  ...process.env,
  RAILS_ENV: "production",
  SECRET_KEY_BASE_DUMMY: "1",
  CMS_FORCE_SSL: "0",
  // Production's own default log level is "info".
  RAILS_LOG_LEVEL: "info",
  DATABASE_URL: `sqlite3:tmp/${run}/production.sqlite3`,
  CACHE_DATABASE_URL: `sqlite3:tmp/${run}/production_cache.sqlite3`,
  QUEUE_DATABASE_URL: `sqlite3:tmp/${run}/production_queue.sqlite3`,
  CMS_STORAGE_ROOT: join(tmp, "storage"),
};
delete env.BINDING;
delete env.PORT;

const results: string[] = [];
let failed = 0;
function check(ok: boolean, what: string, detail = ""): void {
  if (!ok) failed += 1;
  const line = `${ok ? "ok  " : "FAIL"} ${what}${detail ? `: ${detail}` : ""}`;
  results.push(line);
  if (!ok) console.log(line);
}

function rails(args: string[], label: string): string {
  const r = spawnSync("ruby", ["bin/rails", ...args], { cwd: cms, env, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (r.error) throw new CouldNotRun(`${label}: Ruby could not be started (${r.error.message})`);
  const out = (r.stdout ?? "") + (r.stderr ?? "");
  if (r.status !== 0) {
    console.log(`${label} failed (exit ${r.status}):\n${out}`);
    throw new Error(`${label} failed`);
  }
  console.log(`${label}: done`);
  return out;
}

function server(args: string[], log: string): ChildProcess {
  const fd = openSync(log, "w");
  const child = startTree("ruby", ["bin/rails", "server", ...args], { cwd: cms, env, stdio: ["ignore", fd, fd] });
  closeSync(fd);
  return child;
}

// --- One visit, as the client sees it -----------------------------------------

interface Visit {
  status: number;
  // Until the headers arrive, and until the last byte, ms.
  head: number;
  total: number;
  // X-Runtime, ms: the time the application took.
  runtime: number | null;
  bytes: number;
  blocks: number;
  etag: string | null;
  hash: string;
  cacheControl: string | null;
  // Whether the visit went over a connection an earlier one had opened.
  reused: boolean;
}

// One connection kept open between the visits, with Nagle's algorithm off on
// this side, as a browser's has: Windows' delayed acknowledgements and
// Nagle's algorithm together hold a small write back for tens of
// milliseconds, which would be the measurement's, not the server's.
const connection = new Agent({ keepAlive: true, maxSockets: 1 });

function visit(path: string, headers: Record<string, string> = {}): Promise<Visit> {
  return new Promise((resolve, reject) => {
    const started = performance.now();
    const request = httpRequest(BASE + path, { agent: connection, headers: { accept: "text/html", ...headers } }, (response) => {
      const head = performance.now() - started;
      const chunks: Buffer[] = [];
      response.on("data", (chunk: Buffer) => chunks.push(chunk));
      response.on("error", reject);
      response.on("end", () => {
        const total = performance.now() - started;
        const body = Buffer.concat(chunks);
        const one = (name: string): string | null => {
          const value = response.headers[name];
          return Array.isArray(value) ? value.join(", ") : value ?? null;
        };
        const runtime = one("x-runtime");
        resolve({
          status: response.statusCode ?? 0, head, total,
          runtime: runtime === null ? null : Number(runtime) * 1000,
          bytes: body.length,
          blocks: (body.toString("utf8").match(/ data-block-id="/g) ?? []).length,
          etag: one("etag"),
          hash: createHash("sha256").update(body).digest("hex"),
          cacheControl: one("cache-control"),
          reused: request.reusedSocket,
        });
      });
    });
    request.on("socket", (socket) => socket.setNoDelay(true));
    request.on("error", reject);
    request.end();
  });
}

// --- The cache's rows, read from outside --------------------------------------

type Cache = { entries(): number; bytes(): number; keys(): string[]; clear(): void; close(): void };

const seen = (values: Iterable<unknown>): string => [...new Set(values)].join(", ");

// What the rows are, by the shape of their keys, with the digests and
// numbers taken out: "3 of views/.../<hex>".
function kinds(keys: string[]): string {
  const groups = new Map<string, number>();
  for (const key of keys) {
    const kind = key.replace(/[0-9a-f]{16,}/g, "<hex>").replace(/[0-9]+/g, "<n>").slice(0, 70);
    groups.set(kind, (groups.get(kind) ?? 0) + 1);
  }
  return [...groups].map(([kind, n]) => `${n} of ${kind}`).join("; ");
}

function openCache(): Cache {
  const db = new DatabaseSync(join(tmp, "production_cache.sqlite3"));
  db.exec("PRAGMA busy_timeout = 10000");
  return {
    keys: () => (db.prepare("SELECT key FROM solid_cache_entries").all() as Array<{ key: Uint8Array }>).map((row) => Buffer.from(row.key).toString("latin1")),
    // Fragments only: Solid Cache keeps a row of its own, the average size
    // of its entries, which is no fragment of a page.
    entries: () => Number((db.prepare("SELECT COUNT(*) AS n FROM solid_cache_entries WHERE instr(CAST(key AS TEXT), 'views/') > 0").get() as { n: number }).n),
    bytes: () => Number((db.prepare("SELECT COALESCE(SUM(byte_size), 0) AS n FROM solid_cache_entries WHERE instr(CAST(key AS TEXT), 'views/') > 0").get() as { n: number }).n),
    clear: () => { db.exec("DELETE FROM solid_cache_entries"); },
    close: () => db.close(),
  };
}

// --- A phase: the same visit, repeated, each run with its own set-up ------------

interface Phase {
  name: string;
  what: string;
  runs: Visit[];
  // The load before and after each run (a batch has one pair).
  busy: number[];
  // Rows in the cache before and after each run.
  rows: Array<[number, number]>;
  // The runs thrown away because the machine was busy.
  tally: Tally;
}

const phases: Phase[] = [];
let underLoad = false;

// A phase is `runs` visits in one state, each taken on a quiet machine
// (quietRun: one that is followed by a busy one is thrown away and taken
// again, with a new attempt number for a body that changes state). With
// perRun false the visits go in one batch, as a short stretch of requests
// the load is read around once.
async function phase(name: string, what: string, runs: number, body: (attempt: number) => Promise<Visit>, cache: Cache, perRun = true): Promise<Phase> {
  const done: Phase = { name, what, runs: [], busy: [], rows: [], tally: newTally() };
  console.log(`${name}: ${runs} runs`);
  const sample = async (attempt: number): Promise<{ visit: Visit; rows: [number, number] }> => {
    const before = cache.entries();
    const visit = await body(attempt);
    return { visit, rows: [before, cache.entries()] };
  };
  const keep = (taken: { visit: Visit; rows: [number, number] }): void => {
    done.runs.push(taken.visit);
    done.rows.push(taken.rows);
  };
  if (perRun) {
    for (let i = 0; i < runs; i++) {
      const kept = await quietRun(sample, done.tally, { say: (line) => console.log(`${name}: ${line}`) });
      keep(kept.value);
      done.busy.push(...kept.busy);
      underLoad ||= kept.loud;
    }
  } else {
    const kept = await quietRun(async (attempt) => {
      const batch: Array<{ visit: Visit; rows: [number, number] }> = [];
      for (let i = 0; i < runs; i++) batch.push(await sample(attempt));
      return batch;
    }, done.tally, { say: (line) => console.log(`${name}: ${line}`) });
    kept.value.forEach(keep);
    done.busy.push(...kept.busy);
    underLoad ||= kept.loud;
  }
  phases.push(done);
  return done;
}

interface SiteStyle {
  palette: Record<string, string>;
  typeScale: string;
  choices: { palette: Record<string, Array<{ color: string }>>; typeScales: Array<{ name: string }> };
}

const column = (phase: Phase, pick: (v: Visit) => number | null): Summary | null => {
  const values = phase.runs.map(pick).filter((v): v is number => v !== null);
  return values.length === phase.runs.length ? summary(values) : null;
};

const cell = (s: Summary | null): string => (s ? `${ms(s.median)} (${ms(s.min)} to ${ms(s.max)})` : "n/a");

// --- The run ------------------------------------------------------------------

const stage = { precompiled: false };
let main: ChildProcess | undefined;
let cache: Cache | undefined;
let exitCode = 0;
let counts: Array<Record<string, unknown>> = [];
let fact = "";

try {
  const taken = listeners(PORT);
  if (taken.length) throw new CouldNotRun(`port ${PORT} is already taken (${taken.map((l) => `${l.address}, process ${l.pid}`).join("; ")}): nothing was started`);

  console.log(banner("measure-server"));
  const quiet = await waitForQuiet({ say: (line) => console.log(line) });
  console.log(`the machine was ${quiet.readings.map((r) => `${r.toFixed(0)}%`).join(" then ")} busy before the run (waited ${quiet.waited.toFixed(0)} s)`);
  underLoad ||= quiet.underLoad;

  mkdirSync(tmp, { recursive: true });
  rails(["assets:precompile"], "assets:precompile");
  stage.precompiled = true;
  rails(["db:create", "db:schema:load"], `databases in cms/tmp/${run}`);

  // The server, started and waited for until it answers /up. Called for the
  // first start and for each start of the "first visit after a start" runs.
  let starts = 0;
  const startServer = async (): Promise<ChildProcess> => {
    const child = server(["-p", String(PORT), "-P", join(tmp, "server.pid")], join(tmp, `server-${++starts}.log`));
    main = child;
    let up = false;
    for (let i = 0; i < 240 && !up; i++) {
      if (child.exitCode !== null) break;
      up = await fetch(`${BASE}/up`).then((r) => r.status === 200, () => false);
      if (!up) await new Promise((done) => setTimeout(done, 500));
    }
    if (!up) throw new Error(child.exitCode !== null ? `the server exited (${child.exitCode}) before it answered` : "the server did not answer within 120 s");
    return child;
  };
  const started = await startServer();
  const owners = listeners(PORT);
  check(heldByTree(owners, started.pid, `127.0.0.1:${PORT}`),
    `the server listens on 127.0.0.1:${PORT} only, and it is the process started here`, owners.map((l) => `${l.address} (process ${l.pid})`).join(", "));

  const page = await publishLargePage(BASE, SLUG);
  cache = openCache();
  const path = `/${SLUG}`;
  const edits = headings(page.document);
  check(edits.length >= 15, `the page has headings to edit, in several sections`, `${edits.length} headings in ${new Set(edits.map((e) => e.section)).size} sections`);

  // --- The counts, apart from the timing -------------------------------------
  const out = rails(["runner", "../tools/lib/count-reuse.rb", SLUG, edits[0]!.id], "counting what the cache reads and writes");
  counts = out.split(/\r?\n/).filter((l) => l.startsWith("COUNT ")).map((l) => JSON.parse(l.slice(6)) as Record<string, unknown>);
  fact = out.split(/\r?\n/).find((l) => l.startsWith("FACT "))?.slice(5) ?? "";
  check(counts.length === 5, "the counting run reported its five visits", `${counts.length}`);
  // The counting run left the page edited and the site style changed, and
  // the cache holding what those visits wrote: the timed phases start from
  // a state they make themselves.
  let document: Document = (await api(BASE, "GET", `/api/pages/${page.id}/draft`)).document as Document;

  // Warm-up: the first public requests compile the templates and run what
  // is loaded lazily.
  for (let i = 0; i < 3; i++) await visit(path);

  // --- The floor: what any answer costs on this stack -------------------------------
  // The health check, which touches no database and draws nothing: the
  // client's time for it is Puma, the loopback and the client themselves.
  const floor = await phase("floor", "the health check, /up: no database, no view", runsFrom("MEASURE_RUNS_FLOOR", 100), () => visit("/up"), cache, false);
  check(floor.runs.every((v) => v.status === 200), "the health check answers 200, every time");

  // --- No cache at all: the draft preview -------------------------------------
  const preview = await phase("no cache", "the draft preview: the same layout and partials, nothing read from or written to Solid Cache", runsFrom("MEASURE_RUNS_PREVIEW", 30),
    () => visit(`/preview/${page.id}`), cache, false);
  check(preview.runs.every((v) => v.status === 200 && v.blocks === 500), "the preview answers 200 with the 500 blocks, every time", `status/blocks: ${seen(preview.runs.map((v) => `${v.status}/${v.blocks}`))}`);
  check(preview.rows.every(([a, b]) => a === b), "the preview wrote nothing to Solid Cache", `${preview.rows[0]![0]} rows, then ${preview.rows.at(-1)![1]}`);

  // --- Cold ------------------------------------------------------------------------
  const cold = await phase("cold: Solid Cache emptied, server running", "Solid Cache emptied from outside on the running server, then one visit", runsFrom("MEASURE_RUNS_COLD", 15), async () => {
    cache!.clear();
    return visit(path);
  }, cache);
  check(cold.rows.every(([, after]) => after === 501), "a cold visit writes the page's 501 fragments: the 500 blocks and the page", `${seen(cold.rows.map(([, after]) => after))} rows after; ${kinds(cache.keys())}`);
  check(cold.runs.every((v) => v.status === 200 && v.blocks === 500), "a cold visit answers 200 with the 500 blocks, every time");

  // --- Warm -------------------------------------------------------------------------
  const warm = await phase("warm", "the page read whole from Solid Cache", runsFrom("MEASURE_RUNS_WARM", 100), () => visit(path), cache, false);
  check(warm.runs.every((v) => v.status === 200 && v.blocks === 500 && v.cacheControl === "max-age=0, public, must-revalidate"), "a warm visit answers 200 with the 500 blocks and the page's Cache-Control, every time");
  check(new Set(warm.runs.map((v) => v.hash)).size === 1 && warm.runs[0]!.hash === cold.runs[0]!.hash, "the warm page has the bytes of the cold one, all the runs", `${warm.runs[0]!.bytes} bytes`);
  check(warm.rows.every(([a, b]) => a === 501 && b === 501), "a warm visit writes nothing", `rows before and after: ${seen(warm.rows.map((r) => r.join(" to ")))}`);
  const etag = warm.runs[0]!.etag;
  check(etag !== null, "the page has an ETag");

  // --- A 304 -------------------------------------------------------------------------
  const notModified = await phase("not modified", "the page's ETag sent back: a 304, no body", runsFrom("MEASURE_RUNS_304", 100), () => visit(path, { "if-none-match": etag ?? "" }), cache, false);
  check(notModified.runs.every((v) => v.status === 304 && v.bytes === 0), "a validator sent back gets a 304 with no body, every time");

  // --- One block changed ------------------------------------------------------------
  const changes = runsFrom("MEASURE_RUNS_CHANGED", 15);
  const changed = await phase("one block changed", "a heading edited, saved and published, then one visit", changes, async (attempt) => {
    // The headings in turn, spread over the page; a run thrown away is
    // followed by an edit of the next one.
    const target = edits[Math.min(edits.length - 1, Math.floor(((attempt - 0.5) * edits.length) / changes))]!;
    const draft = await api(BASE, "GET", `/api/pages/${page.id}/draft`);
    document = withHeadingText(document, target.id, `A heading changed for attempt ${attempt}`);
    await api(BASE, "PUT", `/api/pages/${page.id}/draft`, { revision: draft.revision, document, saveId: `measure-edit-${attempt}` });
    await api(BASE, "POST", `/api/pages/${page.id}/publish`, {});
    const sent = await visit(path);
    return sent;
  }, cache);
  check(changed.runs.every((v, i) => v.status === 200 && v.blocks === 500 && v.hash !== (changed.runs[i - 1]?.hash ?? warm.runs[0]!.hash)), "each visit after a change answers 200 with the 500 blocks and new bytes");
  check(changed.rows.every(([a, b]) => b - a === 4), "one heading changed writes 4 fragments: the heading, its column, its section and the page", `new rows per run: ${seen(changed.rows.map(([a, b]) => b - a))}`);

  // --- The site style changed -----------------------------------------------------------
  // Every run a style this version of the page has not been drawn in, so
  // that the page's own fragment is never found: the type scales times the
  // tones of two palette slots.
  const start = (await api(BASE, "GET", "/api/site-style")) as SiteStyle;
  const startKey = JSON.stringify([start.palette, start.typeScale]);
  const unused: Array<{ palette: Record<string, string>; typeScale: string }> = [];
  for (const scale of start.choices.typeScales.map((c) => c.name)) {
    for (const primary of start.choices.palette.primary!.map((t) => t.color)) {
      for (const accent of start.choices.palette.accent!.map((t) => t.color)) {
        const style = { palette: { ...start.palette, primary, accent }, typeScale: scale };
        if (JSON.stringify([style.palette, style.typeScale]) !== startKey) unused.push(style);
      }
    }
  }
  // Ten styles are kept back for runs thrown away and taken again.
  const flips = Math.min(runsFrom("MEASURE_RUNS_STYLE", 15), unused.length - 10);
  check(flips >= 5, "the site has enough styles to change to a new one each run, and some to spare", `${unused.length} styles besides the current`);
  const styled = await phase("site style changed", "the style changed to one this page was never drawn in, then one visit", flips, async (attempt) => {
    await api(BASE, "PUT", "/api/site-style", unused[attempt - 1]);
    return visit(path);
  }, cache);
  check(styled.runs.every((v) => v.status === 200 && v.blocks === 500), "each visit after a style change answers 200 with the 500 blocks");
  check(styled.rows.every(([a, b]) => b - a === 1), "a style change writes one fragment, the page's, and no block", `new rows per run: ${seen(styled.rows.map(([a, b]) => b - a))}`);

  // --- The first visit after a start ---------------------------------------------------
  // What a deploy costs the first visitor, which "cold" above does not: a
  // new process, its templates not yet compiled and its code not yet run,
  // and fragment keys that find nothing. Each run stops the
  // server, empties Solid Cache, starts the server again, waits for /up and
  // one second more, and visits once. Last, so the state it leaves (a new
  // process, the cache holding one page) is no other phase's.
  const processes: Array<number | undefined> = [];
  const emptyAtTheVisit: number[] = [];
  const afterStart = await phase("first visit after a start", "the server stopped and started again with Solid Cache emptied, then one visit", runsFrom("MEASURE_RUNS_START", 8), async () => {
    console.log(await stopTree(main!));
    const open = listeners(PORT);
    if (open.length) throw new Error(`port ${PORT} is still listening after the stop: ${open.map((l) => `${l.address}, process ${l.pid}`).join("; ")}`);
    connection.destroy();
    cache!.clear();
    const child = await startServer();
    processes.push(child.pid);
    emptyAtTheVisit.push(cache!.entries());
    await new Promise((done) => setTimeout(done, 1000));
    return visit(path);
  }, cache);
  check(new Set(processes).size === processes.length && processes.length >= afterStart.runs.length, "every run of the first visit started a server of its own", `${processes.length} processes: ${processes.join(", ")}`);
  check(emptyAtTheVisit.every((rows) => rows === 0), "Solid Cache held no fragment when each first visit came", `${seen(emptyAtTheVisit)} fragments`);
  check(afterStart.runs.every((v) => v.status === 200 && v.blocks === 500), "the first visit after a start answers 200 with the 500 blocks, every time");
  check(afterStart.rows.every(([, after]) => after === 501), "the first visit after a start writes the page's 501 fragments: the 500 blocks and the page", `${seen(afterStart.rows.map(([, after]) => after))} rows after`);

  // --- Report -------------------------------------------------------------------------------
  const rowBytes = cache.bytes();
  const rows = cache.entries();
  console.log("");
  console.log(`# ${banner("measure-server")}`);
  console.log(`# ${fact}`);
  console.log(`# the page: ${page.document.sections.length} sections, ${countBlocks(page.document.sections)} blocks, ${warm.runs[0]!.bytes} bytes of HTML (${kib(warm.runs[0]!.bytes)} KiB), not compressed; Solid Cache holds ${rows} rows, ${kib(rowBytes)} KiB of values`);
  const all = phases.flatMap((p) => p.runs);
  console.log(`# Puma 3 threads, one process; the client is Node's http module with Nagle's algorithm off, one connection kept open (${all.filter((v) => v.reused).length} of the ${all.length} visits reused it)`);
  console.log(`# Solid Cache rows: ${kinds(cache.keys())}`);
  console.log("");
  console.log("One visit, ms: median (min to max) over the runs; the server's time is X-Runtime, the application's own, the client's runs from the request to the last byte:");
  console.log("| What | Server, X-Runtime, ms | Client, last byte, ms | Runs | CPU busy before and after the runs kept | Runs thrown away, machine busy |");
  console.log("| --- | --- | --- | --- | --- | --- |");
  for (const p of phases) {
    console.log(`| ${p.name} | ${cell(column(p, (v) => v.runtime))} | ${cell(column(p, (v) => v.total))} | ${p.runs.length} | ${busyRange(p.busy)} | ${discardedWords(p.tally)} |`);
  }
  console.log("");
  console.log("Counted as the store receives the calls, one visit each, apart from the timed runs:");
  console.log("| Visit | Status | Bytes | Calls to read | Fragments asked | Found | Calls to write | Written | Rows after, Solid Cache's own size estimate included |");
  console.log("| --- | --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const c of counts) {
    console.log(`| ${c.phase} | ${c.status} | ${c.bytes} | ${c.read_calls} | ${c.keys_asked} | ${c.keys_found} | ${c.write_calls} | ${c.keys_written} | ${c.entries} |`);
  }
  const one = counts.find((c) => c.phase === "one widget changed");
  if (one) {
    const asked = Number(one.keys_asked);
    const found = Number(one.keys_found);
    const writes = Number(one.keys_written);
    console.log("");
    console.log(`one widget changed: ${found} of the ${asked} fragments asked for were found, ${asked - found} were missing and ${writes} were written (the heading, its column, its section and the page); `
      + `of the ${one.blocks} blocks, ${Number(one.blocks) - 3} were not drawn again (${(((Number(one.blocks) - 3) / Number(one.blocks)) * 100).toFixed(1)}%)`);
    check(writes === 4 && asked - found === 4, "the counting run: one widget changed misses and writes exactly 4 fragments", `asked ${asked}, found ${found}, written ${writes}`);
  }
  const warmCount = counts.find((c) => c.phase === "warm");
  check(!!warmCount && warmCount.read_calls === 1 && warmCount.keys_found === 1 && warmCount.keys_written === 0, "the counting run: a warm visit is one read, found, and writes nothing", JSON.stringify(warmCount ?? {}));
  const coldCount = counts.find((c) => c.phase === "cold");
  check(!!coldCount && Number(coldCount.keys_written) === 501 && Number(coldCount.keys_found) === 0, "the counting run: a cold visit finds nothing and writes the 501 fragments", JSON.stringify(coldCount ?? {}));
  check(counts.find((c) => c.phase === "not modified")?.status === 304 && counts.find((c) => c.phase === "not modified")?.read_calls === 0, "the counting run: a 304 reads nothing from the cache");
  if (underLoad) console.log("UNDER LOAD: the machine was not quiet during this run (or MEASURE_ALLOW_BUSY=1 was given): these numbers are not to be quoted");
} catch (error) {
  console.log(`the measurement stopped: ${(error as Error).message}`);
  if (error instanceof CouldNotRun) exitCode = 2;
  else check(false, "the measurement ran to its end", (error as Error).message);
} finally {
  try {
    cache?.close();
  } catch {
    // the connection was never open or is already closed
  }
  if (main) console.log(await stopTree(main));
  let still: string[] = [];
  try {
    still = listeners(PORT).map((l) => `${l.address}, process ${l.pid}`);
  } catch (error) {
    still = [(error as Error).message];
  }
  check(still.length === 0, `port ${PORT} is closed after the stop`, still.length ? `still listening: ${still.join("; ")}` : "");
  if (stage.precompiled) {
    try {
      rails(["assets:clobber"], "assets:clobber");
    } catch {
      // reported by rails()
    }
  }
  check(!existsSync(join(cms, "public", "assets")), "public/assets does not remain");
  rmSync(tmp, { recursive: true, force: true });
  check(!existsSync(tmp), `cms/tmp/${run} is removed`);
}

for (const line of results) console.log(line);
const total = results.length;
console.log(exitCode === 2 ? "RESULT: the measurement could not run to the end"
  : failed === 0 ? `RESULT: ${total} checks passed${underLoad ? ", taken UNDER LOAD, not to be quoted" : ""}` : `RESULT: ${failed} of ${total} checks failed`);
process.exit(exitCode || (failed ? 1 : 0));
