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
//   ring that reads on every band (tools/lib/visitor-checks.ts);
// - the caches: the published page is "public, max-age=0,
//   must-revalidate" with an ETag and no Last-Modified, its ETag sent back
//   gets a 304, a publish shows at the next request, and production's
//   Solid Cache holds the page and its blocks, gaining four entries when
//   one widget changes (cacheChecks);
// - a visitor's form: sent with this site's Origin and no token, it is
//   kept and leads to a confirmation that is never stored; with another
//   site's, 403 and not counted; from one address, the eleventh within
//   ten minutes is 429, counted in production's Solid Cache (formChecks);
// - the jobs, with `ruby bin/jobs` in a process of its own beside the
//   server, as the CMS's README says a production run does: a page
//   scheduled for 15 seconds ahead is not live before, and is live after
//   (scheduledChecks);
// - the header and footer the editor sets (PUT /api/site): a change shows
//   at the next request under a new ETag, Solid Cache gaining the one page
//   drawn around blocks all read back (headerCacheChecks); and in
//   Chromium, for headers from the design's to every length at its limit,
//   nothing leaves the page at any width, and the links show where the
//   header's data-fold says, on one row with the brand
//   (tools/lib/header-checks.ts).
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
// when one fails, 2 when the check could not run here (the port taken, an
// invalid PRODUCTION_CHECK_PORT, no way to see who listens, no Ruby to
// start). A precompile that fails, a server that exits at boot or never
// answers, an API call answered with an error: each is a failure of the
// CMS, never "could not run".
import { spawnSync, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, openSync, closeSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CouldNotRun, heldByTree, listeners, startTree, stopTree, type Listener } from "./lib/processes.ts";
import { headerChecks, type SiteValues } from "./lib/header-checks.ts";
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
// A published page's Cache-Control, its directives in sorted order (Rails
// writes them "max-age=0, public, must-revalidate").
const PAGE_CACHE = "max-age=0, must-revalidate, public";
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
  if (r.error) throw new CouldNotRun(`${label}: Ruby could not be started (${r.error.message})`);
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
  const response = await fetch(BASE + path, { method, headers: { "content-type": "application/json", accept: "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  if (!response.ok) throw new Error(`${method} ${path} answered ${response.status}: ${await response.text()}`);
  return response.json();
}

// The fragments of pages in production's Solid Cache (their keys hold
// Rails' "views/"), counted by the CMS's own model in a process of its
// own, on the run's databases; and its rows in all. Only the fragments are
// the pages': Solid Cache adds a row of its own, an estimate of its size,
// the first time its expiry runs, which it starts at random after about
// one write in fifty, so the rows in all may be one more after the same
// visits.
function cacheEntries(): { fragments: number; rows: number } {
  const ruby = "print \"fragments=#{SolidCache::Entry.pluck(:key).count { |key| key.include?('views/') }} rows=#{SolidCache::Entry.count}\"";
  const r = spawnSync("ruby", ["bin/rails", "runner", ruby], { cwd: cms, env, encoding: "utf8" });
  if (r.error) throw new CouldNotRun(`counting the cache's entries: Ruby could not be started (${r.error.message})`);
  const found = /fragments=([0-9]+) rows=([0-9]+)/.exec(r.stdout ?? "");
  if (r.status !== 0 || !found) throw new Error(`counting the cache's entries failed (exit ${r.status}): ${(r.stdout ?? "") + (r.stderr ?? "")}`);
  return { fragments: Number(found[1]), rows: Number(found[2]) };
}

// Every block of a document: the sections, their columns, their widgets.
function blockCount(blocks: unknown): number {
  return Array.isArray(blocks) ? blocks.reduce((n: number, b: { children?: unknown }) => n + 1 + blockCount(b.children), 0) : 0;
}

// What a visitor's browser and the server's cache keep of the published
// home page, in production's own Solid Cache: a validator sent back gets
// a 304; one widget changed and published shows at the next request, the
// old validator getting the new page; and the cache holds the page and
// each of its blocks after the first visit, and gains exactly four entries
// for the change (the widget, its column, its section, the page), the
// rest being read back.
async function cacheChecks(id: number, title: string, etag: string): Promise<void> {
  const again = await get("/", { headers: { "if-none-match": etag } });
  const body = await again.text();
  check(again.status === 304 && body === "" && again.headers.get("etag") === etag, "/ with its ETag sent back is a 304 with no body", `${again.status}, ${body.length} bytes, ETag ${again.headers.get("etag")}`);
  check(again.headers.get("set-cookie") === null, "the 304 sets no cookie", again.headers.get("set-cookie") ?? "");

  const document = fixture(title) as { sections: unknown[] };
  const before = cacheEntries();
  check(before.fragments === 1 + blockCount(document.sections), `after the first visit, Solid Cache holds the page and each of its ${blockCount(document.sections)} blocks`, `${before.fragments} fragments (${before.rows} rows in all)`);

  const edited = JSON.parse(JSON.stringify(document).replace(`"text":"${title}"`, `"text":"${title}, edited"`));
  const draft = await api("GET", `/api/pages/${id}/draft`, undefined);
  await api("PUT", `/api/pages/${id}/draft`, { revision: draft.revision, document: edited, saveId: "check-2" });
  await api("POST", `/api/pages/${id}/publish`, {});
  const next = await get("/", { headers: { "if-none-match": etag } });
  const html = await next.text();
  check(next.status === 200 && html.includes(`${title}, edited`) && next.headers.get("etag") !== etag, "after a publish, the old ETag gets 200 and the new page at the next request", `${next.status}, ETag ${next.headers.get("etag")}`);
  const after = cacheEntries();
  check(after.fragments - before.fragments === 4, "one widget changed: Solid Cache gains its widget, its column, its section and the page, and reuses the rest", `${before.fragments} fragments, then ${after.fragments} (${before.rows} rows in all, then ${after.rows})`);
}

// The header and footer, set as the editor sets them: from the revision
// read just before.
async function setSite(site: SiteValues): Promise<void> {
  const now = await api("GET", "/api/site", undefined);
  await api("PUT", "/api/site", { revision: now.revision, ...site });
}

// A change of the header and footer reaches the published home page with
// no publish: the old ETag gets a 200 and the page under the new header at
// the next request, and production's Solid Cache gains one entry, the
// page drawn around blocks all read back.
async function headerCacheChecks(): Promise<void> {
  const before = await get("/");
  await before.text();
  const etag = before.headers.get("etag") ?? "";
  const entries = cacheEntries();
  const site = await api("GET", "/api/site", undefined);
  await setSite({ name: "Tide club", menu: site.menu, action: site.action, footer: site.footer });
  const next = await get("/", { headers: { "if-none-match": etag } });
  const html = await next.text();
  check(next.status === 200 && html.includes("<span>Tide club</span>") && next.headers.get("etag") !== etag,
    "after a change of the header and footer, the old ETag gets 200 and the page under the new header at the next request", `${next.status}, ETag ${next.headers.get("etag")}`);
  const after = cacheEntries();
  check(after.fragments - entries.fragments === 1, "a new header and footer: Solid Cache gains the page alone, every block read back",
    `${entries.fragments} fragments, then ${after.fragments} (${entries.rows} rows in all, then ${after.rows})`);
}

// A visitor's form, in production: forgery protection on, as production
// has it, and the forms counted in production's own store, Solid Cache.
// Sent as a browser sends it, with this site's Origin and no token, the
// form is kept and leads with 303 to a confirmation that is never stored;
// with another site's Origin it is refused with 403, and not counted; and
// from one address the eleventh form within ten minutes is refused with
// 429. Every send here comes from this machine's one address, so they
// are one count, and each names another address in X-Forwarded-For, as a
// visitor trying to get past the limit would: the count is under the
// socket's peer, so no header gives a form a count of its own, and the
// eleventh is refused whatever it names.
async function formChecks(): Promise<void> {
  const title = "Form in production";
  const created = await api("POST", "/api/pages", { title, slug: "form" });
  const id = created.page.id;
  const field = { name: "name", kind: "text", label: "Name", required: true, maxLength: 100 };
  const form = { id: "check-form", type: "form", props: { items: [field], submitLabel: "Send", confirmation: "Thank you, from production." }, children: [], style: { base: {} } };
  const column = { id: "c", type: "column", props: {}, style: { base: {} }, children: [form] };
  const document = { schemaVersion: 1, title, sections: [{ id: "s", type: "section", props: {}, style: { base: {} }, children: [column] }] };
  await api("PUT", `/api/pages/${id}/draft`, { revision: 0, document, saveId: "check-4" });
  await api("POST", `/api/pages/${id}/publish`, {});

  // Each send names an address of its own, as a visitor trying to get past
  // the limit would; the CMS counts under the socket's peer instead.
  let named = 0;
  const send = async (origin: string): Promise<Response> => {
    named += 1;
    const response = await get("/form", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", origin, "x-forwarded-for": `198.51.100.${named}` },
      body: new URLSearchParams({ form: "check-form", "answers[name]": "Ann Diver", website: "" }).toString(),
    });
    await response.text();
    return response;
  };

  const sent = await send(BASE);
  check(sent.status === 303 && sent.headers.get("location") === `${BASE}/form/sent/check-form` && sent.headers.get("set-cookie") === null,
    "a form sent with this site's Origin and no token is kept: 303 to its confirmation, and no cookie", `${sent.status} ${sent.headers.get("location")} ${sent.headers.get("set-cookie") ?? ""}`);
  const shown = await get("/form/sent/check-form");
  const html = await shown.text();
  check(shown.status === 200 && html.includes("Thank you, from production.") && shown.headers.get("cache-control") === "no-store" && shown.headers.get("set-cookie") === null,
    "the confirmation says the form's message, is never stored and sets no cookie", `${shown.status} ${shown.headers.get("cache-control")} ${shown.headers.get("set-cookie") ?? ""}`);

  // Eleven from another site, one more than the limit: each is refused for
  // its Origin before it is counted, so none is 429 and none uses up the
  // count this address's own forms share.
  const foreign: number[] = [];
  for (let i = 0; i < 11; i++) foreign.push((await send("http://elsewhere.example")).status);
  check(foreign.every((s) => s === 403), "forms sent with another site's Origin are refused with 403, past the limit too: they are not counted", foreign.join(" "));

  // One form of this site's has gone out of this address; ten more make
  // the eleventh.
  const statuses: number[] = [];
  for (let i = 0; i < 10; i++) statuses.push((await send(BASE)).status);
  check(statuses.slice(0, 9).every((s) => s === 303) && statuses[9] === 429, "from one address, the eleventh form within ten minutes is refused with 429, whatever address each names in X-Forwarded-For; the ones from another site before it did not count", [sent.status, ...statuses].join(" "));

  const r = spawnSync("ruby", ["bin/rails", "runner", `print "kept=#{Submission.where(page_id: ${Number(id)}).count}"`], { cwd: cms, env, encoding: "utf8" });
  const kept = /kept=([0-9]+)/.exec(r.stdout ?? "");
  check(r.status === 0 && kept?.[1] === "10", "the page's kept answers are the ten its forms were let through with", kept ? `${kept[1]} kept` : `exit ${r.status}: ${(r.stdout ?? "") + (r.stderr ?? "")}`);
}

// A publish set for a time, in production. No job runs inside this server
// (SOLID_QUEUE_IN_PUMA is not set: production's default), so the page goes
// live only if `ruby bin/jobs`, the command the CMS's README gives for the
// jobs of a production run, starts Solid Queue and carries it out. On
// Windows, where Solid Queue's default of forking its workers stops
// bin/jobs with NotImplementedError, that is a check that the command
// starts at all.
async function scheduledChecks(): Promise<void> {
  const title = "Scheduled in production";
  const created = await api("POST", "/api/pages", { title, slug: "scheduled" });
  const id = created.page.id;
  await api("PUT", `/api/pages/${id}/draft`, { revision: 0, document: fixture(title), saveId: "check-3" });
  const draft = await api("GET", `/api/pages/${id}/draft`, undefined);

  const jobsLog = join(tmp, "jobs.log");
  const fd = openSync(jobsLog, "w");
  // Kept in the module's `jobs`, so the stop at the end finds it whatever
  // happens below.
  const child = startTree("ruby", ["bin/jobs"], { cwd: cms, env, stdio: ["ignore", fd, fd] });
  jobs = child;
  closeSync(fd);

  const at = new Date(Date.now() + 15_000);
  await api("POST", `/api/pages/${id}/schedules`, { revision: draft.revision, at: at.toISOString() });
  const before = await get("/scheduled");
  await before.text();
  check(before.status === 404, "a page scheduled for 15 seconds ahead is not live before its time", `${before.status}`);

  let live: Response | undefined;
  let html = "";
  const deadline = at.getTime() + 90_000;
  while (Date.now() < deadline && child.exitCode === null) {
    live = await get("/scheduled");
    html = await live.text();
    if (live.status === 200) break;
    await new Promise((done) => setTimeout(done, 500));
  }
  const late = ((Date.now() - at.getTime()) / 1000).toFixed(1);
  const said = existsSync(jobsLog) ? readFileSync(jobsLog, "utf8").trim().split(/\r?\n/).slice(-3).join(" | ") : "no log";
  check(live?.status === 200 && html.includes(title), "ruby bin/jobs carries a scheduled publish out: the page is live", live?.status === 200 ? `live ${late} s after its time` : child.exitCode !== null ? `bin/jobs exited (${child.exitCode}): ${said}` : `still ${live?.status ?? "not asked"} ${late} s after its time: ${said}`);
  check(child.exitCode === null, "bin/jobs is still running once the publish is done", child.exitCode === null ? "" : `exit ${child.exitCode}`);
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
let jobs: ChildProcess | undefined;
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
    // The CMS's own fault: it crashed at boot, or never came up.
    check(false, "the server answers /up", main.exitCode !== null ? `it exited (${main.exitCode}) before it answered` : "no answer within 120 s");
  } else {
    const owners = listeners(PORT);
    check(heldByTree(owners, main.pid, `127.0.0.1:${PORT}`),
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
    const cacheControl = (home.headers.get("cache-control") ?? "").split(",").map((d) => d.trim()).sort().join(", ");
    check(cacheControl === PAGE_CACHE, `/ may be kept by any cache and is asked for again at every visit (${PAGE_CACHE})`, home.headers.get("cache-control") ?? "no Cache-Control");
    const etag = home.headers.get("etag");
    check(etag !== null && home.headers.get("last-modified") === null, "/ has an ETag and no Last-Modified", `ETag ${etag}, Last-Modified ${home.headers.get("last-modified")}`);

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

    // The caches, last: the edit below changes the draft the visitor
    // checks read through the preview.
    if (etag) await cacheChecks(id, title, etag);

    // A visitor's form, sent as a browser sends it.
    await formChecks();

    // And the jobs, with a process of their own, as the README says.
    await scheduledChecks();

    // The header and footer the editor sets, last: they change every page.
    await headerCacheChecks();
    const metrics = JSON.parse(readFileSync(join(root, "schema", "header-metrics.json"), "utf8")) as { fold: { steps: number[] } };
    await headerChecks(BASE, metrics.fold.steps, check, setSite);
  }
} catch (error) {
  console.log(`the check stopped: ${(error as Error).message}`);
  if (error instanceof CouldNotRun) exitCode = 2;
  else check(false, "the check ran to its end", (error as Error).message);
} finally {
  for (const child of [refused, jobs, main]) {
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
