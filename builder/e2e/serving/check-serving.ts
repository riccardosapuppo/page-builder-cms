// npm run check:serving, from builder/ (rule 27 of the project's prompt,
// PIANO section 8). Checks over plain HTTP, and in headless Chromium, how
// the editor's shell and the published pages are served:
//
// The editor's shell, on the development server (what npm start runs) and
// on `vite preview` of a build made for the check:
// - its page is never stored: "no-store, no-cache, must-revalidate,
//   max-age=0", no ETag, no Last-Modified, and a conditional request still
//   gets the page, not a 304 (build/serving.ts);
// - the page carries the line that unregisters service workers in its own
//   path, its icon and its manifest;
// - an address that names no file is a 404, never the page: no fallback,
//   and no 404.html in the build;
// - the build's hashed files are kept a year, and a missing one is a 404
//   that is not.
// The published pages, the declared exception: no JavaScript (no script
// element, a Content-Security-Policy with script-src 'none'), no service
// worker (none served, none registered once a visitor's browser has loaded
// the page), and validators on purpose: an ETag, and a 304 when it is sent
// back. The draft's preview is never stored.
//
// Starts a CMS and the editor's servers of its own (e2e/harness), on
// E2E_CMS_PORT (3901) and E2E_BUILDER_PORT (4901), and stops them; the build
// goes to a folder of the system's temporary space, deleted at the end.
// Ruby with the CMS's gems and Playwright's Chromium are needed. Exits 0
// when every check passes, 1 when one fails (a server that crashes at
// boot or never answers included), 2 when it could not run (a port taken,
// no way to see who listens).
import { mkdtempSync, readdirSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { chromium } from "@playwright/test";
import { builderRoot } from "../../build/paths.ts";
import { ASSET_CACHE, PAGE_CACHE } from "../../build/serving.ts";
import { builderPort, cmsPort } from "../harness/ports.ts";
import { CouldNotRun } from "../../../tools/lib/processes.ts";
import { startBuilder, startCms, type Server } from "../harness/servers.ts";

const results: string[] = [];
let failures = 0;
function check(ok: boolean, what: string, detail = ""): void {
  if (!ok) failures += 1;
  results.push(`${ok ? "ok  " : "FAIL"} ${what}${detail && !ok ? `: ${detail}` : ""}`);
  console.log(results.at(-1));
}

const get = (base: string, path: string, headers: Record<string, string> = {}) => fetch(base + path, { headers, redirect: "manual" });

// The editor's shell, on one of Vite's servers.
async function shellChecks(base: string, label: string, built: boolean): Promise<void> {
  const page = await get(base, "/");
  const html = await page.text();
  check(page.status === 200 && html.includes('<div id="editor_root">'), `${label}: / is the editor's page`, `status ${page.status}`);
  check(page.headers.get("cache-control") === PAGE_CACHE, `${label}: the page is never stored (${PAGE_CACHE})`, page.headers.get("cache-control") ?? "no Cache-Control");
  check(page.headers.get("etag") === null && page.headers.get("last-modified") === null, `${label}: the page has no ETag and no Last-Modified`, `ETag ${page.headers.get("etag")}, Last-Modified ${page.headers.get("last-modified")}`);
  const again = await get(base, "/", { "if-none-match": page.headers.get("etag") ?? 'W/"0-0"', "if-modified-since": new Date().toUTCString() });
  check(again.status === 200, `${label}: a conditional request gets the page again, not a 304`, `status ${again.status}`);
  await again.arrayBuffer();
  if (built) {
    const index = await get(base, "/index.html");
    check(index.status === 200 && index.headers.get("cache-control") === PAGE_CACHE && index.headers.get("etag") === null, `${label}: /index.html likewise`, `${index.status} ${index.headers.get("cache-control")} ${index.headers.get("etag")}`);
    await index.arrayBuffer();
  }
  check(/navigator\.serviceWorker\?\.getRegistrations\(\)[\s\S]*unregister\(\)/.test(html) && html.includes('new URL("./", location.href)'), `${label}: the page unregisters service workers in its own path`);
  check(html.includes('rel="icon" href="/favicon.svg"') && html.includes('rel="manifest" href="/manifest.webmanifest"'), `${label}: the page links its icon and its manifest`);

  for (const path of ["/no-such-file.js", "/no-such-page", "/assets/no-such-file.js", "/404.html"]) {
    const missing = await get(base, path);
    const body = await missing.text();
    check(missing.status === 404 && !body.includes('<div id="editor_root">'), `${label}: ${path} is a 404, not the editor's page`, `status ${missing.status}`);
    if (path.startsWith("/assets/")) check(missing.headers.get("cache-control") !== ASSET_CACHE, `${label}: a missing built file is not kept`, missing.headers.get("cache-control") ?? "");
  }

  if (built) {
    const script = /<script type="module" crossorigin src="([^"]+)"/.exec(html)?.[1];
    check(script !== undefined && script.startsWith("/assets/"), `${label}: the page loads its hashed script from /assets/`, script ?? "no module script");
    if (script) {
      const asset = await get(base, script);
      check(asset.status === 200 && asset.headers.get("cache-control") === ASSET_CACHE, `${label}: ${script} is kept a year (${ASSET_CACHE})`, `${asset.status} ${asset.headers.get("cache-control")}`);
      await asset.arrayBuffer();
    }
  }
}

// The published pages and the preview, on the CMS.
async function publishedChecks(base: string): Promise<void> {
  const api = async (method: string, path: string, body: unknown) => {
    const response = await fetch(base + path, { method, headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify(body) });
    if (!response.ok) throw new Error(`${method} ${path} answered ${response.status}: ${await response.text()}`);
    return response.json() as Promise<{ page: { id: number } }>;
  };
  const title = "Served as published";
  const created = await api("POST", "/api/pages", { title, slug: "served" });
  const id = created.page.id;
  const document = { schemaVersion: 1, title, sections: [{ id: "s", type: "section", props: { label: "Story" }, style: { base: {} }, children: [{ id: "c", type: "column", props: {}, style: { base: {} }, children: [{ id: "h", type: "heading", props: { level: 1, text: title }, style: { base: {} }, children: [] }] }] }] };
  await api("PUT", `/api/pages/${id}/draft`, { revision: 0, document, saveId: "serving-1" });
  await api("POST", `/api/pages/${id}/publish`, {});

  const live = await get(base, "/served");
  const html = await live.text();
  check(live.status === 200 && html.includes(title), "published: /served is the published page", `status ${live.status}`);
  check(!/<script\b/i.test(html), "published: the page has no script element");
  check((live.headers.get("content-security-policy") ?? "").includes("script-src 'none'"), "published: its Content-Security-Policy runs no script", live.headers.get("content-security-policy") ?? "none");
  check(!/serviceWorker/.test(html) && !/rel="manifest"/.test(html), "published: the page registers no service worker and names no manifest");
  const etag = live.headers.get("etag");
  check(etag !== null, "published: the page carries an ETag, a validator on purpose", "no ETag");
  if (etag) {
    const revalidated = await get(base, "/served", { "if-none-match": etag });
    check(revalidated.status === 304, "published: sent back, the ETag gets a 304", `status ${revalidated.status}`);
    await revalidated.arrayBuffer();
  }
  for (const path of ["/service-worker.js", "/manifest.json", "/icon.png", "/icon.svg"]) {
    const missing = await get(base, path);
    await missing.arrayBuffer();
    check(missing.status === 404, `published: ${path} is a 404 on the CMS`, `status ${missing.status}`);
  }
  const preview = await get(base, `/preview/${id}`);
  await preview.arrayBuffer();
  check(preview.status === 200 && preview.headers.get("cache-control") === "no-store" && preview.headers.get("x-robots-tag") === "noindex", "published: the draft's preview is never stored, never indexed", `${preview.status} ${preview.headers.get("cache-control")} ${preview.headers.get("x-robots-tag")}`);

  // As a visitor's browser has it once the page has loaded.
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const scripts: string[] = [];
    page.on("request", (request) => {
      if (request.resourceType() === "script") scripts.push(request.url());
    });
    await page.goto(`${base}/served`);
    await page.waitForLoadState("load");
    const registrations = await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length);
    check(registrations === 0 && scripts.length === 0, "published: in Chromium, no script is fetched and no service worker is registered", `scripts ${scripts.join(", ")}; registrations ${registrations}`);
  } finally {
    await browser.close();
  }
}

let cms: Server | null = null;
let editor: Server | null = null;
let build: string | null = null;
let couldNotRun: string | null = null;
// A port taken, or no way to see who listens, is this machine's condition:
// the check could not run. A server that exits before it is ready, or
// never answers, is a failure like any other, counted below.
const noteStart = (what: string, error: unknown): void => {
  if (error instanceof CouldNotRun) couldNotRun = `${what} did not start: ${error.message.split("\n")[0]}`;
};
try {
  try {
    cms = await startCms(cmsPort());
  } catch (error) {
    noteStart("the CMS", error);
    throw error;
  }
  try {
    editor = await startBuilder(builderPort(), cms.url);
  } catch (error) {
    noteStart("the editor's development server", error);
    throw error;
  }
  await shellChecks(editor.url, "development server", false);
  for (const line of await editor.stop()) console.log(line);
  editor = null;

  build = mkdtempSync(join(tmpdir(), "pbc-serving-build-"));
  const vite = join(builderRoot, "node_modules", "vite", "bin", "vite.js");
  const built = spawnSync(process.execPath, [vite, "build", "--outDir", build, "--emptyOutDir"], { cwd: builderRoot, encoding: "utf8" });
  check(built.status === 0, "vite build wrote the editor for vite preview", `exit ${built.status}: ${(built.stdout + built.stderr).trim().split(/\r?\n/).slice(-3).join(" | ")}`);
  if (built.status === 0) {
    check(!readdirSync(build).includes("404.html"), "the build has no 404.html fallback page", readdirSync(build).join(", "));
    editor = await startBuilder(builderPort(), cms.url, { preview: build });
    await shellChecks(editor.url, "vite preview", true);
    for (const line of await editor.stop()) console.log(line);
    editor = null;
  }

  await publishedChecks(cms.url);
} catch (error) {
  if (!couldNotRun) check(false, "the check ran to its end", (error as Error).message);
} finally {
  for (const server of [editor, cms]) {
    if (!server) continue;
    try {
      for (const line of await server.stop()) console.log(line);
    } catch (error) {
      check(false, "the servers stopped and their ports closed", (error as Error).message);
    }
  }
  if (build) {
    rmSync(build, { recursive: true, force: true });
    check(!existsSync(build), "the check's build folder is deleted");
  }
}

if (couldNotRun) {
  console.log(`RESULT: could not run: ${couldNotRun}`);
  process.exit(2);
}
const passed = results.length - failures;
console.log(failures === 0 ? `RESULT: ${passed} checks passed` : `RESULT: ${failures} of ${results.length} checks failed`);
process.exit(failures === 0 ? 0 : 1);
