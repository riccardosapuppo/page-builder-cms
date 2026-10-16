// npm run check:serving, from builder/. Checks over plain HTTP, and in
// headless Chromium, how the editor's shell and the published pages are
// served, so no browser keeps an old editor and the published pages stay
// script-free and cacheable on purpose:
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
// The browser demo's shell, built twice and served as a static host serves
// it (../harness/pages-server.ts): with GitHub Pages' path, beside another
// project's site on the same origin, as projects share <user>.github.io;
// and at the root of a host of its own (DEMO_BASE=/), where it is the only
// site. Such a host sets its own headers, so no-store cannot be set there;
// what stands is checked, for each base:
// - the page at its base (and with ?preview=1) is the demo's, loading its
//   hashed script, icon and manifest from that path, and asking search
//   engines to leave it out of their indexes;
// - its line unregisters a service worker left in the demo's own path,
//   and, on Pages, leaves the other project's, in Chromium;
// - a missing file, or an address of the site the demo draws but does not
//   serve (a page's, an entry's), is a 404, never the demo's page, and the
//   build has no 404.html; an entry's page as the demo draws it
//   (?entry=1) is the demo's page;
// - the demo's files hold no CMS adapter and no CMS address, and in
//   Chromium the demo asks nothing outside its own path.
// The published pages, the declared exception: no JavaScript (no script
// element, a Content-Security-Policy with script-src 'none'), no service
// worker (none served, none registered once a visitor's browser has loaded
// the page), and validators on purpose: an ETag, and a 304 when it is sent
// back. The draft's preview is never stored. An entry's page
// (/<prefix>/<slug>) is served as a page is: no script, an ETag and its
// 304; a draft's address is a 404, an address the entry had answers 301
// to the one it has now; a page holding a Collection list gets a new ETag
// when an entry is published; a template's preview, drawn with an entry,
// is never stored either. A product's page, the shop on, is served as a
// page is, its price as money and its Add to cart a plain form to the
// cart's address, no script and no cookie, and a page listing the
// products draws each card's price as money; a change of the shop's
// currency gets the old ETag of each the new page, not a 304, and leaves
// a page that draws no shop its 304.
//
// Starts a CMS and the editor's servers of its own (e2e/harness), on
// E2E_CMS_PORT (3901) and E2E_BUILDER_PORT (4901), and the Pages-like
// server on E2E_DEMO_PORT (4903), and stops them; the builds go to folders
// of the system's temporary space, deleted at the end.
// Ruby with the CMS's gems and Playwright's Chromium are needed. Exits 0
// when every check passes, 1 when one fails (a server that crashes at
// boot or never answers included), 2 when it could not run (a port taken,
// no way to see who listens).
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { chromium } from "@playwright/test";
import { MARKS } from "../../build/bundle-check.ts";
import { DEMO_PAGES_BASE, DEMO_PREVIEW, DEMO_SITE } from "../../build/demo.ts";
import { builderRoot } from "../../build/paths.ts";
import { ASSET_CACHE, PAGE_CACHE } from "../../build/serving.ts";
import { builderPort, cmsPort, demoPort } from "../harness/ports.ts";
import { CouldNotRun } from "../../../tools/lib/processes.ts";
import { startPagesServer, type PagesServer } from "../harness/pages-server.ts";
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

// The demo's build for `base`, in a folder of `root`, served as a static
// host serves it: with GitHub Pages' path, beside `root`/other-project, a
// site of another project on the same origin; at "/", alone. The server,
// once started, is handed to `started`, for the caller to stop whatever
// happens.
const SW_SCRIPT = "self.addEventListener(\"fetch\", () => {});\n";
async function demoChecks(root: string, vite: string, base: string, started: (server: PagesServer) => void): Promise<void> {
  const onPages = base !== "/";
  const built = join(root, onPages ? base.slice(1, -1) : "own-host");
  const other = join(root, "other-project");
  const made = spawnSync(process.execPath, [vite, "build", "--mode", "demo", "--outDir", built, "--emptyOutDir"], { cwd: builderRoot, encoding: "utf8", env: { ...process.env, DEMO_BASE: base } });
  check(made.status === 0, `vite build --mode demo wrote the demo with the base ${base}, ${onPages ? "GitHub Pages' path" : "a host of its own"}`, `exit ${made.status}: ${(made.stdout + made.stderr).trim().split(/\r?\n/).slice(-3).join(" | ")}`);
  if (made.status !== 0) return;
  const label = onPages ? "demo on Pages" : "demo on its own host";
  check(!readdirSync(built).includes("404.html"), `${label}: the build has no 404.html fallback page`, readdirSync(built).join(", "));
  const scripts = readdirSync(join(built, "assets")).filter((name) => name.endsWith(".js"));
  const holding = scripts.filter((name) => { const text = readFileSync(join(built, "assets", name), "utf8"); return text.includes(MARKS.cmsAddress) || text.includes(MARKS.rails); });
  check(scripts.length > 0 && holding.length === 0, `${label}: its ${scripts.length} script files hold no CMS adapter and no CMS address`, holding.join(", ") || "no script file");
  // A service worker another program left in the demo's own path, and, on
  // Pages, another project's site with its own.
  writeFileSync(join(built, "left-behind-sw.js"), SW_SCRIPT);
  if (onPages) {
    mkdirSync(other, { recursive: true });
    writeFileSync(join(other, "index.html"), "<!doctype html><html lang=\"en\"><title>Another project</title><p>Another project's site.</p></html>\n");
    writeFileSync(join(other, "sw.js"), SW_SCRIPT);
  }

  const server = await startPagesServer(demoPort(), onPages ? { [base]: built, "/other-project/": other } : { [base]: built });
  started(server);
  const url = `${server.url}${base}`;
  const page = await get(server.url, base);
  const html = await page.text();
  check(page.status === 200 && html.includes('<div id="editor_root">'), `${label}: ${base} is the demo's page`, `status ${page.status}`);
  console.log(`info ${label}: the page's Cache-Control is the host's own, "${page.headers.get("cache-control")}", which a site cannot set`);
  check(html.includes('<meta name="robots" content="noindex, nofollow">'), `${label}: the page asks search engines to leave it out of their indexes`);
  check(/navigator\.serviceWorker\?\.getRegistrations\(\)[\s\S]*unregister\(\)/.test(html) && html.includes('new URL("./", location.href)'), `${label}: the page unregisters service workers in its own path`);
  const script = /<script type="module" crossorigin src="([^"]+)"/.exec(html)?.[1];
  check(script !== undefined && script.startsWith(`${base}assets/`) && !html.includes("/src/"), `${label}: the page loads its hashed script from ${base}assets/, not the source`, script ?? "no module script");
  for (const [rel, path] of [["icon", `${base}favicon.svg`], ["manifest", `${base}manifest.webmanifest`]] as const) {
    const linked = html.includes(`rel="${rel}" href="${path}"`);
    const answer = await get(server.url, path);
    await answer.arrayBuffer();
    check(linked && answer.status === 200, `${label}: the page links its ${rel} at ${path}, which is there`, `linked ${linked}, status ${answer.status}`);
  }
  // What a link to the demo previews with: the tags, each address
  // absolute on the demo's own host whatever host this copy is on, and the
  // picture at the build's root under its own name, its address carrying
  // the fingerprint of the very picture served (?v=, the first 12 hex
  // digits of its SHA-256): a site that keeps previews by address sees a
  // new picture as a new address.
  const preview = await get(server.url, `${base}${DEMO_PREVIEW.file}`);
  const previewBytes = new Uint8Array(await preview.arrayBuffer());
  const fingerprint = createHash("sha256").update(previewBytes).digest("hex").slice(0, 12);
  const tag = (property: string) => new RegExp(`<meta property="${property}" content="([^"]*)"`).exec(html)?.[1];
  check(tag("og:url") === DEMO_SITE && tag("og:image") === `${DEMO_SITE}${DEMO_PREVIEW.file}?v=${fingerprint}` && tag("og:image:width") === String(DEMO_PREVIEW.width) && tag("og:image:height") === String(DEMO_PREVIEW.height), `${label}: the page says what a shared link to the demo previews with, at ${DEMO_SITE}, the picture's address carrying the served picture's fingerprint`, `og:url ${tag("og:url")}, og:image ${tag("og:image")}, the picture's fingerprint ${fingerprint}`);
  check(preview.status === 200 && preview.headers.get("content-type") === "image/png" && previewBytes.byteLength > 0 && previewBytes.byteLength < 1_000_000, `${label}: the preview picture is at ${base}${DEMO_PREVIEW.file}, a PNG under 1 MB`, `${preview.status} ${preview.headers.get("content-type")}, ${previewBytes.byteLength} bytes`);
  if (script) {
    const asset = await get(server.url, script);
    await asset.arrayBuffer();
    check(asset.status === 200, `${label}: ${script} is there`, `status ${asset.status}`);
  }
  if (onPages) {
    const bare = await get(server.url, base.slice(0, -1));
    await bare.arrayBuffer();
    check(bare.status === 301 && bare.headers.get("location") === base, `${label}: ${base.slice(0, -1)} moves to ${base}`, `${bare.status} ${bare.headers.get("location")}`);
  }
  const viewed = await get(server.url, `${base}?preview=1`);
  check(viewed.status === 200 && (await viewed.text()).includes('<div id="editor_root">'), `${label}: ${base}?preview=1, a page the demo draws, is the demo's page`, `status ${viewed.status}`);
  const entryView = await get(server.url, `${base}?entry=1`);
  check(entryView.status === 200 && (await entryView.text()).includes('<div id="editor_root">'), `${label}: ${base}?entry=1, an entry's page the demo draws, is the demo's page`, `status ${entryView.status}`);
  for (const path of ["no-such-file.js", "no-such-page", "assets/no-such-file.js", "404.html", "winter-series", "news/first-swim"]) {
    const missing = await get(server.url, base + path);
    const body = await missing.text();
    check(missing.status === 404 && !body.includes('<div id="editor_root">'), `${label}: ${base}${path} is a 404, not the demo's page`, `status ${missing.status}`);
  }

  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext();
    const tab = await context.newPage();
    // The service workers are registered from a page of the same origin:
    // the other project's on Pages, a missing page of the demo's host
    // alone, whose 404 is still of its origin.
    await tab.goto(onPages ? `${server.url}/other-project/` : `${url}no-such-page`);
    const registered = await tab.evaluate(async (paths) => {
      if (paths.onPages) await navigator.serviceWorker.register(`/other-project/sw.js`, { scope: "/other-project/" });
      await navigator.serviceWorker.register(`${paths.base}left-behind-sw.js`, { scope: paths.base });
      return (await navigator.serviceWorker.getRegistrations()).map((r) => new URL(r.scope).pathname).sort();
    }, { base, onPages });
    const expected = onPages ? [base, "/other-project/"].sort() : [base];
    check(registered.join(" ") === expected.join(" "), `${label}: ${expected.length === 2 ? "two service workers registered for the test, the demo's path's and another project's" : "a service worker registered for the test in the demo's path"}`, registered.join(" "));
    const asked: string[] = [];
    context.on("request", (request) => asked.push(request.url()));
    await tab.goto(url);
    await tab.getByRole("button", { name: /^Switch page\. Open:/ }).waitFor({ timeout: 30_000 });
    let left: string[] = [];
    for (let tries = 0; tries < 20; tries += 1) {
      left = await tab.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).map((r) => new URL(r.scope).pathname).sort());
      if (left.length < expected.length) break;
      await new Promise((done) => setTimeout(done, 250));
    }
    const kept = onPages ? "/other-project/" : "";
    check(left.join(" ") === kept, `${label}: in Chromium, the page unregistered the service worker in its own path${onPages ? " and kept the other project's" : ""}`, left.join(" ") || "none left");
    const off = asked.filter((one) => !one.startsWith(url) && !one.startsWith("blob:") && !one.startsWith("data:"));
    check(asked.length > 0 && off.length === 0, `${label}: in Chromium, the demo opened on its example site asking nothing outside ${base} (${asked.length} requests)`, off.slice(0, 5).join(", "));
    await context.close();
  } finally {
    await browser.close();
  }
}

// The published pages and the preview, on the CMS.
async function publishedChecks(base: string): Promise<void> {
  const api = async <T = { page: { id: number } }>(method: string, path: string, body: unknown) => {
    const response = await fetch(base + path, { method, headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify(body) });
    if (!response.ok) throw new Error(`${method} ${path} answered ${response.status}: ${await response.text()}`);
    return response.json() as Promise<T>;
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

  await entryChecks(base, api);
  await shopChecks(base, api);

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

// An entry's page, and a page holding a Collection list, on the CMS: a
// collection whose template draws the entry's title, an entry published,
// another a draft.
type Api = <T = { page: { id: number } }>(method: string, path: string, body: unknown) => Promise<T>;
async function entryChecks(base: string, api: Api): Promise<void> {
  const node = (id: string, type: string, props: Record<string, unknown>, children: unknown[] = []) => ({ id, type, props, style: { base: {} }, children });
  const sectionOf = (...widgets: unknown[]) => [node("s", "section", {}, [node("c", "column", {}, widgets)])];
  const fields = [{ key: "summary", label: "Summary", type: "paragraph", required: false }];
  const collection = await api<{ id: number; template: { id: number } }>("POST", "/api/collections", { name: "Served news", prefix: "served-news", fields, sort: { by: "updatedAt", direction: "desc" } });
  const template = collection.template.id;
  await api("PUT", `/api/pages/${template}/draft`, { revision: 0, document: { schemaVersion: 1, title: "Served news", sections: sectionOf(node("t", "field", { field: "title", level: 1 })) }, saveId: "serving-template" });
  await api("POST", `/api/pages/${template}/publish`, {});
  const entries = `/api/collections/${collection.id}/entries`;
  const entry = await api<{ id: number; revision: number }>("POST", entries, { title: "An entry served", slug: "served-entry", values: { summary: "Its words." } });
  await api("POST", `${entries}/${entry.id}/publish`, {});
  const draft = await api<{ id: number }>("POST", entries, { title: "A draft entry", slug: "draft-entry", values: {} });
  const listed = await api("POST", "/api/pages", { title: "Served list", slug: "served-list" });
  const list = node("list", "collectionList", { collection: collection.id, count: 3, order: { by: "publishedAt", direction: "desc" }, layout: "list", columns: 3, linkLabel: "Read more", emptyText: "Nothing yet." });
  await api("PUT", `/api/pages/${listed.page.id}/draft`, { revision: 0, document: { schemaVersion: 1, title: "Served list", sections: sectionOf(list) }, saveId: "serving-list" });
  await api("POST", `/api/pages/${listed.page.id}/publish`, {});

  const page = await get(base, "/served-news/served-entry");
  const html = await page.text();
  check(page.status === 200 && html.includes("<h1>An entry served</h1>") && html.includes("<title>An entry served</title>"), "entry: /served-news/served-entry is its published template drawn with its values, under its title", `status ${page.status}`);
  check(!/<script\b/i.test(html) && (page.headers.get("content-security-policy") ?? "").includes("script-src 'none'"), "entry: the page has no script element, and its Content-Security-Policy runs none", page.headers.get("content-security-policy") ?? "none");
  const etag = page.headers.get("etag");
  const directives = (page.headers.get("cache-control") ?? "").split(",").map((one) => one.trim()).sort().join(", ");
  check(etag !== null && directives === "max-age=0, must-revalidate, public", "entry: the page carries an ETag, kept by a visitor's browser and asked about again", `${etag} ${page.headers.get("cache-control")}`);
  if (etag) {
    const revalidated = await get(base, "/served-news/served-entry", { "if-none-match": etag });
    await revalidated.arrayBuffer();
    check(revalidated.status === 304, "entry: sent back, the ETag gets a 304", `status ${revalidated.status}`);
  }
  for (const path of ["/served-news/draft-entry", "/served-news/no-such-entry", "/no-such-prefix/served-entry"]) {
    const missing = await get(base, path);
    await missing.arrayBuffer();
    check(missing.status === 404, `entry: ${path}, which no published entry has, is a 404`, `status ${missing.status}`);
  }
  const preview = await get(base, `/preview/${template}?entry=${draft.id}`);
  const previewed = await preview.text();
  check(preview.status === 200 && previewed.includes("<h1>A draft entry</h1>") && preview.headers.get("cache-control") === "no-store" && preview.headers.get("x-robots-tag") === "noindex", "entry: the template's preview, drawn with a draft entry, is never stored, never indexed", `${preview.status} ${preview.headers.get("cache-control")} ${preview.headers.get("x-robots-tag")}`);

  // The list's page: a new ETag once another entry is published.
  const before = await get(base, "/served-list");
  const listedHtml = await before.text();
  check(before.status === 200 && listedHtml.includes('href="/served-news/served-entry"'), "list: /served-list links the published entry's page", `status ${before.status}`);
  await api("POST", `${entries}/${draft.id}/publish`, {});
  const after = await get(base, "/served-list", { "if-none-match": before.headers.get("etag") ?? "" });
  const afterHtml = await after.text();
  check(after.status === 200 && after.headers.get("etag") !== before.headers.get("etag") && afterHtml.includes('href="/served-news/draft-entry"'), "list: once another entry is published, the old ETag gets the new page, not a 304", `status ${after.status}`);

  // A slug changed and published: the old address answers 301.
  await api("PUT", `${entries}/${entry.id}`, { revision: entry.revision, saveId: "serving-moved", title: "An entry served", slug: "served-entry-moved", values: { summary: "Its words." } });
  await api("POST", `${entries}/${entry.id}/publish`, {});
  const moved = await get(base, "/served-news/served-entry");
  await moved.arrayBuffer();
  check(moved.status === 301 && new URL(moved.headers.get("location") ?? "", base).pathname === "/served-news/served-entry-moved", "entry: the address it had answers 301 to the one it has now", `${moved.status} ${moved.headers.get("location")}`);
}

// A product's page, a page listing the products, and a page that draws no
// shop, on the CMS: products, a collection whose template draws the price
// and Add to cart, a product published, a page listing them with their
// prices, the shop on and selling them; then its currency changed. The
// shop is turned off again at the end.
async function shopChecks(base: string, api: Api): Promise<void> {
  const node = (id: string, type: string, props: Record<string, unknown>, children: unknown[] = []) => ({ id, type, props, style: { base: {} }, children });
  const sectionOf = (...widgets: unknown[]) => [node("s", "section", {}, [node("c", "column", {}, widgets)])];
  const fields = [{ key: "price", label: "Price", type: "number", required: false, min: 0, max: 100000 }, { key: "in-stock", label: "In stock", type: "toggle", required: false }];
  const products = await api<{ id: number; template: { id: number } }>("POST", "/api/collections", { name: "Served kit", prefix: "served-kit", fields, sort: { by: "title", direction: "asc" } });
  const template = products.template.id;
  await api("PUT", `/api/pages/${template}/draft`, { revision: 0, document: { schemaVersion: 1, title: "Served kit", sections: sectionOf(node("t", "field", { field: "title", level: 1 }), node("p", "field", { field: "price" }), node("cart", "addToCart", { label: "Add to cart", quantity: true })) }, saveId: "serving-kit" });
  await api("POST", `/api/pages/${template}/publish`, {});
  const entries = `/api/collections/${products.id}/entries`;
  const cap = await api<{ id: number }>("POST", entries, { title: "A served cap", slug: "served-cap", values: { price: 12, "in-stock": true } });
  await api("POST", `${entries}/${cap.id}/publish`, {});
  const shopPage = await api<{ page: { id: number } }>("POST", "/api/pages", { title: "Served shop", slug: "served-shop" });
  const kit = node("kit", "collectionList", { collection: products.id, count: 3, order: { by: "title", direction: "asc" }, layout: "list", columns: 3, price: "price", linkLabel: "See it", emptyText: "Nothing for sale yet." });
  await api("PUT", `/api/pages/${shopPage.page.id}/draft`, { revision: 0, document: { schemaVersion: 1, title: "Served shop", sections: sectionOf(kit) }, saveId: "serving-shop" });
  await api("POST", `/api/pages/${shopPage.page.id}/publish`, {});
  await api("PUT", "/api/shop", { enabled: true, currency: "GBP", productsCollectionId: products.id, priceField: "price" });
  try {
    const page = await get(base, "/served-kit/served-cap");
    const html = await page.text();
    check(page.status === 200 && html.includes("<p>£12.00</p>") && html.includes('<form class="sw-cart-add" method="post" action="/cart/items">') && html.includes(`name="entry" value="${cap.id}"`), "shop: a product's page draws its price as money and Add to cart as a form to the cart's address", `status ${page.status}`);
    check(!/<script\b/i.test(html) && (page.headers.get("content-security-policy") ?? "").includes("script-src 'none'") && page.headers.get("set-cookie") === null, "shop: a product's page has no script element, runs none and sets no cookie", page.headers.get("content-security-policy") ?? "none");
    const etag = page.headers.get("etag") ?? "";
    const listing = await get(base, "/served-shop");
    const listingHtml = await listing.text();
    check(listing.status === 200 && listingHtml.includes('<p class="sw-entry-price">£12.00</p>'), "shop: a page listing the products draws each card's price as money", `status ${listing.status}`);
    const listingEtag = listing.headers.get("etag") ?? "";
    const plain = await get(base, "/served-list");
    await plain.arrayBuffer();
    const plainEtag = plain.headers.get("etag") ?? "";

    await api("PUT", "/api/shop", { enabled: true, currency: "EUR", productsCollectionId: products.id, priceField: "price" });
    const after = await get(base, "/served-kit/served-cap", { "if-none-match": etag });
    const afterHtml = await after.text();
    check(after.status === 200 && after.headers.get("etag") !== etag && afterHtml.includes("<p>€12.00</p>"), "shop: once the shop's currency changes, the old ETag gets the product's page in the new currency, not a 304", `status ${after.status}`);
    const relisted = await get(base, "/served-shop", { "if-none-match": listingEtag });
    const relistedHtml = await relisted.text();
    check(relisted.status === 200 && relisted.headers.get("etag") !== listingEtag && relistedHtml.includes('<p class="sw-entry-price">€12.00</p>'), "shop: once the shop's currency changes, the old ETag gets the page listing the products in the new currency, not a 304", `status ${relisted.status}`);
    const still = await get(base, "/served-list", { "if-none-match": plainEtag });
    await still.arrayBuffer();
    check(still.status === 304, "shop: a page that draws no shop keeps its 304 when the shop's settings change", `status ${still.status}`);
  } finally {
    await api("PUT", "/api/shop", { enabled: false, currency: "GBP", productsCollectionId: null, priceField: null });
  }
}

let cms: Server | null = null;
let editor: Server | null = null;
let build: string | null = null;
const demo: { server: PagesServer | null } = { server: null };
let demoRoot: string | null = null;
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

  demoRoot = mkdtempSync(join(tmpdir(), "pbc-serving-demo-"));
  for (const base of [DEMO_PAGES_BASE, "/"]) {
    try {
      await demoChecks(join(demoRoot, base === "/" ? "root" : "pages"), vite, base, (server) => {
        demo.server = server;
      });
    } catch (error) {
      noteStart("the Pages-like server", error);
      throw error;
    }
    if (demo.server) for (const line of await demo.server.stop()) console.log(line);
    demo.server = null;
  }

  await publishedChecks(cms.url);
} catch (error) {
  if (!couldNotRun) check(false, "the check ran to its end", (error as Error).message);
} finally {
  for (const server of [editor, cms, demo.server]) {
    if (!server) continue;
    try {
      for (const line of await server.stop()) console.log(line);
    } catch (error) {
      check(false, "the servers stopped and their ports closed", (error as Error).message);
    }
  }
  for (const folder of [build, demoRoot]) {
    if (!folder) continue;
    rmSync(folder, { recursive: true, force: true });
    check(!existsSync(folder), "the check's build folder is deleted", folder);
  }
}

if (couldNotRun) {
  console.log(`RESULT: could not run: ${couldNotRun}`);
  process.exit(2);
}
const passed = results.length - failures;
console.log(failures === 0 ? `RESULT: ${passed} checks passed` : `RESULT: ${failures} of ${results.length} checks failed`);
process.exit(failures === 0 ? 0 : 1);
