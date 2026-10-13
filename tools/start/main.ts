// npm start: everything a reader needs to try the project, in one command.
//
//   npm start                   checks, installs, prepares the database,
//                               starts the CMS and the editor, opens the
//                               editor in the browser, and stops both on
//                               Ctrl+C
//   npm start -- --no-open      the same without the browser (also NO_OPEN=1,
//                               CI, or an output that is not a terminal)
//   npm start -- --smoke        starts, checks that both answer, stops, and
//                               says what changed outside the repository:
//                               the run CI makes on Linux and Windows
//   npm start -- --empty        on a database not made yet, a site with
//                               nothing in it in place of the example site
//                               (with --smoke or --setup too); on one that
//                               exists, stops before anything and says why
//   npm run setup               only installs and prepares the database
//
// The CMS listens on 127.0.0.1:3900 and the editor on 127.0.0.1:4900, the
// project's own ports (CMS_PORT and BUILDER_PORT move them), on this machine
// only: the API has no authentication.
//
// Exits 0 when it ran and stopped cleanly, 1 when something failed after
// it began, 2 when it could not run here (a problem the preflight names;
// nothing was installed or started).
import { spawn } from "node:child_process";
import { cmsRoot } from "../lib/commands.ts";
import { decideOpen, openBrowser } from "./browser.ts";
import { compare, placesToWatch, snapshot, type Snapshot } from "./footprint.ts";
import { install } from "./install.ts";
import { preflight, type Port } from "./preflight.ts";
import { cmsReady, editorReady, ownership, pageList, startCms, startEditor, stop, waitReady, type Server } from "./servers.ts";

const USAGE = "usage: npm start [-- --no-open | --smoke] [--empty]   or   npm run setup [-- --empty]";
const FLAGS = new Set(["--no-open", "--smoke", "--setup", "--empty", "--help"]);

const say = (line: string) => console.log(`[start] ${line}`);
const print = (line: string) => console.log(line);

function numberFrom(name: string, fallback: number, max: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!/^[0-9]+$/.test(raw) || !Number.isInteger(value) || value <= 0 || value > max) {
    say(`${name} must be a whole number from 1 to ${max}, not "${raw}": nothing was started.`);
    process.exit(2);
  }
  return value;
}

function isSet(value: string | undefined): boolean {
  return value !== undefined && !/^(|0|false|no)$/i.test(value.trim());
}

// Runs a command to its end with its lines passed on under a name.
function runRelayed(name: string, command: string, args: string[], cwd: string, env: NodeJS.ProcessEnv): Promise<number> {
  return new Promise((done) => {
    const child = spawn(command, args, { cwd, env, stdio: ["ignore", "pipe", "pipe"] });
    for (const stream of [child.stdout, child.stderr]) {
      let rest = "";
      stream.setEncoding("utf8");
      stream.on("data", (chunk: string) => {
        const lines = (rest + chunk).split(/\r?\n/);
        rest = lines.pop() ?? "";
        for (const line of lines) print(`[${name}] ${line}`);
      });
      stream.on("end", () => { if (rest) print(`[${name}] ${rest}`); });
    }
    child.on("error", (error) => { print(`[${name}] ${error.message}`); done(-1); });
    child.on("close", (code) => done(code ?? -1));
  });
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  const unknown = argv.filter((arg) => !FLAGS.has(arg));
  if (argv.includes("--help") || unknown.length) {
    if (unknown.length) say(`unknown option ${unknown.join(" ")}`);
    say(USAGE);
    return unknown.length ? 2 : 0;
  }
  const smoke = argv.includes("--smoke");
  const setupOnly = argv.includes("--setup");
  const empty = argv.includes("--empty");
  const cmsPort = numberFrom("CMS_PORT", 3900, 65535);
  const editorPort = numberFrom("BUILDER_PORT", 4900, 65535);
  const readyWithin = numberFrom("START_READY_SECONDS", 180, 3600) * 1000;

  // What lies outside the repository, before anything is installed.
  const watched = smoke ? placesToWatch() : [];
  const before: Snapshot | null = smoke ? snapshot(watched) : null;

  say(`${setupOnly ? "setup" : smoke ? "smoke run" : "start"} of Page Builder CMS${empty ? ", from a site with nothing in it" : ""}, on Node ${process.versions.node}`);
  const ports: Port[] = setupOnly ? [] : [
    { port: cmsPort, what: "the CMS", variable: "CMS_PORT" },
    { port: editorPort, what: "the editor", variable: "BUILDER_PORT" },
  ];
  const found = preflight(ports, { empty });
  if (found.ruby) say(`Ruby ${found.ruby}, Bundler ${found.bundler ?? "missing"}`);
  for (const note of found.notes) say(note);
  if (found.problems.length) {
    for (const problem of found.problems) say(problem);
    say("Nothing was installed or started.");
    return 2;
  }

  let rubyEnv: NodeJS.ProcessEnv;
  try {
    rubyEnv = install(say).env;
  } catch (error) {
    say((error as Error).message);
    return 1;
  }

  // db:prepare creates the development database, loads the schema and, on
  // a database it has just created, runs the seed (the example site, or
  // with --empty, EMPTY_SITE=1, a site with nothing in it); on one that
  // exists it only runs pending migrations, which is why the preflight
  // stops --empty there. SKIP_TEST_DATABASE: in development Rails would
  // prepare the test database as well, which npm start has no use for and
  // the test runs own.
  say(`database: ruby bin/rails db:prepare (development${empty ? ", EMPTY_SITE=1" : ""})`);
  const prepared = await runRelayed("cms", "ruby", ["bin/rails", "db:prepare"], cmsRoot, { ...rubyEnv, RAILS_ENV: "development", SKIP_TEST_DATABASE: "1", ...(empty ? { EMPTY_SITE: "1" } : {}) });
  if (prepared !== 0) {
    say(`ruby bin/rails db:prepare failed (exit ${prepared}): its output is above. Nothing was started.`);
    return 1;
  }
  if (setupOnly) {
    say("setup done: gems, packages and the development database are ready; npm start starts the CMS and the editor.");
    return 0;
  }

  const cms = startCms(cmsPort, rubyEnv, print);
  const editor = startEditor(editorPort, cms.url, print);
  const servers: Server[] = [cms, editor];
  say(`processes: cms ${cms.child.pid}, editor ${editor.child.pid}`);

  // One way to stop, whoever asks: Ctrl+C, the terminal closing, a child
  // stopping by itself, a failed check, the end of a smoke run.
  let stopping: Promise<number> | null = null;
  let finished: (code: number) => void = () => undefined;
  const done = new Promise<number>((resolve) => { finished = resolve; });
  const requestStop = (reason: string, code: number): Promise<number> => {
    if (!stopping) {
      stopping = (async () => {
        say(`stopping: ${reason}`);
        const results = await Promise.all(servers.map(stop));
        for (const line of results.flatMap((r) => r.lines)) say(line);
        const closed = results.every((r) => r.closed);
        say(closed ? "stopped: nothing started here is left running" : "stopped, but a port is still held (above)");
        return closed ? code : 1;
      })();
      stopping.then(finished, () => finished(1));
    }
    return stopping;
  };
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP", "SIGBREAK"] as const) {
    process.on(signal, () => { void requestStop(signal === "SIGINT" ? "Ctrl+C" : signal, 0); });
  }
  for (const server of servers) {
    server.child.on("exit", (code, signal) => {
      if (stopping) return;
      // A Ctrl+C reaches the children too (on Windows they share the
      // console): give this process's own signal a moment to arrive first,
      // so a stop that was asked for is not reported as a crash.
      setTimeout(() => {
        if (!stopping) void requestStop(`${server.what} stopped by itself (exit ${code ?? signal}); its last lines:\n${server.tail.join("\n")}`, 1);
      }, 1000);
    });
  }

  try {
    return await serve(cms, editor, { argv, smoke, empty, readyWithin, before, watched, requestStop, done, isStopping: () => stopping !== null });
  } catch (error) {
    return requestStop(`an unexpected error: ${(error as Error).stack ?? String(error)}`, 1);
  }
}

interface Serving {
  argv: string[];
  smoke: boolean;
  // A site made with nothing in it (--empty).
  empty: boolean;
  readyWithin: number;
  before: Snapshot | null;
  watched: ReturnType<typeof placesToWatch>;
  requestStop: (reason: string, code: number) => Promise<number>;
  done: Promise<number>;
  isStopping: () => boolean;
}

// From two children started to two children answering, then either the
// smoke run's looks or the wait for Ctrl+C.
async function serve(cms: Server, editor: Server, { argv, smoke, empty, readyWithin, before, watched, requestStop, done, isStopping }: Serving): Promise<number> {
  const [cmsProblem, editorProblem] = await Promise.all([
    waitReady(cms, readyWithin, () => cmsReady(cms)),
    waitReady(editor, readyWithin, () => editorReady(editor, cms)),
  ]);
  const notReady = [cmsProblem, editorProblem, ...(cmsProblem || editorProblem ? [] : [ownership(cms), ownership(editor)])].filter((p): p is string => p !== null);
  if (notReady.length) {
    if (isStopping()) return done;
    return requestStop(notReady.join("; "), 1);
  }
  if (isStopping()) return done;
  say(`ready: the editor at ${editor.url}/, the CMS at ${cms.url}/`);

  const decision = decideOpen({ argv, env: process.env, terminal: Boolean(process.stdout.isTTY), smoke });
  if (decision.open) say(openBrowser(`${editor.url}/`, { dryRun: isSet(process.env.START_OPEN_DRY_RUN) }));
  else say(`browser: not opened, because ${decision.reason}; the editor is at ${editor.url}/`);

  if (!smoke) {
    say("Ctrl+C stops both.");
    return done;
  }

  // The smoke run: a few looks at what a reader would see, then the stop.
  const results: Array<[boolean, string]> = [];
  const look = (ok: boolean, what: string) => { results.push([ok, what]); say(`${ok ? "ok  " : "FAIL"} ${what}`); };
  look(true, `the CMS answers /up and its page list, the editor its index and the same list through its proxy, within ${Math.round(readyWithin / 1000)} s`);
  look(true, `ports ${cms.port} and ${editor.port} are held by the processes started here, on 127.0.0.1 alone`);
  const list = await pageList(cms.url).catch(() => null);
  const pages = list ? (JSON.parse(list) as { pages: unknown[] }).pages.length : 0;
  // An empty site has no page, so no home page: its address is the CMS's
  // 404, a page of its own still.
  if (empty) look(pages === 0, `the CMS lists ${pages} page(s): the database is prepared, with nothing in it`);
  else look(pages > 0, `the CMS lists ${pages} page(s): the database is prepared and seeded`);
  const home = await fetch(`${cms.url}/`, { signal: AbortSignal.timeout(30_000) }).then(async (r) => ({ status: r.status, html: await r.text() }), () => ({ status: 0, html: "" }));
  if (empty) look(home.status === 404 && home.html.includes("<html"), `the CMS answers its home page with its 404 page, there being no page (${home.status})`);
  else look(home.status === 200 && home.html.includes("<html"), `the CMS serves its home page (${home.status})`);
  // The module the editor's page loads, as Vite compiles it for the
  // browser: a syntax error there is a 500. Vite puts its own client
  // (/@vite/client) first in the page; the editor's is the other one.
  const index = await fetch(`${editor.url}/`, { signal: AbortSignal.timeout(30_000) }).then((r) => r.text(), () => "");
  const entry = [...index.matchAll(/<script type="module" src="([^"]+)"/g)].map((m) => m[1]!).find((src) => !src.startsWith("/@"));
  const compiled = entry ? await fetch(new URL(entry, `${editor.url}/`), { signal: AbortSignal.timeout(120_000) }).then((r) => r.status, () => 0) : 0;
  look(compiled === 200, `the editor's entry module ${entry ?? "(none in its page)"} compiles (${compiled})`);
  const stopped = await requestStop("the smoke run is done", 0);
  look(stopped === 0, `both stopped, and nothing listens on ${cms.port} or ${editor.port}`);
  if (before) {
    const outside = compare(before, snapshot(watched));
    for (const line of outside.lines) say(`outside the repository: ${line}`);
    look(!outside.changed, "nothing changed outside the repository where launchers or services would go");
  }
  const failed = results.filter(([ok]) => !ok).length;
  say(failed ? `smoke: ${failed} of ${results.length} checks failed` : `smoke: ${results.length} checks passed`);
  return failed ? 1 : 0;
}

const code = await main().catch((error: unknown) => {
  say(`stopped on an unexpected error: ${(error as Error).stack ?? String(error)}`);
  return 1;
});
process.exitCode = code;
// Whatever an idle connection still holds, the run is over.
setTimeout(() => process.exit(code), 2000).unref();
