// npm run shots
//
// node tools/shots.ts [--only <name>,<name>] [--out <folder>]
//
// The README's pictures, made from the running system and nothing else,
// into docs/images/ (--out for another folder): the editor with a block
// selected, the published page on a desktop and on a phone, the version
// history, Form responses, the browser demo with its bottom line, and the
// GIF of a real publication, and the site's header open in the editor as a
// page is. Their names, sizes and limits are listed in
// tools/lib/shot-images.ts, which also reads the result back.
//
// It starts a CMS of its own in the e2e environment on 127.0.0.1:3905
// (SHOTS_CMS_PORT), with databases and an Active Storage root of its own,
// runs the example site's seed (what `ruby bin/rails db:seed` does for a
// person), and starts the editor's development server on 127.0.0.1:4905
// (SHOTS_EDITOR_PORT). The demo is built into a folder of the run's and
// served as GitHub Pages serves it on the editor's port, once the editor's
// server is stopped. Everything is photographed headless, in Chromium, with
// the fonts loaded, motion reduced and animations off, in en-US and UTC.
//
// - Visitors send four answers from the served home page before Form
//   responses is photographed: the answers are in the CMS the way a
//   visitor's are.
// - The GIF is frames of the page: the served home page, the editor with
//   the hero's heading selected, the new words typed, saved, Publish
//   pressed and "Published" said, and the served page again with the
//   change. The frames are taken at 0.75 of the window's pixels
//   (1280 x 800 in the page, 960 x 600 in the file), read out of their PNGs
//   by Chromium and encoded by tools/lib/gif.ts.
// - The pictures are written to a folder of the run's first and copied to
//   the destination only when every one is made and passes the check, so a
//   run that fails leaves the pictures it found. The pictures in the
//   destination that no name lists are removed (a name that was dropped).
//
// At the end every server is stopped, its port shown closed, and the run's
// folders deleted and shown gone. A run that was killed leaves a folder in
// cms/tmp or the temporary folder named for these ports; the next run
// deletes it first, once it has seen the ports free.
//
// Exits 0 when every picture was made and passed, 1 when a page logged an
// error, a request left the servers, or a check failed, 2 when it could not
// run here (a port taken, no Ruby).
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium, type Browser, type BrowserContext, type Locator, type Page } from "playwright";
import { startPagesServer, type PagesServer } from "../builder/e2e/harness/pages-server.ts";
import { seedCms, startBuilder, startCms, type Server } from "../builder/e2e/harness/servers.ts";
import { welcomeSeen } from "../builder/e2e/harness/welcome.ts";
import { buildEditor } from "./lib/editor-build.ts";
import { encodeGif, readGif } from "./lib/gif.ts";
import { CouldNotRun, listeners } from "./lib/processes.ts";
import { checkImages, IMAGES, IMAGES_DIR, type ImageSpec } from "./lib/shot-images.ts";

const root = resolve(import.meta.dirname, "..");

const port = (name: string, fallback: number): number => {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!/^[0-9]+$/.test(raw) || !Number.isInteger(value) || value <= 0 || value > 65535) throw new CouldNotRun(`${name} must be a port number, not "${raw}"`);
  return value;
};

// Where the demo is served on GitHub Pages, and so here; the build's own
// page is checked to hold it.
const DEMO_BASE = "/page-builder-cms/";

function argumentsOf(argv: string[]): { only: ImageSpec[]; out: string } {
  let out = join(root, IMAGES_DIR);
  let names: string[] | null = null;
  for (let i = 0; i < argv.length; i += 1) {
    const argument = argv[i]!;
    if (argument === "--out" && argv[i + 1]) out = resolve(argv[(i += 1)]!);
    else if (argument === "--only" && argv[i + 1]) names = argv[(i += 1)]!.split(",").map((name) => name.trim()).filter(Boolean);
    else throw new CouldNotRun(`usage: node tools/shots.ts [--only <name>,<name>] [--out <folder>]; "${argument}" is not understood`);
  }
  if (names === null) return { only: [...IMAGES], out };
  const unknown = names.filter((name) => !IMAGES.some((spec) => spec.file === name));
  if (unknown.length > 0) throw new CouldNotRun(`--only names ${unknown.join(", ")}, which the script does not make (${IMAGES.map((spec) => spec.file).join(", ")})`);
  return { only: IMAGES.filter((spec) => names.includes(spec.file)), out };
}

const problems: string[] = [];
const servers: { stop(): Promise<string[]> }[] = [];

// What every page is held to: no error on the page, none in its console,
// and no request to anywhere but the run's own servers (a picture the
// editor made ready for upload is shown from its own blob: address).
function watch(page: Page, label: string, allowed: readonly string[]): void {
  page.on("console", (message) => {
    if (message.type() === "error") problems.push(`${label}: console error: ${message.text()}`);
  });
  page.on("pageerror", (error) => problems.push(`${label}: page error: ${error.message}`));
  page.on("request", (request) => {
    const url = request.url();
    if (url.startsWith("data:") || url.startsWith("blob:") || url.startsWith("about:")) return;
    if (!allowed.some((origin) => url.startsWith(origin))) problems.push(`${label}: request outside the run's servers: ${url}`);
  });
}

function must(condition: boolean, what: string): void {
  if (!condition) throw new Error(what);
}

// The page, ready to be photographed: its fonts loaded, and every picture
// it holds fetched and drawn (a published page's pictures are lazy: a
// visitor's browser fetches them as they scroll near).
async function settled(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await document.fonts.ready;
    const images = Array.from(document.images);
    for (const image of images) image.loading = "eager";
    await Promise.all(images.map((image) => (image.complete ? null : new Promise((done) => { image.onload = done; image.onerror = done; }))));
    await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
  });
}

const parked = (page: Page) => {
  const size = page.viewportSize()!;
  return page.mouse.move(size.width - 6, size.height - 6);
};

async function context(browser: Browser, options: Parameters<Browser["newContext"]>[0]): Promise<BrowserContext> {
  return browser.newContext({ locale: "en-US", timezoneId: "UTC", reducedMotion: "reduce", ...options });
}

async function drawer(page: Page, name: "Insert" | "Outline" | "History"): Promise<Locator> {
  const box = page.getByRole("complementary", { name, exact: true });
  if (!(await box.isVisible())) await page.locator(".topbar").getByRole("button", { name, exact: true }).click();
  await box.waitFor();
  return box;
}

const saved = (page: Page) => page.locator(".topbar .save-state", { hasText: /^Saved$/ }).waitFor();
const HERO = '.canvas [data-block-id="hero-heading"] h1';
const OLD_WORDS = "Swim at slack water";

// The editor on the example site's home page, ready for a person who has
// seen its first-run note.
async function openEditor(browser: Browser, editor: string, cms: string, viewport: { width: number; height: number }, label: string): Promise<Page> {
  const page = await (await context(browser, { viewport, deviceScaleFactor: 1, storageState: welcomeSeen(editor) })).newPage();
  page.setDefaultTimeout(60_000);
  watch(page, label, [editor, cms]);
  await page.goto(editor);
  await page.getByRole("button", { name: /^Switch page\. Open:/ }).waitFor();
  await page.locator(".canvas img").first().waitFor();
  await settled(page);
  return page;
}

// The folder a picture is written to before it is known to be right.
class Staging {
  readonly made: string[] = [];
  readonly folder: string;
  readonly wanted: ReadonlySet<string>;
  constructor(folder: string, wanted: ReadonlySet<string>) {
    this.folder = folder;
    this.wanted = wanted;
  }
  wants(file: string): boolean {
    return this.wanted.has(file);
  }
  // A shot some other picture's steps pass through is not kept.
  async shoot(page: Page, file: string): Promise<void> {
    if (!this.wants(file)) return;
    await page.screenshot({ path: join(this.folder, file), animations: "disabled", caret: "hide" });
    this.made.push(file);
    console.log(`shot ${file}`);
  }
}

// What a visitor sends from the served home page.
// The last one sent is the newest, the one Form responses opens: it has
// words to read.
const ANSWERS = [
  { name: "Tove", email: "tove@example.org", notes: "" },
  { name: "Maya", email: "maya@example.org", notes: "Can I bring a tow float? I swim from the slipway most mornings." },
  { name: "Jonas", email: "jonas@example.org", notes: "Is there parking close to the slipway?" },
  { name: "Noor", email: "noor@example.org", notes: "I swam my first mile in August and would like to swim with a group." },
];

async function visitorsSend(browser: Browser, cms: string): Promise<void> {
  for (const answer of ANSWERS) {
    const page = await (await context(browser, { viewport: { width: 1440, height: 900 } })).newPage();
    page.setDefaultTimeout(60_000);
    watch(page, `visitor ${answer.name}`, [cms]);
    await page.goto(`${cms}/`);
    await page.getByRole("textbox", { name: "Name" }).fill(answer.name);
    await page.getByRole("textbox", { name: "Email" }).fill(answer.email);
    if (answer.notes) await page.getByRole("textbox", { name: "Anything we should know?" }).fill(answer.notes);
    await page.getByRole("checkbox", { name: /I can swim 200 meters/ }).check();
    await page.getByRole("button", { name: "Send request" }).click();
    await page.getByText("Thank you. We reply within two days").waitFor();
    await page.context().close();
  }
  console.log(`${ANSWERS.length} answers sent from the served home page`);
}

async function publishedPages(browser: Browser, shots: Staging, cms: string): Promise<void> {
  if (shots.wants("published-desktop.png")) {
    const page = await (await context(browser, { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })).newPage();
    watch(page, "published desktop", [cms]);
    await page.goto(`${cms}/`);
    await settled(page);
    must((await page.getByRole("heading", { level: 1 }).innerText()).trim() === OLD_WORDS, "the served home page does not open with its heading");
    await shots.shoot(page, "published-desktop.png");
    await page.context().close();
  }
  if (shots.wants("published-phone.png")) {
    const page = await (await context(browser, { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })).newPage();
    watch(page, "published phone", [cms]);
    await page.goto(`${cms}/`);
    await settled(page);
    must(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "the served home page scrolls sideways on a phone");
    await shots.shoot(page, "published-phone.png");
    await page.context().close();
  }
}

// The hero's heading selected, its settings beside it, and the Outline.
async function editorShot(browser: Browser, shots: Staging, editor: string, cms: string): Promise<void> {
  const page = await openEditor(browser, editor, cms, { width: 1440, height: 900 }, "editor");
  await page.locator(HERO).click();
  await drawer(page, "Outline");
  const sidebar = page.getByRole("complementary", { name: "Settings" });
  await sidebar.getByRole("textbox", { name: "Text", exact: true }).focus();
  must((await page.locator(".canvas [data-editor-selected=true]").count()) === 1, "the hero's heading is not the one block selected");
  await parked(page);
  await shots.shoot(page, "editor.png");
  await page.context().close();
}

// The site's header, opened by a click on it around the home page, as a
// page is opened: its menu selected, the menu's links beside it, and the
// home page dimmed and locked under the header.
async function headerShot(browser: Browser, shots: Staging, editor: string, cms: string): Promise<void> {
  const page = await openEditor(browser, editor, cms, { width: 1440, height: 900 }, "header");
  const box = await page.locator('.canvas [data-theme-part="header"]').boundingBox();
  must(box !== null, "the canvas draws no header around the home page");
  await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.getByRole("button", { name: "Switch page. Open: Header" }).waitFor();
  await page.locator(".canvas [data-around-page]").waitFor();
  await page.locator('.canvas [data-block-id="header-menu"]').click();
  must((await page.locator(".canvas [data-editor-selected=true]").count()) === 1, "the header's menu is not the one block selected");
  await settled(page);
  await parked(page);
  await shots.shoot(page, "header.png");
  await page.context().close();
}

// Three changes in this session, the last undone, a version kept under a
// name, the History drawer open and nothing selected; then the changes
// undone, so the page is as the seed has it.
async function historyShot(browser: Browser, shots: Staging, editor: string, cms: string): Promise<Page> {
  const page = await openEditor(browser, editor, cms, { width: 1440, height: 900 }, "history");
  const sidebar = page.getByRole("complementary", { name: "Settings" });
  const group = async (name: string) => {
    const head = sidebar.getByRole("button", { name, exact: true });
    if ((await head.getAttribute("aria-expanded")) !== "true") await head.click();
  };
  const change = async (id: string, field: string, words: string, opened?: string) => {
    await page.locator(`.canvas [data-block-id="${id}"]`).click();
    if (opened) await group(opened);
    const box = sidebar.getByRole("textbox", { name: field, exact: true });
    await box.fill(words);
    await box.blur();
  };
  await change("join-form", "Button text", "Write to us", "Button and message");
  await change("quote-text", "Quote", "I came for the cold water and stayed for the tea and the talk.");
  await page.locator('.canvas [data-block-id="gallery-heading"]').click();
  await page.keyboard.press("Delete");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  // The block the undo brought back has the focus: Esc lets it go.
  await page.locator('.canvas [data-block-id="gallery-heading"]:focus').waitFor();
  await page.keyboard.press("Escape");
  const history = await drawer(page, "History");
  await history.getByRole("button", { name: "Save version" }).click();
  await history.getByRole("textbox", { name: /^Name/ }).fill("Before the winter series");
  await history.getByRole("textbox", { name: /^Name/ }).press("Enter");
  await history.getByText("Before the winter series").waitFor();
  await page.locator(".notice").getByRole("button", { name: "Dismiss" }).click();
  await saved(page);
  await history.getByRole("button", { name: /^Restore: / }).first().waitFor();
  await page.locator(".canvas").evaluate((canvas) => canvas.scrollTo(0, 0));
  await history.getByRole("button", { name: "Save version" }).focus();
  await parked(page);
  await shots.shoot(page, "history.png");
  for (let step = 0; step < 2; step += 1) await page.getByRole("button", { name: "Undo", exact: true }).click();
  await saved(page);
  await history.getByRole("button", { name: "Close History" }).click();
  return page;
}

// Form responses, from the mark's menu: the home page's form, the newest
// answer opened whole.
async function responsesShot(shots: Staging, page: Page): Promise<void> {
  // Nothing selected, the page at its top, behind the dimmed screen.
  const selected = page.locator(".canvas [data-editor-selected=true]");
  if ((await selected.count()) > 0) {
    await selected.focus();
    await page.keyboard.press("Escape");
    await selected.waitFor({ state: "detached" });
  }
  await page.locator(".canvas").evaluate((canvas) => canvas.scrollTo(0, 0));
  await page.getByRole("button", { name: "Page Builder CMS menu" }).click();
  await page.getByRole("menuitem", { name: "Form responses" }).click();
  const screen = page.getByRole("dialog", { name: "Form responses" });
  await screen.getByRole("list", { name: "Forms" }).getByRole("button", { name: /^Form in Join, Slack Water, 4 responses$/ }).click();
  const table = screen.getByRole("table", { name: /^Form in Join on Slack Water/ });
  await table.getByRole("rowheader").first().getByRole("button").click();
  // The newest answer, opened whole: its words are in the panel beside the list.
  await screen.getByText(ANSWERS.at(-1)!.notes).first().waitFor({ timeout: 10_000 }).catch(() => {
    throw new Error("Form responses does not show the newest answer opened");
  });
  await parked(page);
  await shots.shoot(page, "form-responses.png");
  await page.keyboard.press("Escape");
}

// The demo, built for GitHub Pages' path and served as Pages serves it: a
// first visit in a browser of its own, Publish pressed, its notice and the
// bottom line in the picture.
async function demoShot(browser: Browser, shots: Staging, workFolder: string, editorPort: number): Promise<void> {
  const built = join(workFolder, "demo");
  const { seconds } = buildEditor(built, { demo: true });
  console.log(`the demo was built in ${seconds.toFixed(1)} s`);
  must(readFileSync(join(built, "index.html"), "utf8").includes(`${DEMO_BASE}assets/`), `the demo's page does not load its files from ${DEMO_BASE}`);
  let pages: PagesServer | null = await startPagesServer(editorPort, { [DEMO_BASE]: built });
  servers.push(pages);
  try {
    const page = await (await context(browser, { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, storageState: welcomeSeen(pages.url) })).newPage();
    page.setDefaultTimeout(60_000);
    const own = `${pages.url}${DEMO_BASE}`;
    watch(page, "demo", [own]);
    page.context().on("page", (opened) => watch(opened, "demo, published page", [own]));
    await page.goto(own);
    await page.getByRole("button", { name: "Switch page. Open: Slack Water" }).waitFor();
    await page.locator(".canvas .frame").waitFor();
    await settled(page);
    await page.locator(HERO).click();
    const opened = page.context().waitForEvent("page");
    await page.getByRole("button", { name: "Publish", exact: true }).click();
    const view = await opened;
    await view.waitForLoadState("load");
    await view.close();
    await page.locator(".notice").getByText(/Published in this browser/).waitFor();
    must((await page.getByRole("complementary", { name: "About this demo" }).innerText()).startsWith("Browser demo: drafts stay in this browser."), "the demo's bottom line is not under the editor");
    await parked(page);
    await shots.shoot(page, "demo.png");
    await page.context().close();
  } finally {
    for (const line of await pages.stop()) console.log(line);
    servers.splice(servers.indexOf(pages), 1);
    pages = null;
  }
}

// Read a PNG's pixels with Chromium, which has a decoder: no PNG code of
// this project's to trust.
async function pixelsOf(decoder: Page, png: Buffer): Promise<{ width: number; height: number; rgba: Uint8Array }> {
  const out = await decoder.evaluate(async (base64) => {
    const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${base64}`)).blob(), { colorSpaceConversion: "none" });
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const draw = canvas.getContext("2d")!;
    draw.drawImage(bitmap, 0, 0);
    const { data, width, height } = draw.getImageData(0, 0, bitmap.width, bitmap.height);
    let binary = "";
    for (let at = 0; at < data.length; at += 0x8000) binary += String.fromCharCode(...data.subarray(at, at + 0x8000));
    return { width, height, base64: btoa(binary) };
  }, png.toString("base64"));
  return { width: out.width, height: out.height, rgba: Uint8Array.from(Buffer.from(out.base64, "base64")) };
}

// The publication, as frames of the pages: the served home page with the
// heading it has; the editor with that heading selected; the new words
// typed, a part of them and then all; saved; Publish pressed and said done;
// and the served page again, with the new heading.
async function publicationGif(browser: Browser, shots: Staging, editor: string, cms: string): Promise<void> {
  const window = { width: 1280, height: 800 };
  const options = { viewport: window, deviceScaleFactor: 0.75 };
  const editing = await (await context(browser, { ...options, storageState: welcomeSeen(editor) })).newPage();
  const visiting = await (await context(browser, options)).newPage();
  for (const page of [editing, visiting]) page.setDefaultTimeout(60_000);
  watch(editing, "gif editor", [editor, cms]);
  watch(visiting, "gif visitor", [cms]);
  const decoder = await browser.newPage();
  const frames: { png: Buffer; delayMs: number }[] = [];
  const frame = async (page: Page, delayMs: number) => {
    await settled(page);
    await parked(page);
    frames.push({ png: await page.screenshot({ animations: "disabled", caret: "hide" }), delayMs });
  };
  const words = ", together";
  await visiting.goto(`${cms}/`);
  must((await visiting.getByRole("heading", { level: 1 }).innerText()).trim() === OLD_WORDS, "the visitor's page does not start with the seed's heading");
  await frame(visiting, 1800);

  await editing.goto(editor);
  await editing.getByRole("button", { name: /^Switch page\. Open:/ }).waitFor();
  await editing.locator(".canvas img").first().waitFor();
  await editing.locator(HERO).click();
  const field = editing.getByRole("complementary", { name: "Settings" }).getByRole("textbox", { name: "Text", exact: true });
  await field.focus();
  await field.press("End");
  await frame(editing, 1200);
  // The words typed as a hand types them, with a frame at the way.
  await field.pressSequentially(words.slice(0, 3), { delay: 60 });
  await frame(editing, 350);
  await field.pressSequentially(words.slice(3, 7), { delay: 60 });
  await frame(editing, 350);
  await field.pressSequentially(words.slice(7), { delay: 60 });
  await frame(editing, 800);
  await field.blur();
  await saved(editing);
  must((await editing.locator(HERO).innerText()).trim() === OLD_WORDS + words, "the canvas does not show the new words");
  await frame(editing, 1200);
  const status = editing.locator(".topbar .tb-status");
  await editing.getByRole("button", { name: "Publish", exact: true }).click();
  await status.getByText(/^Published$/).waitFor();
  await frame(editing, 1600);

  await visiting.goto(`${cms}/`);
  must((await visiting.getByRole("heading", { level: 1 }).innerText()).trim() === OLD_WORDS + words, "the served page does not show the published words");
  await frame(visiting, 3000);

  const decoded = [];
  for (const { png, delayMs } of frames) {
    const { width, height, rgba } = await pixelsOf(decoder, png);
    must(width === 960 && height === 600, `a frame is ${width} x ${height}, not 960 x 600`);
    decoded.push({ rgba, delayMs });
  }
  const gif = encodeGif(decoded, 960, 600);
  writeFileSync(join(shots.folder, "publish.gif"), gif.bytes);
  shots.made.push("publish.gif");
  console.log(`publish.gif: ${decoded.length} frames, ${gif.whole} whole and ${gif.delta} as what changed, ${gif.bytes.length} bytes`);
  await editing.context().close();
  await visiting.context().close();
  await decoder.close();
}

// What an earlier run that was killed left, deleted before this one starts.
function sweep(cmsPort: number): void {
  const cmsTmp = join(root, "cms", "tmp");
  const mine = [
    ...(existsSync(cmsTmp) ? readdirSync(cmsTmp).filter((name) => name.startsWith(`e2e-${cmsPort}-`)).map((name) => join(cmsTmp, name)) : []),
    ...readdirSync(tmpdir()).filter((name) => name.startsWith(`pbc-shots-${cmsPort}-`)).map((name) => join(tmpdir(), name)),
  ];
  for (const folder of mine) {
    rmSync(folder, { recursive: true, force: true });
    console.log(`deleted what an earlier run left: ${folder}`);
  }
}

// Makes every picture asked for into the run's staging folder, and stops
// every server it started, whatever happened.
async function make(shots: Staging, wanted: Set<string>, work: string, cmsPort: number, editorPort: number): Promise<void> {
  let browser: Browser | null = null;
  try {
    const needsSystem = ["published-desktop.png", "published-phone.png", "editor.png", "header.png", "history.png", "form-responses.png", "publish.gif"].some((name) => wanted.has(name));
    browser = await chromium.launch({ headless: true });
    if (needsSystem) {
      const cms = await startCms(cmsPort);
      servers.push(cms);
      // The editor's server is ready when it passes the CMS's empty page list
      // through its proxy: it starts before the seed fills the list.
      const editor: Server = await startBuilder(editorPort, cms.url);
      servers.push(editor);
      console.log(seedCms(cms).trim());
      await publishedPages(browser, shots, cms.url);
      if (wanted.has("form-responses.png")) await visitorsSend(browser, cms.url);
      if (wanted.has("editor.png")) await editorShot(browser, shots, editor.url, cms.url);
      if (wanted.has("header.png")) await headerShot(browser, shots, editor.url, cms.url);
      if (wanted.has("history.png") || wanted.has("form-responses.png")) {
        const page = await historyShot(browser, shots, editor.url, cms.url);
        if (wanted.has("form-responses.png")) await responsesShot(shots, page);
        await page.context().close();
      }
      if (wanted.has("publish.gif")) await publicationGif(browser, shots, editor.url, cms.url);
      for (const server of [editor, cms]) {
        for (const line of await server.stop()) console.log(line);
        servers.splice(servers.indexOf(server), 1);
      }
    }
    if (wanted.has("demo.png")) await demoShot(browser, shots, work, editorPort);
  } finally {
    await browser?.close();
    for (const server of servers.reverse()) {
      for (const line of await server.stop().catch((error: unknown) => [`stop failed: ${String(error)}`])) console.log(line);
    }
  }
}

// What was made, read back and copied to `out`: only when every picture
// passes its check, and the run's pages logged no error.
function deliver(shots: Staging, only: readonly ImageSpec[], out: string): void {
  const wrong = checkImages(shots.folder, null, only);
  if (wrong.length > 0) throw new Error(`the pictures made do not pass their check, and none was copied:\n  ${wrong.join("\n  ")}`);
  mkdirSync(out, { recursive: true });
  for (const file of shots.made) copyFileSync(join(shots.folder, file), join(out, file));
  // The whole set is held to the list, and what no name lists is removed.
  if (only.length === IMAGES.length) {
    const listed = new Set(IMAGES.map((spec) => spec.file));
    for (const name of readdirSync(out)) {
      if (/\.(png|gif)$/.test(name) && !listed.has(name)) {
        rmSync(join(out, name));
        console.log(`removed ${name}: no name lists it`);
      }
    }
    const after = checkImages(out, null);
    if (after.length > 0) throw new Error(`${out} does not pass its check:\n  ${after.join("\n  ")}`);
  }
  for (const spec of only) {
    const bytes = readFileSync(join(out, spec.file));
    const detail = spec.kind === "gif" ? `, ${readGif(bytes).frames.length} frames` : "";
    console.log(`${spec.file}: ${bytes.length} bytes (limit ${spec.maxBytes})${detail}`);
  }
}

async function main(): Promise<void> {
  const { only, out } = argumentsOf(process.argv.slice(2));
  const wanted = new Set(only.map((spec) => spec.file));
  const cmsPort = port("SHOTS_CMS_PORT", 3905);
  const editorPort = port("SHOTS_EDITOR_PORT", 4905);
  for (const [number, what] of [[cmsPort, "the CMS"], [editorPort, "the editor"]] as const) {
    const taken = listeners(number);
    if (taken.length > 0) throw new CouldNotRun(`port ${number}, for ${what}, is already taken (${taken.map((l) => `${l.address}, process ${l.pid}`).join("; ")}): nothing was started`);
  }
  sweep(cmsPort);
  const work = mkdtempSync(join(tmpdir(), `pbc-shots-${cmsPort}-`));
  const shots = new Staging(join(work, "images"), wanted);
  mkdirSync(shots.folder, { recursive: true });
  try {
    await make(shots, wanted, work, cmsPort, editorPort);
    if (problems.length === 0) {
      deliver(shots, only, out);
      console.log(`RESULT: ${shots.made.length} pictures in ${out}`);
    }
  } finally {
    rmSync(work, { recursive: true, force: true });
    console.log(existsSync(work) ? `${work} could NOT be deleted` : `${work} deleted`);
    for (const number of [cmsPort, editorPort]) {
      const held = listeners(number);
      if (held.length > 0) problems.push(`port ${number} is still held by ${held.map((l) => `${l.address}, process ${l.pid}`).join("; ")}`);
    }
    if (existsSync(work)) problems.push(`${work} could not be deleted`);
    console.log(`ports ${cmsPort} and ${editorPort}: ${problems.some((p) => p.startsWith("port ")) ? "STILL HELD" : "nothing listens"}`);
  }
}

let exitCode = 0;
try {
  await main();
  if (problems.length > 0) {
    for (const problem of problems) console.error(`FAIL: ${problem}`);
    exitCode = 1;
  }
} catch (error) {
  if (error instanceof CouldNotRun) {
    console.error(`COULD NOT RUN: ${error.message}`);
    exitCode = 2;
  } else {
    console.error(`FAIL: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
    exitCode = 1;
  }
}
process.exit(exitCode);
