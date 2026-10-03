// node e2e/shots/editor-shots.ts <folder>
//
// Photographs the editor in the states the approved design's shots show
// (design/shots/editor.png, drag.png, shortcuts.png, empty.png, style.png,
// publish.png, site-style.png, history.png, save-states.png, and design/shots-extra/
// advanced.png, context.png, app-menu.png and about.png), plus the widget
// panel, the phone preview, a save retrying, and a text written on the
// canvas with its link's field (text, text-link), headless, in two windows: 1280 by 800, and
// 1440 by 900, the size the design itself was shot at, whose canvas is
// wide enough for the page's desktop layout (832, past the 800 where it
// starts). The shots of the larger window go in <folder>/1440.
//
// It starts a CMS and an editor server of its own (../harness/servers.ts)
// on E2E_CMS_PORT (3901) and E2E_BUILDER_PORT (4901), puts the example
// site of cms/db/seeds.rb in the CMS, and stops and deletes both at the end.
//
// Fails on a console error, a page error, or a request that leaves the two
// servers. Exits 2 on a missing argument.
import { chromium, type Browser, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { moveOnto, pickUp, settledTextEditor } from "../helpers/canvas.ts";
import { builderPort, cmsPort } from "../harness/ports.ts";
import { seedCms, startBuilder, startCms, type Server } from "../harness/servers.ts";

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

// A navigator row, clicked where a person clicks it: on the row itself, not
// in the middle of the item, which holds the rows under it too.
const row = (page: Page, name: string) => page.getByRole("treeitem", { name, exact: true }).first().locator(":scope > .t-row");

async function photograph(browser: Browser, url: string, allowed: readonly string[], window: (typeof WINDOWS)[number], first: boolean): Promise<void> {
  mkdirSync(window.folder, { recursive: true });
  const page = await browser.newPage({ viewport: { width: window.width, height: window.height }, deviceScaleFactor: 1, locale: "en-US", timezoneId: "UTC", reducedMotion: "reduce" });
  const label = `${window.width}x${window.height}`;
  const cmsUrl = allowed[0]!;
  page.on("console", (message) => {
    // The conflict and the dropped save the save-states shots make on
    // purpose leave the browser's own lines.
    if (message.type() === "error" && !/status of 409 \(Conflict\)|net::ERR_INTERNET_DISCONNECTED/.test(message.text())) problems.push(`${label}: console error: ${message.text()}`);
  });
  page.on("pageerror", (error) => problems.push(`${label}: page error: ${error.message}`));
  page.on("request", (request) => {
    if (!allowed.some((origin) => request.url().startsWith(origin))) problems.push(`${label}: request outside the servers: ${request.url()}`);
  });
  const away = () => page.mouse.move(window.width - 6, window.height - 6);
  const shoot = async (name: string) => {
    await page.waitForTimeout(150);
    await page.screenshot({ path: join(window.folder, `${name}.png`) });
    shots += 1;
    console.log(`shot ${label} ${name}.png`);
  };

  await page.goto(url);
  await page.getByRole("tree", { name: "Navigator" }).waitFor();
  await page.locator(".canvas img").first().waitFor();

  // #editor: the hero heading selected, its Content tab, the pointer on
  // the button.
  await page.locator('.canvas [data-block-id="hero-heading"] h1').click();
  await page.locator('.canvas [data-block-id="hero-button"]').hover();
  await shoot("editor");

  // #context: the heading's menu, opened by a right click on it, low on
  // its second line, where the design's pointer stands.
  const title = page.locator('.canvas [data-block-id="hero-heading"] h1');
  const titleBox = await title.boundingBox();
  if (!titleBox) throw new Error("the hero's heading is not on screen");
  await title.click({ button: "right", position: { x: titleBox.width * 0.64, y: titleBox.height * 0.84 } });
  await page.getByRole("menu", { name: "Heading actions" }).waitFor();
  await shoot("context");
  await page.keyboard.press("Escape");

  // #shortcuts: the "?" window, over the same page.
  await page.keyboard.press("?");
  await page.getByRole("dialog", { name: "Keyboard shortcuts" }).waitFor();
  await away();
  await shoot("shortcuts");
  await page.keyboard.press("Escape");

  // #text: the hero's text written on the canvas, its first two words made
  // bold from the block's bar, which carries bold, italic and link while
  // the text is open; then the link's field, refusing an address with its
  // reason. Undone after, so the shots below show the seed's page.
  const lead = page.locator('.canvas [data-block-id="hero-text"]');
  await lead.click();
  await lead.locator("p").click({ position: { x: 4, y: 10 } });
  await settledTextEditor(page, "hero-text");
  await page.keyboard.press("Control+Home");
  for (let i = 0; i < 10; i += 1) await page.keyboard.press("Shift+ArrowRight");
  await page.locator(".canvas .ov-bar").getByRole("button", { name: "Bold" }).click();
  await away();
  await shoot("text");
  await page.keyboard.press("Control+k");
  const linkField = page.locator(".canvas .ov-link input");
  await linkField.fill("swims.example.org/dawn");
  await linkField.press("Enter");
  await page.locator(".canvas .ov-link .error").waitFor();
  await shoot("text-link");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Control+z");

  // #style: the tablet width, the hero's first column, its Style tab.
  await away();
  await page.getByRole("button", { name: "Tablet" }).click();
  await row(page, "Column 1").click();
  await page.getByRole("tab", { name: "Style" }).click();
  await away();
  await shoot("style");

  // #advanced: the desktop width, the Join section, its Advanced tab.
  await page.getByRole("button", { name: "Desktop" }).click();
  await row(page, "Join").click();
  await page.getByRole("tab", { name: "Advanced" }).click();
  await away();
  await shoot("advanced");

  // The widget panel, the Join section still selected.
  await page.getByRole("tab", { name: "Add" }).click();
  await shoot("add");

  // #drag: the Quote tile held over See the bay's second column, after
  // its text, then the pointer on the line where it would land, as in the
  // design (the line is the new block's own place, so it stays there);
  // then Esc, and nothing changed.
  await pickUp(page, page.getByRole("group", { name: "Content" }).getByRole("button", { name: "Quote" }));
  await moveOnto(page, page.locator('.canvas [data-block-id="meet-text"]'), "bottom");
  await page.locator(".live-caption:not(.live-caption-quiet)").waitFor();
  const line = await page.locator(".canvas .drop-slot").boundingBox();
  if (!line) throw new Error("no drop indicator on screen");
  await page.mouse.move(line.x + line.width * 0.7, line.y + line.height / 2, { steps: 6 });
  await page.getByText("Quote will be added to Column 2 in See the bay, after Text.").waitFor();
  await shoot("drag");
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await page.getByRole("tab", { name: "Add" }).click();

  // The phone preview of the home page, the hero selected.
  await page.getByRole("button", { name: "Phone" }).click();
  await row(page, "Hero").click();
  await away();
  await shoot("phone");
  await page.getByRole("button", { name: "Desktop" }).click();

  // design/shots-extra/app-menu.png: the mark's menu, opened from the
  // keyboard; then About, from it. The heading's Content tab under them,
  // as in the design, not the Advanced tab an earlier shot left open.
  await page.locator('.canvas [data-block-id="hero-heading"] h1').click();
  await page.getByRole("tab", { name: "Content" }).click();
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

  // #publish: the hero's heading selected, its Content tab, the Publish
  // menu open.
  await page.locator('.canvas [data-block-id="hero-heading"] h1').click();
  await page.getByRole("tab", { name: "Content" }).click();
  await page.getByRole("button", { name: "More publish options" }).click();
  await page.getByRole("menu", { name: "Publish options" }).waitFor();
  await away();
  await shoot("publish");
  await page.keyboard.press("Escape");

  // #site-style: Primary open, Harbour chosen; then back to Sea, so the
  // other shots show the site as the seed has it.
  await page.getByRole("button", { name: "Site style", exact: true }).click();
  const style = page.getByRole("complementary", { name: "Site style" });
  await style.getByRole("button", { name: /^Primary/ }).click();
  await style.getByRole("radio", { name: "Harbour" }).click();
  await style.getByText("Saved for every page").waitFor();
  await style.getByRole("radio", { name: "Harbour" }).focus();
  await away();
  await shoot("site-style");
  await style.getByRole("button", { name: "Reset to Sea" }).click();
  await style.getByText("Saved for every page").waitFor();
  await style.getByRole("button", { name: "Close site style" }).click();

  // #history: three changes made in this session, the last undone, and a
  // version kept under a name (the first time; the second window finds it).
  // Then the changes are undone, so the page is as the seed has it again.
  const change = async (id: string, tab: "Content", field: string, words: string) => {
    await page.locator(`.canvas [data-block-id="${id}"]`).click();
    await page.getByRole("tab", { name: tab }).click();
    const box = page.getByRole("textbox", { name: field, exact: true });
    await box.fill(words);
    await box.blur();
  };
  await change("join-button", "Content", "Text", "Write to us");
  await change("quote-text", "Content", "Quote", "I came for the cold water and stayed for the tea and the talk.");
  await page.locator('.canvas [data-block-id="gallery-heading"]').click();
  await page.keyboard.press("Delete");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  // The block the undo brought back has the focus: Esc lets it go, so the
  // page shows no selection, as in the design.
  await page.locator('.canvas [data-block-id="gallery-heading"]:focus').waitFor();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "History" }).click();
  const history = page.getByRole("complementary", { name: "History" });
  if (first) {
    await history.getByRole("button", { name: "Save version" }).click();
    await history.getByRole("textbox", { name: /^Name/ }).fill("Before the winter series");
    await history.getByRole("textbox", { name: /^Name/ }).press("Enter");
    await history.getByText("Before the winter series").waitFor();
    // The notice saying so goes, as the design draws no notice.
    await page.locator(".notice").getByRole("button", { name: "Dismiss" }).click();
  }
  await page.locator(".topbar .save-state", { hasText: /^Saved$/ }).waitFor();
  await history.getByRole("button", { name: /^Restore: / }).first().waitFor();
  // As the design draws it: the widget panel, the top of the page.
  await page.getByRole("tab", { name: "Add" }).click();
  await page.locator(".canvas").evaluate((canvas) => canvas.scrollTo(0, 0));
  await away();
  await shoot("history");
  for (let step = 0; step < 2; step += 1) await page.getByRole("button", { name: "Undo", exact: true }).click();
  await page.locator(".topbar .save-state", { hasText: /^Saved$/ }).waitFor();
  await history.getByRole("button", { name: "Close history" }).click();

  // #save-states: the page saved elsewhere while this tab edits it, the
  // banner across the window; Reload settles it (the other save left the
  // page as it was). Then a save the network drops: its countdown and
  // toast; Retry now once the network is back.
  const pageId = new URL(page.url()).searchParams.get("page");
  const draft = await (await fetch(`${cmsUrl}/api/pages/${pageId}/draft`)).json() as { revision: number; document: unknown };
  const elsewhere = await fetch(`${cmsUrl}/api/pages/${pageId}/draft`, { method: "PUT", headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify({ revision: draft.revision, saveId: `shots-elsewhere-${window.width}`, document: draft.document }) });
  if (!elsewhere.ok) throw new Error(`the save from elsewhere answered ${elsewhere.status}`);
  await page.locator('.canvas [data-block-id="hero-heading"] h1').click();
  await page.getByRole("tab", { name: "Content" }).click();
  const text = page.getByRole("textbox", { name: "Text" });
  await text.fill("Swim at slack water, together");
  await text.blur();
  await page.getByRole("alert").waitFor();
  await away();
  await shoot("save-states");
  await page.getByRole("alert").getByRole("button", { name: "Reload" }).click();
  await page.getByRole("alert").waitFor({ state: "detached" });

  await page.route("**/api/pages/*/draft", (route) => (route.request().method() === "PUT" ? route.abort("internetdisconnected") : route.fallback()));
  await page.locator('.canvas [data-block-id="hero-heading"] h1').click();
  await text.fill("Swim at slack water, together");
  await text.blur();
  await page.getByRole("group", { name: "Not saved" }).waitFor();
  await away();
  await shoot("retrying");
  await page.unroute("**/api/pages/*/draft");
  // Back as the seed has it, and saved.
  await text.fill("Swim at slack water");
  await text.blur();
  await page.getByRole("button", { name: "Retry now" }).click();
  await page.locator(".topbar .save-state", { hasText: /^Saved$/ }).waitFor();

  // #empty: a new page, nothing on it yet; made the first time, opened the
  // second.
  await page.getByRole("button", { name: "Desktop" }).click();
  await page.getByRole("button", { name: /^Switch page/ }).click();
  if (first) {
    await page.getByRole("menuitem", { name: "New page…" }).click();
    await page.getByLabel("Title").fill("Spring series");
    await page.getByRole("button", { name: "Create page" }).click();
  } else {
    await page.getByRole("menuitem", { name: /^Spring series/ }).click();
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
