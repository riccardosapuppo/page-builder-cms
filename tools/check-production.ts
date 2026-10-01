// node tools/check-production.ts
//
// Boots the CMS in production mode on 127.0.0.1:3902 and checks, over
// plain HTTP, what a visitor's browser gets from it:
// - a published page and the 404 page carry the static
//   Content-Security-Policy and no cookie, and nothing pins the address to
//   HTTPS (CMS_FORCE_SSL=0 turns forced SSL off for this local run);
// - the fingerprinted stylesheets and fonts under /assets come with
//   "public, max-age=31536000, immutable", and a file that does not exist
//   there is a 404 without that header;
// - the draft preview is never stored.
//
// It leaves nothing behind: the three production databases live in a
// folder under cms/tmp made for this run, the page it checks is made
// through the API on that empty database, the precompiled assets are
// removed with assets:clobber, the server is stopped with taskkill (its
// whole tree), and the port is shown closed before the folder is deleted.
// Ruby must be on the PATH and the gems of cms/ installed.
//
// Exits 0 when every check passes, 1 when one fails, 2 when the check
// could not run (the port taken, the server not starting).
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, openSync, closeSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const cms = join(root, "cms");
const PORT = 3902;
const BASE = `http://127.0.0.1:${PORT}`;
const IMMUTABLE = "public, max-age=31536000, immutable";
const run = `production-check-${process.pid}`;
const tmp = join(cms, "tmp", run);
const env = {
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

const results: string[] = [];
let failed = 0;
function check(ok: boolean, what: string, detail = ""): void {
  if (!ok) failed += 1;
  results.push(`${ok ? "ok  " : "FAIL"} ${what}${detail ? `: ${detail}` : ""}`);
}

// Who listens on the port, read from netstat: a listening line has a remote
// address of 0.0.0.0:0 or [::]:0 (the state word is in Windows' language).
function listeners(port: number): string[] {
  const out = spawnSync("netstat", ["-a", "-n", "-o"], { encoding: "utf8" }).stdout ?? "";
  return out.split(/\r?\n/).filter((line) => {
    const cols = line.trim().split(/\s+/);
    return cols[0] === "TCP" && cols[1]?.endsWith(`:${port}`) && /^(0\.0\.0\.0:0|\[::\]:0)$/.test(cols[2] ?? "");
  }).map((line) => line.trim().split(/\s+/).at(-1) ?? "?");
}

function rails(args: string[], label: string): void {
  const r = spawnSync("ruby", ["bin/rails", ...args], { cwd: cms, env, encoding: "utf8" });
  if (r.status !== 0) {
    console.log(`${label} failed (exit ${r.status}):\n${(r.stdout ?? "") + (r.stderr ?? "")}`);
    throw new Error(`${label} failed`);
  }
  console.log(`${label}: done`);
}

async function get(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(BASE + path, { redirect: "manual", ...init });
}

async function api(method: string, path: string, body: unknown): Promise<any> {
  const response = await fetch(BASE + path, { method, headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify(body) });
  if (!response.ok) throw new Error(`${method} ${path} answered ${response.status}: ${await response.text()}`);
  return response.json();
}

const taken = listeners(PORT);
if (taken.length) {
  console.log(`port ${PORT} is already taken (process ${taken.join(", ")}): nothing was started`);
  process.exit(2);
}

mkdirSync(tmp, { recursive: true });
let server: ChildProcess | undefined;
let exitCode = 0;
try {
  rails(["assets:precompile"], "assets:precompile");
  rails(["db:create", "db:schema:load"], "databases in " + `cms/tmp/${run}`);

  const log = join(tmp, "server.log");
  const fd = openSync(log, "w");
  server = spawn("ruby", ["bin/rails", "server", "-p", String(PORT), "-b", "127.0.0.1", "-P", join(tmp, "server.pid")], { cwd: cms, env, stdio: ["ignore", fd, fd] });
  closeSync(fd);

  let up = false;
  for (let i = 0; i < 240 && !up; i++) {
    if (server.exitCode !== null) break;
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
    check(owners.length === 1 && owners[0] === String(server.pid), `port ${PORT} is held by the server this check started`, `listening: ${owners.join(", ")}, started: ${server.pid}`);

    const created = await api("POST", "/api/pages", { title: "Production check", slug: "check" });
    const id = created.page.id;
    const document = {
      schemaVersion: 1,
      title: "Production check",
      sections: [{ id: "s1", type: "section", props: {}, style: { base: {} }, children: [{ id: "c1", type: "column", props: {}, style: { base: {} }, children: [
        { id: "h1", type: "heading", props: { level: 1, text: "Served in production" }, style: { base: {} }, children: [] },
      ] }] }],
    };
    await api("PUT", `/api/pages/${id}/draft`, { revision: 0, document, saveId: "check-1" });
    await api("POST", `/api/pages/${id}/publish`, {});
    await api("PATCH", `/api/pages/${id}`, { home: true });

    const home = await get("/");
    const html = await home.text();
    check(home.status === 200 && html.includes("Served in production"), "/ serves the published home page", `status ${home.status}`);
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
  }
} catch (error) {
  console.log(`the check stopped: ${(error as Error).message}`);
  exitCode = 2;
} finally {
  if (server?.pid) {
    const kill = spawnSync("taskkill", ["/PID", String(server.pid), "/T", "/F"], { encoding: "utf8" });
    console.log(`taskkill /PID ${server.pid} /T /F: exit ${kill.status}`);
    await new Promise((done) => setTimeout(done, 1000));
  }
  const still = listeners(PORT);
  check(still.length === 0, `port ${PORT} is closed after the stop`, still.length ? `still listening: ${still.join(", ")}` : "");
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
