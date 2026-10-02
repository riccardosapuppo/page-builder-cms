// node tools/check-production.ts
//
// Boots the CMS in production mode on 127.0.0.1:3902 (PRODUCTION_CHECK_PORT
// moves it) and checks, over plain HTTP, what a visitor's browser gets
// from it:
// - the server refuses to listen outside this machine, and with no
//   address given listens on 127.0.0.1 only (production's own default
//   would be 0.0.0.0);
// - a published page and the 404 page carry the static
//   Content-Security-Policy and no cookie, and nothing pins the address to
//   HTTPS (CMS_FORCE_SSL=0 turns forced SSL off for this local run);
// - the fingerprinted stylesheets and fonts under /assets come with
//   "public, max-age=31536000, immutable", and a file that does not exist
//   there is a 404 without that header;
// - the draft preview is never stored;
// - in headless Chromium, the page as drawn: column widths, a palette
//   colour, a type size, no sideways scroll down to 320 wide, and a focus
//   ring that reads on every band (tools/lib/visitor-checks.ts).
//
// It leaves nothing behind: the three production databases live in a
// folder under cms/tmp made for this run, the page it checks is made
// through the API on that empty database, the precompiled assets are
// removed with assets:clobber, the server tree is stopped (taskkill on
// Windows, its process group elsewhere), and the port is shown closed
// before the folder is deleted. Ruby must be on the PATH, the gems of
// cms/ installed, and Playwright's Chromium in its cache.
//
// Runs on Windows, Linux and macOS. Exits 0 when every check passes, 1
// when one fails, 2 when the check could not run (the port taken, the
// server not starting, no way to see who listens).
import { spawnSync, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, openSync, closeSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { listeners, startTree, stopTree, type Listener } from "./lib/processes.ts";
import { fixture, visitorChecks } from "./lib/visitor-checks.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const cms = join(root, "cms");
// 3902, the project's port for production runs; PRODUCTION_CHECK_PORT moves
// it, so the check can run beside another that holds 3902.
const PORT = ((raw) => {
  if (raw === undefined || raw === "") return 3902;
  const port = Number(raw);
  if (!/^[0-9]+$/.test(raw) || !Number.isInteger(port) || port <= 0 || port > 65535) {
    console.log(`PRODUCTION_CHECK_PORT must be a port number, not "${raw}": nothing was started`);
    process.exit(2);
  }
  return port;
})(process.env.PRODUCTION_CHECK_PORT);
const BASE = `http://127.0.0.1:${PORT}`;
const IMMUTABLE = "public, max-age=31536000, immutable";
// An address of TEST-NET-1 (RFC 5737), which no machine has: asked to
// listen there, a server that failed to refuse could not open it either.
const OUTSIDE = "192.0.2.1";
const run = `production-check-${process.pid}`;
const tmp = join(cms, "tmp", run);
const env: NodeJS.ProcessEnv = {
  ...process.env,
  RAILS_ENV: "production",
  SECRET_KEY_BASE_DUMMY: "1",
  CMS_FORCE_SSL: "0",
  RAILS_LOG_LEVEL: "warn",
  // Relative to cms/, the folder made for this run.
  DATABASE_URL: `sqlite3:tmp/${run}/production.sqlite3`,
  CACHE_DATABASE_URL: `sqlite3:tmp/${run}/production_cache.sqlite3`,
  QUEUE_DATABASE_URL: `sqlite3:tmp/${run}/production_queue.sqlite3`,
};
// What bin/rails would otherwise take from this shell.
delete env.BINDING;
delete env.PORT;

const results: string[] = [];
let failed = 0;
function check(ok: boolean, what: string, detail = ""): void {
  if (!ok) failed += 1;
  results.push(`${ok ? "ok  " : "FAIL"} ${what}${detail ? `: ${detail}` : ""}`);
}

function rails(args: string[], label: string): void {
  const r = spawnSync("ruby", ["bin/rails", ...args], { cwd: cms, env, encoding: "utf8" });
  if (r.status !== 0) {
    console.log(`${label} failed (exit ${r.status}):\n${(r.stdout ?? "") + (r.stderr ?? "")}`);
    throw new Error(`${label} failed`);
  }
  console.log(`${label}: done`);
}

function server(args: string[], log: string): ChildProcess {
  const fd = openSync(log, "w");
  const child = startTree("ruby", ["bin/rails", "server", ...args], { cwd: cms, env, stdio: ["ignore", fd, fd] });
  closeSync(fd);
  return child;
}

const exited = (child: ChildProcess, ms: number) => new Promise<number | null>((done) => {
  if (child.exitCode !== null) return done(child.exitCode);
  const timer = setTimeout(() => done(null), ms);
  child.once("exit", (code) => { clearTimeout(timer); done(code ?? -1); });
});

async function get(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(BASE + path, { redirect: "manual", ...init });
}

async function api(method: string, path: string, body: unknown): Promise<any> {
  const response = await fetch(BASE + path, { method, headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify(body) });
  if (!response.ok) throw new Error(`${method} ${path} answered ${response.status}: ${await response.text()}`);
  return response.json();
}

let taken: Listener[];
try {
  taken = listeners(PORT);
} catch (error) {
  console.log((error as Error).message);
  process.exit(2);
}
if (taken.length) {
  console.log(`port ${PORT} is already taken (${taken.map((l) => `${l.address}, process ${l.pid}`).join("; ")}): nothing was started`);
  process.exit(2);
}

mkdirSync(tmp, { recursive: true });
let main: ChildProcess | undefined;
let refused: ChildProcess | undefined;
let exitCode = 0;
try {
  rails(["assets:precompile"], "assets:precompile");
  rails(["db:create", "db:schema:load"], "databases in " + `cms/tmp/${run}`);

  // Asked for an address outside this machine, the server must stop before
  // listening anywhere (config/puma.rb).
  const refusedLog = join(tmp, "refused.log");
  refused = server(["-b", OUTSIDE, "-p", String(PORT), "-P", join(tmp, "refused.pid")], refusedLog);
  const code = await exited(refused, 120_000);
  const said = readFileSync(refusedLog, "utf8");
  check(code !== null && code !== 0 && said.includes(`Refusing to listen on tcp://${OUTSIDE}:${PORT}`), `asked to listen on ${OUTSIDE}, the server refuses and stops`,
    code === null ? "still running after 120 s" : `exit ${code}: ${said.split(/\r?\n/).find((l) => l.includes("Refusing")) ?? said.trim().split(/\r?\n/).slice(-3).join(" | ")}`);
  check(listeners(PORT).length === 0, `nothing listens on ${PORT} after the refusal`);

  // No -b: the address comes from bin/rails, never production's 0.0.0.0.
  const log = join(tmp, "server.log");
  main = server(["-p", String(PORT), "-P", join(tmp, "server.pid")], log);

  let up = false;
  for (let i = 0; i < 240 && !up; i++) {
    if (main.exitCode !== null) break;
    up = await fetch(`${BASE}/up`).then((r) => r.status === 200, () => false);
    if (!up) await new Promise((done) => setTimeout(done, 500));
  }
  const started = readFileSync(log, "utf8");
  console.log(`server output:\n${started.split(/\r?\n/).filter((l) => /Puma|Listening|Environment|PID|Error|error/.test(l)).map((l) => `  ${l}`).join("\n")}`);
  if (!up) {
    console.log("the server did not answer /up within 120 s");
    exitCode = 2;
  } else {
    const owners = listeners(PORT);
    check(owners.length === 1 && owners[0]!.pid === String(main.pid) && owners[0]!.address === `127.0.0.1:${PORT}`,
      `started with no address, the server listens on 127.0.0.1:${PORT} only`,
      `listening: ${owners.map((l) => `${l.address} (process ${l.pid})`).join(", ")}; started: process ${main.pid}`);

    const title = "Served in production";
    const created = await api("POST", "/api/pages", { title, slug: "check" });
    const id = created.page.id;
    await api("PUT", `/api/pages/${id}/draft`, { revision: 0, document: fixture(title), saveId: "check-1" });
    await api("POST", `/api/pages/${id}/publish`, {});
    await api("PATCH", `/api/pages/${id}`, { home: true });

    const home = await get("/");
    const html = await home.text();
    check(home.status === 200 && html.includes(title), "/ serves the published home page", `status ${home.status}`);
    check((home.headers.get("content-security-policy") ?? "").includes("script-src 'none'"), "/ carries the static Content-Security-Policy", home.headers.get("content-security-policy") ?? "none");
    check(home.headers.get("set-cookie") === null, "/ sets no cookie", home.headers.get("set-cookie") ?? "");
    check(home.headers.get("strict-transport-security") === null, "/ sends no Strict-Transport-Security over plain HTTP", home.headers.get("strict-transport-security") ?? "");

    const moved = await get("/check");
    check(moved.status === 301 && moved.headers.get("location") === `${BASE}/`, "the home page's slug answers 301 to /", `${moved.status} ${moved.headers.get("location")}`);

    const missingPage = await get("/no-such-page");
    const missingHtml = await missingPage.text();
    check(missingPage.status === 404 && missingHtml.includes("There is no page here"), "an unknown address is the site's 404 page", `status ${missingPage.status}`);
    check(missingPage.headers.get("set-cookie") === null, "the 404 page sets no cookie");

    const preview = await get(`/preview/${id}`);
    check(preview.status === 200 && preview.headers.get("cache-control") === "no-store", "the preview is never stored", `${preview.status} ${preview.headers.get("cache-control")}`);

    const sheets = [...html.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map((m) => m[1]!);
    check(sheets.length === 2, "the page names two stylesheets", sheets.join(", "));
    const fonts: string[] = [];
    for (const sheet of sheets) {
      const response = await get(sheet);
      const css = await response.text();
      fonts.push(...[...css.matchAll(/url\("([^"]+\.woff2)"\)/g)].map((m) => m[1]!));
      check(response.status === 200 && response.headers.get("cache-control") === IMMUTABLE, `${sheet} is immutable for a year`, `${response.status} ${response.headers.get("cache-control")}`);
    }
    check(fonts.length === 3, "site.css names the three font files", fonts.join(", "));
    for (const font of fonts) {
      const response = await get(font);
      await response.arrayBuffer();
      check(response.status === 200 && response.headers.get("cache-control") === IMMUTABLE, `${font} is immutable for a year`, `${response.status} ${response.headers.get("cache-control")}`);
    }

    const missingAsset = await get("/assets/site-0123456789abcdef.css");
    await missingAsset.text();
    check(missingAsset.status === 404 && !(missingAsset.headers.get("cache-control") ?? "").includes("immutable"), "a missing file under /assets is a 404 without the year-long header", `${missingAsset.status} ${missingAsset.headers.get("cache-control")}`);

    const robots = await get("/robots.txt");
    await robots.text();
    check(robots.status === 200 && robots.headers.get("cache-control") !== IMMUTABLE, "robots.txt, outside /assets, is not marked immutable", `${robots.status} ${robots.headers.get("cache-control")}`);

    await visitorChecks(BASE, `/preview/${id}`, root, check);
  }
} catch (error) {
  console.log(`the check stopped: ${(error as Error).message}`);
  exitCode = 2;
} finally {
  for (const child of [refused, main]) {
    if (child) console.log(await stopTree(child));
  }
  let still: string[] = [];
  try {
    still = listeners(PORT).map((l) => `${l.address}, process ${l.pid}`);
  } catch (error) {
    still = [(error as Error).message];
  }
  check(still.length === 0, `port ${PORT} is closed after the stop`, still.length ? `still listening: ${still.join("; ")}` : "");
  try {
    rails(["assets:clobber"], "assets:clobber");
  } catch {
    // reported by rails()
  }
  check(!existsSync(join(cms, "public", "assets")), "public/assets does not remain");
  rmSync(tmp, { recursive: true, force: true });
  check(!existsSync(tmp), `cms/tmp/${run} is removed`);
}

for (const line of results) console.log(line);
const total = results.length;
console.log(exitCode === 2 ? "RESULT: the check could not run to the end" : failed === 0 ? `RESULT: ${total} checks passed` : `RESULT: ${failed} of ${total} checks failed`);
process.exit(exitCode || (failed ? 1 : 0));
