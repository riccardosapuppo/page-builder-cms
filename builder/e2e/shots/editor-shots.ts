// node e2e/shots/editor-shots.ts <folder>
//
// Photographs the editor in every state of the approved layout's shots
// but Schedule, which stage 4 builds (design/layout/shots: editor, add,
// structure, style, drag, tablet, publish, history, media, site-style,
// empty, shortcuts; design/layout/shots-extra: text-editing, small-block,
// insert-at-seam, page-tab, block-menu, more, new-section, phone, section,
// pages, conflict, offline, narrow-gutter, seam-hover, outline-col1,
// insert-col1, and insert-drawer, which the layout shoots at 1280),
// named as they are, plus the states the editor has that the layout
// draws elsewhere or not at all: a right click's menu (context), a text's
// link field (text-link), a drag from Insert (drag-from-insert), a
// dropped key that asks first, its window open (drop-asks), the
// hero's own space on phones (phone-spacing), Block edges, the mark's menu
// and About; and the home page as the CMS serves it to a tablet and a
// phone (served-tablet, served-phone).
// Headless, in two windows: 1280 by 800, and 1440 by 900, the size the
// layout itself was shot at. The shots of the larger window go in
// <folder>/1440.
//
// It starts a CMS and an editor server of its own (../harness/servers.ts)
// on E2E_CMS_PORT (3901) and E2E_BUILDER_PORT (4901), puts the example
// site of cms/db/seeds.rb in the CMS, and stops and deletes both at the end.
//
// Fails on a console error, a page error, or a request that leaves the two
// servers. Exits 2 on a missing argument.
import { chromium, expect, type Browser, type Locator, type Page } from "@playwright/test";
import { mkdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { repoRoot } from "../../build/paths.ts";
import { moveOnto, pickUp, settledTextEditor } from "../helpers/canvas.ts";
import { sendAgain } from "../helpers/heading.ts";
import { builderPort, cmsPort } from "../harness/ports.ts";
import { seedCms, startBuilder, startCms, type Server } from "../harness/servers.ts";
import { welcomeSeen } from "../harness/welcome.ts";

const folderArgument = process.argv[2];
if (!folderArgument) {
  console.error("usage: node e2e/shots/editor-shots.ts <folder>");
  process.exit(2);
}
const root = resolve(folderArgument);

const WINDOWS = [
  { width: 1280, height: 800, folder: root },
  { width: 1440, height: 900, folder: join(root, "1440") },
] as const;

const problems: string[] = [];
const servers: Server[] = [];
let shots = 0;

// A top bar drawer, opened from its key if it is not open yet.
async function drawer(page: Page, name: "Insert" | "Outline" | "History"): Promise<Locator> {
  const box = page.getByRole("complementary", { name, exact: true });
  if (!(await box.isVisible())) await page.locator(".topbar").getByRole("button", { name, exact: true }).click();
  await box.waitFor();
  return box;
}

async function closeDrawers(page: Page): Promise<void> {
  for (const name of ["Insert", "Outline", "History"] as const) {
    const close = page.getByRole("button", { name: `Close ${name}`, exact: true });
    if (await close.isVisible()) await close.click();
  }
}

// An Outline row, clicked where a person clicks it: on the row itself, not
// in the middle of the item, which holds the rows under it too.
async function row(page: Page, name: string): Promise<Locator> {
  await drawer(page, "Outline");
  return page.getByRole("treeitem", { name, exact: true }).first().locator(":scope > .t-row");
}

const device = (page: Page, name: "Desktop" | "Tablet" | "Phone") => page.getByRole("radiogroup", { name: "Look at the page on" }).getByRole("radio", { name: new RegExp(`^${name}`) }).click();

// A group of the sidebar, opened by its head if it is closed.
async function group(page: Page, name: string): Promise<void> {
  const head = page.getByRole("complementary", { name: "Settings" }).getByRole("button", { name, exact: true });
  if ((await head.getAttribute("aria-expanded")) !== "true") await head.click();
}

async function photograph(browser: Browser, url: string, allowed: readonly string[], window: (typeof WINDOWS)[number], first: boolean): Promise<void> {
  mkdirSync(window.folder, { recursive: true });
  const page = await browser.newPage({ viewport: { width: window.width, height: window.height }, deviceScaleFactor: 1, locale: "en-US", timezoneId: "UTC", reducedMotion: "reduce", storageState: welcomeSeen(url) });
  const label = `${window.width}x${window.height}`;
  const cmsUrl = allowed[0]!;
  page.on("console", (message) => {
    // The conflict and the dropped save the shots make on purpose leave
    // the browser's own lines.
    if (message.type() === "error" && !/status of 409 \(Conflict\)|net::ERR_INTERNET_DISCONNECTED/.test(message.text())) problems.push(`${label}: console error: ${message.text()}`);
  });
  page.on("pageerror", (error) => problems.push(`${label}: page error: ${error.message}`));
  // The last shot taken, to say where a problem came after.
  let after = "the start";
  page.on("request", (request) => {
    // An image made ready for upload is shown from the editor's own blob:
    // address, which never leaves the browser.
    if (!allowed.some((origin) => request.url().startsWith(origin) || request.url().startsWith(`blob:${origin}`))) problems.push(`${label}, after ${after}: request outside the servers: ${request.url()}`);
  });
  const away = () => page.mouse.move(window.width - 6, window.height - 6);
  const shoot = async (name: string) => {
    await page.waitForTimeout(150);
    await page.screenshot({ path: join(window.folder, `${name}.png`) });
    shots += 1;
    after = name;
    console.log(`shot ${label} ${name}.png`);
  };
  const heading = page.locator('.canvas [data-block-id="hero-heading"] h1');
  const sidebar = page.getByRole("complementary", { name: "Settings" });
  // Nothing selected: Esc on the selected block lets it go.
  const deselect = async () => {
    const selected = page.locator(".canvas [data-editor-selected=true]");
    if ((await selected.count()) === 0) return;
    await selected.focus();
    await page.keyboard.press("Escape");
    await page.locator(".canvas [data-editor-selected=true]").waitFor({ state: "detached" });
  };

  await page.goto(url);
  await page.getByRole("button", { name: /^Switch page\. Open:/ }).waitFor();
  await page.locator(".canvas img").first().waitFor();

  // #editor: the hero heading selected, its settings in the Block tab, the
  // focus on its Text field, as the layout draws it.
  await heading.click();
  await sidebar.getByRole("textbox", { name: "Text", exact: true }).focus();
  await away();
  await shoot("editor");

  // The heading's menu, opened by a right click on it, low on its second
  // line.
  const titleBox = await heading.boundingBox();
  if (!titleBox) throw new Error("the hero's heading is not on screen");
  await heading.click({ button: "right", position: { x: titleBox.width * 0.64, y: titleBox.height * 0.84 } });
  await page.getByRole("menu", { name: "Heading actions" }).waitFor();
  await shoot("context");
  await page.keyboard.press("Escape");

  // #shortcuts: the "?" window, over the same page.
  await page.keyboard.press("?");
  await page.getByRole("dialog", { name: "Keyboard shortcuts" }).waitFor();
  await away();
  await shoot("shortcuts");
  await page.keyboard.press("Escape");

  // #more (shots-extra): the heading's clamp, its More open, the same
  // items as the right click.
  await heading.click();
  await page.locator('.canvas [data-block-id="hero-heading"] > .clamp [data-key="more"]').click();
  await page.getByRole("menu", { name: "Heading actions" }).waitFor();
  await away();
  await shoot("more");
  await page.keyboard.press("Escape");

  // #add: the "+" on the heading's edge pressed: the yellow line opens
  // under it, the block picker beside it, its search taking the focus.
  await page.getByRole("button", { name: "Add a block after Heading" }).click();
  await page.getByRole("dialog", { name: "Add a block after Heading" }).waitFor();
  await away();
  await shoot("add");
  await page.keyboard.press("Escape");

  // #insert-at-seam (shots-extra): nothing selected, the "+" on the seam
  // below Hero, found by the pointer, pressed: the yellow line across the
  // page, the section picker above it. Then #new-section: 2 columns added
  // there, a large "+" in each empty column; undone after.
  await deselect();
  const hero = await page.locator('.canvas [data-block-id="hero"]').boundingBox();
  if (!hero) throw new Error("the hero is not on screen");
  await page.mouse.move(hero.x + hero.width / 2 - 120, hero.y + hero.height, { steps: 4 });
  await page.locator('.canvas [data-block-id="hero"] > .ins-sec').click();
  const sections = page.getByRole("dialog", { name: "Add a section after Hero" });
  await sections.waitFor();
  await away();
  await shoot("insert-at-seam");
  await sections.getByRole("button", { name: "2 columns" }).click();
  await page.locator(".canvas .ins-empty").nth(1).waitFor();
  await page.locator(".topbar .save-state", { hasText: /^Saved$/ }).waitFor();
  await away();
  await shoot("new-section");
  await page.keyboard.press("Control+z");
  await page.locator(".canvas .ins-empty").waitFor({ state: "detached" });
  await page.locator(".topbar .save-state", { hasText: /^Saved$/ }).waitFor();
  await page.locator(".canvas").evaluate((canvas) => canvas.scrollTo(0, 0));

  // #small-block (shots-extra): the hero's button selected, the same clamp
  // as every block's, running on below it; then #block-menu, its head
  // pressed: the moves, then More's items.
  await page.locator('.canvas [data-block-id="hero-button"]').click();
  await away();
  await shoot("small-block");
  await page.locator('.canvas [data-block-id="hero-button"] > .clamp .clamp-head').click();
  await page.getByRole("menu", { name: "Button: block menu" }).waitFor();
  await shoot("block-menu");
  await page.keyboard.press("Escape");

  // #narrow-gutter (shots-extra): Beginners' course in What we do, its
  // narrow clamp in the 32 gutter, the focus on the clamp's head.
  await page.locator('.canvas [data-block-id="swims-course"]').click();
  await page.locator('.canvas [data-block-id="swims-course"] > .clamp .clamp-head').focus();
  await away();
  await shoot("narrow-gutter");

  // #seam-hover (shots-extra): nothing selected, the pointer over the seam
  // between Gallery and See the bay: the hairline, the "+" and its tip.
  await deselect();
  await page.locator('.canvas [data-block-id="meet"]').evaluate((element) => element.scrollIntoView({ block: "center" }));
  const meet = await page.locator('.canvas [data-block-id="meet"]').boundingBox();
  if (!meet) throw new Error("See the bay is not on screen");
  await page.mouse.move(meet.x + meet.width / 2 - 120, meet.y + 1, { steps: 4 });
  await page.locator(".canvas .seam-tip").waitFor();
  await shoot("seam-hover");
  await away();
  await page.locator(".canvas").evaluate((canvas) => canvas.scrollTo(0, 0));

  // #text-editing (shots-extra): a text written on the canvas, its first
  // two words made bold from its clamp; then the link's field refusing an
  // address with its reason. Undone after, so the shots below show the
  // seed's page.
  const lead = page.locator('.canvas [data-block-id="hero-text"]');
  await lead.click();
  await lead.locator("p").click({ position: { x: 4, y: 10 } });
  await settledTextEditor(page, "hero-text");
  await page.keyboard.press("Control+Home");
  for (let i = 0; i < 10; i += 1) await page.keyboard.press("Shift+ArrowRight");
  await page.locator(".canvas").getByRole("toolbar", { name: "Text formatting" }).getByRole("button", { name: "Bold" }).click();
  await away();
  await shoot("text-editing");
  await page.keyboard.press("Control+k");
  const linkField = page.locator(".canvas .ov-link input");
  await linkField.fill("swims.example.org/dawn");
  await linkField.press("Enter");
  await page.locator(".canvas .ov-link .error").waitFor();
  await shoot("text-link");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Control+z");

  // #tablet: Tablet in the bottom line, the hero's first column chosen in
  // the Outline, its Spacing group, first and open, with its tablet-only
  // space.
  await away();
  await device(page, "Tablet");
  await (await row(page, "Column 1")).click();
  await closeDrawers(page);
  // The undo above saved.
  await page.locator(".topbar .save-state", { hasText: /^Saved$/ }).waitFor();
  await away();
  await shoot("tablet");

  // #style: the same column on the desktop, Spacing, Background and Text
  // size and color open, the focus on Space inside, as the layout draws it.
  await device(page, "Desktop");
  await group(page, "Background");
  await group(page, "Text size and color");
  await sidebar.getByRole("slider", { name: "Space inside" }).focus();
  await away();
  await shoot("style");

  // #section (shots-extra): the Join section, its Shown on and Name and
  // link open, the focus on its label.
  await (await row(page, "Join")).click();
  await closeDrawers(page);
  await group(page, "Shown on");
  await group(page, "Name and link");
  await sidebar.getByRole("textbox", { name: "Section label" }).focus();
  await away();
  await shoot("section");

  // #insert-drawer: the Questions' accordion selected, Insert open, its
  // sentence saying where a click puts a block.
  await page.locator('.canvas [data-block-id="questions-list"]').click();
  await drawer(page, "Insert");
  await away();
  await shoot("insert-drawer");

  // A drag from Insert: the Quote key held over See the bay's second
  // column, after its text, then the pointer on the line where it would
  // land (the line is the new block's own place, so it stays there); then
  // Esc, and nothing changed.
  await pickUp(page, page.getByRole("group", { name: "Content" }).getByRole("button", { name: "Quote" }));
  await moveOnto(page, page.locator('.canvas [data-block-id="meet-text"]'), "bottom");
  await page.locator(".live-caption:not(.live-caption-quiet)").waitFor();
  const line = await page.locator(".canvas .drop-slot").boundingBox();
  if (!line) throw new Error("no drop indicator on screen");
  await page.mouse.move(line.x + line.width * 0.7, line.y + line.height / 2, { steps: 6 });
  await page.getByText("Quote will be added to Column 2 in See the bay, after Text.").waitFor();
  await shoot("drag-from-insert");
  await page.keyboard.press("Escape");
  await page.mouse.up();
  // A key that asks first, dropped: the Gallery key released at the same
  // place, the media library open over the place it keeps; then Esc, and
  // nothing changed.
  await pickUp(page, page.getByRole("group", { name: "Media" }).getByRole("button", { name: "Gallery" }));
  await moveOnto(page, page.locator('.canvas [data-block-id="meet-text"]'), "bottom");
  await page.getByText("Gallery will be added to Column 2 in See the bay, after Text.").waitFor();
  await page.mouse.up();
  await page.getByRole("dialog", { name: "Media library" }).waitFor();
  await shoot("drop-asks");
  await page.keyboard.press("Escape");
  await page.getByRole("dialog", { name: "Media library" }).waitFor({ state: "detached" });
  await closeDrawers(page);

  // #drag: the hero's button picked up by its clamp's grip and held under
  // the heading: the drop line, the shaded areas and the live sentence in
  // the graphite bottom line; then Esc, and nothing changed.
  await page.locator(".canvas").evaluate((canvas) => canvas.scrollTo(0, 0));
  await page.locator('.canvas [data-block-id="hero-button"]').click();
  await pickUp(page, page.locator('.canvas [data-block-id="hero-button"] > .clamp [data-key="grip"]'));
  await moveOnto(page, heading, "bottom");
  await page.getByText("Button will move to Column 1 in Hero, after Heading.").waitFor();
  await shoot("drag");
  await page.keyboard.press("Escape");
  await page.mouse.up();

  // #insert-col1 (shots-extra): the hero's heading selected, Insert open
  // over the left of the page: the heading's clamp on its right, in the
  // gutter, and Insert's yellow line under it, its words at its right end.
  await page.locator(".canvas").evaluate((canvas) => canvas.scrollTo(0, 0));
  await heading.click();
  await drawer(page, "Insert");
  await away();
  await shoot("insert-col1");
  await closeDrawers(page);

  // #outline-col1 (shots-extra): the same heading, the Outline open over
  // the left of the page, its row taking the focus: the heading's clamp
  // on its right side, as under Insert.
  await drawer(page, "Outline");
  await page.locator('.tree [data-row-id="hero-heading"]').waitFor();
  await away();
  await shoot("outline-col1");
  await closeDrawers(page);

  // #phone (shots-extra): the phone preview, the hero's heading selected,
  // the focus on its Text field; then the hero itself, its Spacing group:
  // the hero's own space above and below on phones.
  await device(page, "Phone");
  await heading.click();
  await sidebar.getByRole("textbox", { name: "Text", exact: true }).focus();
  await away();
  await shoot("phone");
  await (await row(page, "Hero")).click();
  await closeDrawers(page);
  await group(page, "Spacing");
  await away();
  await shoot("phone-spacing");
  await device(page, "Desktop");

  // The same page as the CMS serves it to a tablet and a phone, to set
  // beside the canvas at 768 and 390: the page's own container queries, in
  // a window of that width. Once, in the first window's folder.
  if (first) {
    for (const [name, width, height] of [["served-tablet", 768, 1024], ["served-phone", 390, 844]] as const) {
      const served = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1, locale: "en-US", timezoneId: "UTC", reducedMotion: "reduce" });
      await served.goto(`${cmsUrl}/`);
      // The page's pictures load lazily: those on screen, before the shot.
      await served.waitForFunction(() => [...document.images].filter((image) => image.getBoundingClientRect().top < innerHeight).every((image) => image.complete && image.naturalWidth > 0));
      await served.evaluate(() => document.fonts.ready.then(() => undefined));
      await served.screenshot({ path: join(window.folder, `${name}.png`) });
      await served.close();
      shots += 1;
      console.log(`shot ${width}x${height} ${name}.png`);
    }
  }

  // #structure: the Outline open, the text in See the bay's second column
  // chosen in it, the focus on its row; in step with the canvas and the
  // breadcrumb.
  await page.locator('.canvas [data-block-id="meet-text"]').click();
  await drawer(page, "Outline");
  await page.locator('.tree [data-row-id="meet-text"]').focus();
  await away();
  await shoot("structure");
  await closeDrawers(page);

  // Block edges: every block's edges, nothing selected.
  await deselect();
  await page.getByRole("button", { name: "Block edges" }).click();
  await page.locator(".canvas").evaluate((canvas) => canvas.scrollTo(0, 0));
  await away();
  await shoot("block-edges");
  await page.getByRole("button", { name: "Block edges" }).click();

  // The mark's menu, opened from the keyboard; then About, from it.
  await heading.click();
  await page.getByRole("button", { name: "Page Builder CMS menu" }).focus();
  await page.keyboard.press("Enter");
  await page.getByRole("menu", { name: "Page Builder CMS" }).waitFor();
  await away();
  await shoot("app-menu");
  // By the keyboard too, so the Close button shows the focus ring.
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.getByRole("dialog", { name: "About" }).waitFor();
  await away();
  await shoot("about");
  await page.keyboard.press("Escape");

  // #publish: the hero's heading selected, the Publish menu open.
  await heading.click();
  await page.getByRole("button", { name: "More publish options" }).click();
  await page.getByRole("menu", { name: "Publish options" }).waitFor();
  await away();
  await shoot("publish");
  await page.keyboard.press("Escape");

  // #pages: the page switch open over the same page.
  await page.getByRole("button", { name: /^Switch page\. Open:/ }).click();
  await page.getByRole("dialog", { name: "Pages" }).waitFor();
  await away();
  await shoot("pages");
  await page.keyboard.press("Escape");

  // The media library: the hero's image selected, Replace image; the buoy
  // picture uploaded with no alt text yet, chosen, its field asking for
  // the text; the rock pools on their way, their bytes held back for the
  // shot. Then both go on and are deleted, so the library is as the seed
  // has it.
  await page.locator('.canvas [data-block-id="hero-image"]').click();
  await page.getByRole("button", { name: "Replace image" }).click();
  const library = page.getByRole("dialog", { name: "Media library" });
  const files = library.getByLabel("Images to upload");
  await files.setInputFiles({ name: "buoy-line.png", mimeType: "image/png", buffer: readFileSync(join(repoRoot, "example-site", "images", "g-buoys.png")) });
  await library.getByRole("radio", { name: "buoy-line.png, no alt text" }).waitFor();
  let release = () => {};
  const held = new Promise<void>((done) => {
    release = done;
  });
  await page.route("**/rails/active_storage/disk/**", async (route) => {
    if (route.request().method() === "PUT") await held;
    await route.fallback();
  });
  await files.setInputFiles({ name: "rock-pools.png", mimeType: "image/png", buffer: readFileSync(join(repoRoot, "example-site", "images", "g-rockpools.png")) });
  await library.getByRole("progressbar", { name: "Uploading rock-pools.png" }).waitFor();
  await library.getByText(/^Uploading, /).waitFor();
  await away();
  await shoot("media");
  release();
  await library.getByRole("radio", { name: "rock-pools.png, no alt text" }).waitFor({ timeout: 60_000 });
  await page.unroute("**/rails/active_storage/disk/**");
  const listed = await (await fetch(`${cmsUrl}/api/media`)).json() as { media: Array<{ id: string; filename: string }> };
  for (const item of listed.media.filter((m) => m.filename === "buoy-line.png" || m.filename === "rock-pools.png")) {
    const gone = await fetch(`${cmsUrl}/api/media/${item.id}`, { method: "DELETE", headers: { accept: "application/json" } });
    if (gone.status !== 204) throw new Error(`deleting the shot's ${item.filename} answered ${gone.status}`);
  }
  await page.keyboard.press("Escape");

  // #page-tab: nothing selected, the page's own settings, the focus on
  // its title.
  await deselect();
  await sidebar.getByRole("tab", { name: "Page", selected: true }).waitFor();
  await page.locator(".canvas").evaluate((canvas) => canvas.scrollTo(0, 0));
  await sidebar.getByRole("textbox", { name: "Title" }).focus();
  await away();
  await shoot("page-tab");

  // Site style, from the Page tab: Primary open, Harbour chosen; then back
  // to Sea, so the other shots show the site as the seed has it.
  await sidebar.getByRole("button", { name: "Site style", exact: true }).click();
  const style = page.getByRole("complementary", { name: "Site style" });
  await style.getByRole("button", { name: /^Primary/ }).click();
  await style.getByRole("radio", { name: "Harbour" }).click();
  await style.getByText("Saved for every page").waitFor();
  await style.getByRole("radio", { name: "Harbour" }).focus();
  await away();
  await shoot("site-style");
  await style.getByRole("button", { name: "Reset to Sea" }).click();
  await style.getByText("Saved for every page").waitFor();
  await style.getByRole("button", { name: "Back to Page" }).click();

  // #history: three changes made in this session, the last undone, and a
  // version kept under a name (the first time; the second window finds it);
  // nothing selected, so the Page tab. Then the changes are undone, so the
  // page is as the seed has it again.
  const change = async (id: string, field: string, words: string, opened?: string) => {
    await page.locator(`.canvas [data-block-id="${id}"]`).click();
    if (opened) await group(page, opened);
    const box = sidebar.getByRole("textbox", { name: field, exact: true });
    await box.fill(words);
    await box.blur();
  };
  await change("join-form", "Button text", "Write to us", "Button and message");
  await change("quote-text", "Quote", "I came for the cold water and stayed for the tea and the talk.");
  await page.locator('.canvas [data-block-id="gallery-heading"]').click();
  await page.keyboard.press("Delete");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  // The block the undo brought back has the focus: Esc lets it go, so the
  // page shows no selection, as in the layout.
  await page.locator('.canvas [data-block-id="gallery-heading"]:focus').waitFor();
  await page.keyboard.press("Escape");
  const history = await drawer(page, "History");
  if (first) {
    await history.getByRole("button", { name: "Save version" }).click();
    await history.getByRole("textbox", { name: /^Name/ }).fill("Before the winter series");
    await history.getByRole("textbox", { name: /^Name/ }).press("Enter");
    await history.getByText("Before the winter series").waitFor();
    // The notice saying so goes, as the layout draws no notice.
    await page.locator(".notice").getByRole("button", { name: "Dismiss" }).click();
  }
  await page.locator(".topbar .save-state", { hasText: /^Saved$/ }).waitFor();
  await history.getByRole("button", { name: /^Restore: / }).first().waitFor();
  await page.locator(".canvas").evaluate((canvas) => canvas.scrollTo(0, 0));
  await history.getByRole("button", { name: "Save version" }).focus();
  await away();
  await shoot("history");
  for (let step = 0; step < 2; step += 1) await page.getByRole("button", { name: "Undo", exact: true }).click();
  await page.locator(".topbar .save-state", { hasText: /^Saved$/ }).waitFor();
  await history.getByRole("button", { name: "Close History" }).click();

  // #conflict: the page saved elsewhere while this tab edits it, the
  // banner across the canvas; Reload settles it (the other save left the
  // page as it was). Then #offline: a save the network drops, its
  // countdown and toast; Retry now once the network is back.
  const pageId = new URL(page.url()).searchParams.get("page");
  const draft = await (await fetch(`${cmsUrl}/api/pages/${pageId}/draft`)).json() as { revision: number; document: unknown };
  const elsewhere = await fetch(`${cmsUrl}/api/pages/${pageId}/draft`, { method: "PUT", headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify({ revision: draft.revision, saveId: `shots-elsewhere-${window.width}`, document: draft.document }) });
  if (!elsewhere.ok) throw new Error(`the save from elsewhere answered ${elsewhere.status}`);
  await heading.click();
  const text = sidebar.getByRole("textbox", { name: "Text", exact: true });
  await text.fill("Swim at slack water, together");
  await text.blur();
  await page.getByRole("alert").waitFor();
  await away();
  await shoot("conflict");
  await page.getByRole("alert").getByRole("button", { name: "Reload" }).click();
  await page.getByRole("alert").waitFor({ state: "detached" });

  await page.route("**/api/pages/*/draft", (route) => (route.request().method() === "PUT" ? route.abort("internetdisconnected") : route.fallback()));
  await heading.click();
  await text.fill("Swim at slack water, together");
  await text.blur();
  await page.getByRole("group", { name: "Not saved" }).waitFor();
  await away();
  await shoot("offline");
  await page.unroute("**/api/pages/*/draft");
  // Back as the seed has it, and saved.
  await text.fill("Swim at slack water");
  await text.blur();
  // The editor's own retry may send it first and take the button away.
  await sendAgain(page, () => expect(page.locator(".topbar .save-state")).toHaveText("Saved"));

  // #empty: a new page, nothing on it yet; made the first time, opened the
  // second.
  await page.getByRole("button", { name: /^Switch page/ }).click();
  const pages = page.getByRole("dialog", { name: "Pages" });
  if (first) {
    await pages.getByRole("button", { name: "New page" }).click();
    await page.getByLabel("Title").fill("Spring series");
    await page.getByRole("button", { name: "Create page" }).click();
  } else {
    await pages.getByRole("button", { name: /^Spring series/ }).click();
  }
  await page.getByRole("heading", { name: "Start this page with a section" }).waitFor();
  await away();
  await shoot("empty");
  await page.close();
}

try {
  const cms = await startCms(cmsPort());
  servers.push(cms);
  // The editor's server is ready when it passes the CMS's empty page list
  // through its proxy: it starts before the seed fills the list.
  const builder = await startBuilder(builderPort(), cms.url);
  servers.push(builder);
  console.log(seedCms(cms).trim());
  const browser = await chromium.launch({ headless: true });
  try {
    for (const [index, window] of WINDOWS.entries()) await photograph(browser, builder.url, [cms.url, builder.url], window, index === 0);
  } finally {
    await browser.close();
  }
} catch (error) {
  problems.push(error instanceof Error ? error.stack ?? error.message : String(error));
} finally {
  for (const server of servers.reverse()) {
    for (const line of await server.stop().catch((error: unknown) => [`stop failed: ${String(error)}`])) console.log(line);
  }
}

if (problems.length > 0) {
  for (const problem of problems) console.error(`FAIL: ${problem}`);
  process.exit(1);
}
console.log(`RESULT: ${shots} shots in ${root}`);
