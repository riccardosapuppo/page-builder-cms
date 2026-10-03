// node e2e/shots/editor-shots.ts <folder>
//
// Photographs the editor in the states the approved design's shots show
// (design/shots/editor.png, drag.png, shortcuts.png, empty.png, style.png
// and design/shots-extra/advanced.png and context.png), plus the widget
// panel and the phone preview, headless, in two windows: 1280 by 800, and
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
import { moveOnto, pickUp } from "../helpers/canvas.ts";
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
  page.on("console", (message) => {
    if (message.type() === "error") problems.push(`${label}: console error: ${message.text()}`);
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
