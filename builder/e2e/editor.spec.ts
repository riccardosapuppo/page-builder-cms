// The editor's shell in Chromium, against the run's own CMS through the
// editor's proxy, in the approved layout's frame: a page opens on the
// canvas; Enter on a block in Insert adds it where the selection is and
// the CMS keeps it, Insert saying where first; the bottom line's devices
// narrow the page root and the page lays out by its own width, which the
// bottom line says; the Outline and the canvas select together, and so do
// the bottom line's steps; the drawers, one at a time, each pushing the
// page aside, Insert as the Outline and History do, the page as wide beside
// each; the sidebar's tabs follow the selection; a 422 from
// the CMS shows on the field it names; an empty page and a new one invite a
// first section; sections anchored with the editor's own ids take none of
// them; the theme's header and footer are drawn around the page, locked;
// the page as wide as the layout promises, measured with the scrollbar
// shown; in a smaller window, the page is drawn smaller to fit while the
// editor's own controls and words on it keep their size, a hovered block's
// name stays inside the canvas, and a stacked column's tab and the page's
// title stay whole.
//
// Each test makes its own pages through the API, under addresses of its
// own, since the tests of a run share one CMS.
import { chromium, type Page } from "@playwright/test";
import { block, clampFaults } from "./helpers/canvas.ts";
import { cms, column, device, draftOf, drawer, expect, heading, makePage, open, saved, section, test, unique, watchQuietly, widget } from "./helpers/site.ts";

const row = async (page: Page, name: string) => {
  await drawer(page, "Outline");
  return page.getByRole("treeitem", { name, exact: true }).first().locator(":scope > .t-row");
};
const width = (page: Page) => page.locator(".statusbar .sb-width");

// The approved layout's window: the canvas gives the page 1088, its
// desktop layout.
test.use({ viewport: { width: 1440, height: 900 } });

test("Enter on a block in Insert adds it after the selected block, focused, and the CMS keeps it", async ({ page, request }) => {
  const { id } = await makePage(request, "Tiles", [section("s", "Tiles", [column("c", [widget("h", "heading", { level: 2, text: "Before the quote" }), widget("b", "button", { label: "After", href: "#" })])])]);
  await open(page, id);
  await page.locator('.canvas [data-block-id="h"]').click();
  const insert = await drawer(page, "Insert");
  // It says where a click puts the block, and takes the focus on its search.
  await expect(insert.locator(".drawer-where")).toHaveText("Click to add after Heading in Column 1 of Tiles, or drag to any column.");
  await expect(insert.getByRole("searchbox", { name: "Search blocks and sections" })).toBeFocused();
  const tile = page.getByRole("group", { name: "Content" }).getByRole("button", { name: "Quote" });
  await tile.focus();
  await page.keyboard.press("Enter");

  const blocks = page.locator('.canvas [data-block-id="c"] > [data-block-id]');
  await expect(blocks).toHaveCount(3);
  await expect(blocks.nth(1)).toHaveAttribute("data-block-type", "quote");
  await expect(blocks.nth(1)).toBeFocused();
  await expect(page.getByRole("toolbar", { name: "Quote tools" })).toBeVisible();
  // Its settings in the sidebar's Block tab; Insert still open, saying the
  // next block goes after the new one.
  await expect(page.getByRole("tab", { name: "Block", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(insert.locator(".drawer-where")).toHaveText("Click to add after Quote in Column 1 of Tiles, or drag to any column.");
  await saved(page);
  const draft = await draftOf(request, id);
  expect(draft.document.sections[0]!.children[0]!.children.map((w) => w.type)).toEqual(["heading", "quote", "button"]);

  await page.reload();
  await expect(page.locator('.canvas [data-block-id="c"] > [data-block-type="quote"]')).toHaveCount(1);
});

test("the bottom line's devices narrow the page root, the page lays out by its own width, and the bottom line says it", async ({ page, request }) => {
  const { id } = await makePage(request, "Widths", [section("s", "Two", [column("c1", [widget("t1", "heading", { level: 2, text: "Left" })]), column("c2", [widget("t2", "heading", { level: 2, text: "Right" })])])]);
  await open(page, id);
  const site = page.locator(".canvas .site");
  const left = page.locator('.canvas [data-block-id="c1"]');
  const right = page.locator('.canvas [data-block-id="c2"]');
  const layout = async () => {
    const [a, b, s] = [await left.boundingBox(), await right.boundingBox(), await site.boundingBox()];
    return { width: Math.round(s!.width), sideBySide: Math.abs(a!.y - b!.y) < 1 && b!.x > a!.x };
  };

  // 1440 wide: the canvas gives the page 1088, past the 800 of the desktop
  // layout (the scrollbar's gutter kept, whether or not it draws).
  await expect(width(page)).toHaveText("Page 1088 wide, desktop layout");
  expect(await layout()).toEqual({ width: 1088, sideBySide: true });
  await expect(device(page, "Desktop")).toHaveAttribute("aria-checked", "true");

  await device(page, "Tablet").click();
  await expect(device(page, "Tablet")).toHaveAttribute("aria-checked", "true");
  await expect(device(page, "Desktop")).toHaveAttribute("aria-checked", "false");
  await expect(width(page)).toHaveText("Page 768 wide, tablet layout");
  expect(await layout()).toEqual({ width: 768, sideBySide: false });

  // One Tab stop, the arrows along it.
  await page.keyboard.press("ArrowRight");
  await expect(device(page, "Phone")).toBeFocused();
  await expect(width(page)).toHaveText("Page 390 wide, phone layout");
  expect(await layout()).toEqual({ width: 390, sideBySide: false });
  // The window did not change: only the page root's container did.
  expect(page.viewportSize()).toEqual({ width: 1440, height: 900 });
});

test("the Outline and the canvas select the same block, both ways, and so do the bottom line's steps", async ({ page, request }) => {
  const { id } = await makePage(request, "Both ways", [section("s", "Story", [column("c", [widget("h", "heading", { level: 2, text: "Title" }), widget("q", "quote", { text: "Cold, then glad." })])])]);
  await open(page, id);

  await page.locator('.canvas [data-block-id="q"]').click();
  await drawer(page, "Outline");
  await expect(page.getByRole("treeitem", { name: "Quote: Cold, then glad." })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("treeitem", { name: "Story" })).toHaveAttribute("aria-expanded", "true");
  // Opened, the Outline gives the focus to the selection's row.
  await expect(page.getByRole("treeitem", { name: "Quote: Cold, then glad." })).toBeFocused();

  await (await row(page, "Column 1")).click();
  await expect(page.locator('.canvas [data-block-id="c"]')).toHaveAttribute("data-editor-selected", "true");
  await expect(page.getByRole("toolbar", { name: "Column 1 tools" })).toBeVisible();

  // The tree's keys move the selection, and the canvas with it.
  await page.keyboard.press("ArrowDown");
  await expect(page.locator('.canvas [data-block-id="h"]')).toHaveAttribute("data-editor-selected", "true");
  await expect(page.getByRole("treeitem", { name: "Heading: Title" })).toBeFocused();
  await expect(page.getByRole("textbox", { name: "Text" })).toHaveValue("Title");

  // The bottom line: the path down to the heading, each step selecting.
  const crumbs = page.getByRole("navigation", { name: "Selection" }).getByRole("button");
  await expect(crumbs).toHaveText(["Page", "Story", "Column 1", "Heading"]);
  await expect(crumbs.last()).toHaveAttribute("aria-current", "location");
  await crumbs.nth(1).click();
  await expect(page.locator('.canvas [data-block-id="s"]')).toHaveAttribute("data-editor-selected", "true");
  await expect(page.getByRole("treeitem", { name: "Story" })).toHaveAttribute("aria-selected", "true");
  await expect(crumbs).toHaveText(["Page", "Story"]);
  // The page: nothing selected, the sidebar's Page tab.
  await crumbs.first().click();
  await expect(page.locator(".canvas [data-editor-selected=true]")).toHaveCount(0);
  await expect(page.getByRole("tab", { name: "Page" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("navigation", { name: "Selection" })).toContainText("Nothing selected.");
});

test("Insert, the Outline and History push the page aside, the page as wide beside each; one at a time; Esc closes one, the focus back where it was", async ({ page, request }) => {
  const { id } = await makePage(request, "Drawers", [section("s", "Two", [column("c1", [heading("h1", "Left")]), column("c2", [heading("h2", "Right")])])]);
  await open(page, id);
  const site = page.locator(".canvas .site");
  const before = (await site.boundingBox())!;
  await block(page, "h2").click();
  const widths: number[] = [];
  for (const name of ["Insert", "Outline", "History"] as const) {
    const box = await drawer(page, name);
    await expect(page.locator(".drawer")).toHaveCount(1);
    await expect(page.locator(".topbar").getByRole("button", { name, exact: true })).toHaveAttribute("aria-pressed", "true");
    const over = (await box.boundingBox())!;
    const canvas = (await page.locator(".canvas").boundingBox())!;
    expect(over.y + over.height).toBeLessThanOrEqual(canvas.y + canvas.height + 0.5);
    // Beside the canvas, which gave up its room: nothing of the page under
    // it, the page narrower but still the desktop layout (807 wide in a
    // browser that draws a thin scrollbar, 817 in one that does not).
    // Insert since the owner's report of 15 October 2026: it floated over
    // the canvas's left, the page keeping its width under it.
    expect(over.x + over.width, name).toBeLessThanOrEqual(canvas.x + 0.5);
    const pushed = (await site.boundingBox())!;
    expect(pushed.x, name).toBeGreaterThanOrEqual(over.x + over.width);
    expect(pushed.width, name).toBeGreaterThanOrEqual(800);
    expect(pushed.width, name).toBeLessThan(before.width - 200);
    await expect(width(page)).toHaveText(`Page ${Math.round(pushed.width)} wide, desktop layout`);
    widths.push(pushed.width);
  }
  expect(widths, "the page beside Insert, the Outline and History").toEqual([widths[0], widths[0], widths[0]]);
  // History took the focus, on Save version; Esc gives it back to the key
  // that opened it.
  await expect(page.getByRole("button", { name: "Save version" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.locator(".drawer")).toHaveCount(0);
  await expect(page.locator(".topbar").getByRole("button", { name: "History", exact: true })).toBeFocused();
});

test("a field's edit is saved, and the CMS's 422 on a value shows on that value's field", async ({ page, request }) => {
  const { id } = await makePage(request, "Refused", [section("s", "Pictures", [column("c", [widget("i", "image", { url: "https://images.example.org/bay.jpg", alt: "The bay" })])])]);
  await open(page, id);
  await page.locator('.canvas [data-block-id="i"]').click();

  // The editor offers only the library's images; to get the CMS's own
  // refusal of one it does not have, the next save is rewritten on its
  // way to name such an image, and the CMS's answer comes back as it is.
  let rewritten = 0;
  await page.route("**/api/pages/*/draft", async (route) => {
    if (route.request().method() !== "PUT" || rewritten > 0) return route.continue();
    rewritten += 1;
    const body = JSON.parse(route.request().postData() ?? "{}") as { document: { sections: Array<{ children: Array<{ children: Array<{ props: Record<string, unknown> }> }> }> } };
    const image = body.document.sections[0]!.children[0]!.children[0]!;
    image.props = { mediaId: "nosuchimage", alt: image.props.alt };
    const response = await route.fetch({ postData: JSON.stringify(body) });
    await route.fulfill({ response });
  });

  const alt = page.getByRole("textbox", { name: "Alt text" });
  await alt.fill("The bay at dawn");
  await alt.blur();
  await expect(page.getByRole("status").filter({ hasText: "Not saved: a value was refused" })).toBeVisible();
  const imageField = page.locator(".field").filter({ has: page.getByRole("button", { name: "Replace image" }) });
  await expect(imageField.locator(".error")).toHaveText("The media library has no item nosuchimage.");
  await expect(alt).not.toHaveAttribute("aria-invalid", "true");
  await drawer(page, "Outline");
  await expect(page.getByRole("treeitem", { name: "Image: The bay at dawn, refused by the server" })).toBeVisible();
  expect(rewritten).toBe(1);

  // The next edit goes as it is, is saved, and the error goes.
  await alt.fill("The bay at slack water");
  await alt.blur();
  await saved(page);
  await expect(imageField.locator(".error")).toHaveCount(0);
  const draft = await draftOf(request, id);
  expect(draft.document.sections[0]!.children[0]!.children[0]!.props).toEqual({ url: "https://images.example.org/bay.jpg", alt: "The bay at slack water" });
});

test("an address another page has is refused on the Address field", async ({ page, request }) => {
  const first = await makePage(request, "Taken", [section("s", "One", [column("c", [])])]);
  const second = await makePage(request, "Taker", [section("s", "Two", [column("c", [])])]);
  await open(page, second.id);
  const address = page.getByRole("textbox", { name: "Address" });
  await expect(address).toHaveValue(second.slug);
  await address.fill(first.slug);
  await address.press("Enter");
  await expect(address).toHaveAttribute("aria-invalid", "true");
  await expect(page.locator(".field-error .error")).toContainText("address of another page");
  // The page kept its own.
  const answer = (await (await request.get(`${cms()}/api/pages/${second.id}`)).json()) as { page: { slug: string } };
  expect(answer.page.slug).toBe(second.slug);
});

test("a new page, made from the page switch, invites its first section, which the CMS keeps", async ({ page, request }) => {
  const { id } = await makePage(request, "Somewhere", [section("s", "Here", [column("c", [])])]);
  await open(page, id);
  const title = unique("Fresh page");
  await page.getByRole("button", { name: /^Switch page/ }).click();
  const pages = page.getByRole("dialog", { name: "Pages" });
  // The pages window: a search over the site's pages, this one marked.
  await expect(pages.getByRole("searchbox", { name: "Find a page" })).toBeFocused();
  await expect(pages.locator(".page-row[aria-current=page]")).toContainText("Somewhere");
  await pages.getByRole("button", { name: "New page" }).click();
  await expect(pages).toHaveCount(0);
  await page.getByRole("dialog", { name: "New page" }).getByLabel("Title").fill(title);
  await page.getByRole("button", { name: "Create page" }).click();
  await expect(page.getByRole("heading", { name: "Start this page with a section" })).toBeVisible();
  await expect(page.locator(".tb-status")).toHaveText("Not published yet");
  await drawer(page, "Outline");
  await expect(page.getByText("No sections yet.", { exact: false })).toBeVisible();
  const newId = Number(new URL(page.url()).searchParams.get("page"));
  expect(newId).not.toBe(id);

  await page.getByRole("group", { name: "Add a section" }).getByRole("button", { name: "2 columns" }).click();
  await expect(page.locator(".canvas .ins-empty")).toHaveCount(2);
  await expect(page.getByRole("treeitem", { name: "Section 1" })).toHaveAttribute("aria-selected", "true");
  await saved(page);
  const draft = await draftOf(request, newId);
  expect(draft.document.sections).toHaveLength(1);
  expect(draft.document.sections[0]!.children).toHaveLength(2);
});

test("sections anchored with the editor's own ids leave its names and ids alone", async ({ page, request }) => {
  // The canvas gives each section its anchor as an id, as the published
  // page does; these were the ids of the editor's own chrome.
  const anchors = ["root", "navigator-title", "canvas-keys", "invite-presets"];
  const sections = anchors.map((anchor, i) => ({ ...section(`s${i}`, `Band ${i + 1}`, [column(`c${i}`, [heading(`h${i}`, `Band ${i + 1}`)])]), props: { label: `Band ${i + 1}`, anchor } }));
  const { id } = await makePage(request, "Anchors", sections);
  await open(page, id);
  await expect(page.locator('.canvas .site [id="navigator-title"]')).toHaveCount(1);

  // ARIA takes the first element with an id: the Outline and the canvas
  // keep their own name and description.
  await drawer(page, "Outline");
  await expect(page.getByRole("complementary", { name: "Outline" })).toBeVisible();
  await expect(page.getByRole("main", { name: "Page canvas" })).toHaveAccessibleDescription(/^Arrow keys select the next or previous block/);
  const ids = await page.evaluate(() => [...document.querySelectorAll("[id]")].map((element) => ({ id: element.id, onPage: element.closest(".canvas .site") !== null })));
  const all = ids.map((entry) => entry.id);
  expect(all.filter((name, index) => all.indexOf(name) !== index)).toEqual([]);
  // And no id the editor gives itself is one a section could take.
  expect(ids.filter((entry) => !entry.onPage && /^[a-z][a-z0-9-]{0,63}$/.test(entry.id)).map((entry) => entry.id)).toEqual([]);
});

test("the site's header and footer are drawn around the page, locked, the Outline names them, and a click on either opens it as a page is opened, the page dimmed around it; a click on that page goes back", async ({ page, request }) => {
  const { id } = await makePage(request, "Framed", [section("s", "Story", [column("c", [heading("h", "Inside the theme")])])]);
  await open(page, id);
  const header = page.locator('.canvas [data-theme-part="header"]');
  const footer = page.locator('.canvas [data-theme-part="footer"]');
  await expect(header.locator("[data-block-type=menu]")).toBeVisible();
  await expect(footer.locator("[data-block-type=text]")).toBeVisible();
  // Locked: inert, so no click, focus or screen reader reaches them.
  await expect(header).toHaveAttribute("inert", "");
  await expect(footer).toHaveAttribute("inert", "");
  // The page starts with its header, a little under the top bar; the
  // sections come between the two.
  const frame = (await page.locator(".canvas .frame").boundingBox())!;
  const top = (await header.boundingBox())!;
  const story = (await page.locator('.canvas [data-block-id="s"]').boundingBox())!;
  const bottom = (await footer.boundingBox())!;
  expect(top.y).toBe(frame.y);
  expect(story.y).toBeGreaterThanOrEqual(top.y + top.height - 0.5);
  expect(bottom.y).toBeGreaterThanOrEqual(story.y + story.height - 0.5);

  // The Outline: the two parts' rows, above and below the tree.
  const tray = await drawer(page, "Outline");
  await expect(tray.locator(".t-theme")).toHaveText(["Header Every page: the same on every page. Opens it.", "Footer Every page: the same on every page. Opens it."]);
  const rows = await tray.locator(".t-theme, .tree").evaluateAll((elements) => elements.map((e) => e.className));
  expect(rows).toEqual(["t-row t-theme", "tree", "t-row t-theme"]);
  await page.locator(".topbar").getByRole("button", { name: "Outline", exact: true }).click();

  // The pointer over the header says what a click does there; a click
  // opens it, the page dimmed and locked around it, the footer under that.
  await page.mouse.move(top.x + top.width / 2, top.y + top.height / 2);
  await expect(page.locator(".canvas .frame")).toHaveAttribute("data-locked-hover", "header");
  await page.mouse.click(top.x + top.width / 2, top.y + top.height / 2);
  await expect(page.getByRole("button", { name: "Switch page. Open: Header" })).toBeVisible();
  await expect(page.locator('.canvas [data-editing-part="header"]')).toBeVisible();
  const around = page.locator(".canvas [data-around-page]");
  await expect(around).toHaveAttribute("inert", "");
  await expect(around).toContainText("Inside the theme");
  await expect(page.locator('.canvas [data-theme-part="footer"]')).toBeVisible();
  await expect(page.locator('.canvas [data-theme-part="header"]')).toHaveCount(0);
  // A click on the page dimmed around the header goes back to it.
  const dimmed = (await around.boundingBox())!;
  await page.mouse.click(dimmed.x + dimmed.width / 2, dimmed.y + Math.min(40, dimmed.height / 2));
  await expect(page.getByRole("button", { name: "Switch page. Open: Framed" })).toBeVisible();
  await expect(page.locator('.canvas [data-theme-part="header"]')).toHaveAttribute("inert", "");
});

// The page as wide as the approved layout promises, measured as a Windows
// browser draws it: with its scrollbar shown, which a headless browser
// hides unless told not to. 1088 wide at 1440 and the desktop layout at
// 1280 (928) with no drawer open; with Insert, the Outline or History
// open, which push the page aside, 807 at 1440 (still the desktop layout)
// and at 1280 the desktop page of 800 drawn at 81% (design/layout/NOTES.md,
// 4.8; Insert since the owner's report of 15 October 2026).
test("with the scrollbar shown, the page is 1088 wide at 1440 and keeps its desktop layout at 1280; Insert, the Outline and History make it 807, and 800 drawn at 81%", async ({ request, baseURL }) => {
  const { id } = await makePage(request, "Widths shown", [section("s", "Two", [column("c1", [heading("h1", "Left")]), column("c2", [heading("h2", "Right")])])]);
  // A browser of the test's own, which the shared fixture does not watch:
  // each of its pages is held to the same checks by the same function.
  const barred = await chromium.launch({ headless: true, ignoreDefaultArgs: ["--hide-scrollbars"] });
  try {
    for (const [windowWidth, windowHeight, least, pushed] of [[1440, 900, 1088, { page: 807, scaled: false, words: "Page 807 wide, desktop layout" }], [1280, 800, 800, { page: 800, scaled: true, words: "Page 800 wide, desktop layout, drawn at 81%" }]] as const) {
      const shown = await barred.newPage({ viewport: { width: windowWidth, height: windowHeight }, baseURL: baseURL!, locale: "en-US", timezoneId: "UTC" });
      const errors = await watchQuietly(shown, baseURL!);
      await open(shown, id);
      const measure = () => shown.evaluate(() => {
        const canvas = document.querySelector<HTMLElement>(".canvas")!;
        const frame = document.querySelector<HTMLElement>(".canvas .frame")!;
        return { bar: canvas.offsetWidth - canvas.clientWidth, page: frame.offsetWidth, scaled: frame.hasAttribute("data-scale"), sideways: canvas.scrollWidth - canvas.clientWidth };
      });
      const plain = await measure();
      // The scrollbar is there, or the check below would mean nothing.
      expect(plain.bar, `${windowWidth}: the scrollbar's width`).toBeGreaterThanOrEqual(6);
      expect(plain.page, `${windowWidth}: the page's width`).toBeGreaterThanOrEqual(least);
      expect(plain.scaled, `${windowWidth}: drawn smaller`).toBe(false);
      expect(plain.sideways).toBe(0);
      await expect(shown.locator(".statusbar .sb-width")).toHaveText(`Page ${plain.page} wide, desktop layout`);
      console.log(`${windowWidth} by ${windowHeight}, the scrollbar ${plain.bar} wide: the page is ${plain.page} wide`);
      for (const name of ["Insert", "Outline", "History"] as const) {
        await drawer(shown, name);
        const narrower = await measure();
        expect(narrower, `${windowWidth}, ${name} open`).toEqual({ ...plain, page: pushed.page, scaled: pushed.scaled });
        await expect(shown.locator(".statusbar .sb-width")).toHaveText(pushed.words);
        // The drawer beside the page, none of it under the drawer.
        const [over, canvas, site] = await Promise.all([
          shown.getByRole("complementary", { name, exact: true }).boundingBox(),
          shown.locator(".canvas").boundingBox(),
          shown.locator(".canvas .frame").boundingBox(),
        ]);
        expect(over!.x + over!.width, `${windowWidth}, ${name}: the drawer's right edge`).toBeLessThanOrEqual(canvas!.x);
        expect(site!.x, `${windowWidth}, ${name}: the page's left edge`).toBeGreaterThanOrEqual(over!.x + over!.width);
      }
      expect(errors, `${windowWidth}: errors and requests outside the run's servers`).toEqual([]);
      await shown.close();
    }
  } finally {
    await barred.close();
  }
});

// A smaller window, 1280 by 800: the canvas still has 928 for the page,
// its desktop layout whole, and the top bar has less room.
test.describe("in a 1280 by 800 window", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("the desktop page keeps its desktop layout whole; the tablet page too; neither scrolls sideways", async ({ page, request }) => {
    const { id } = await makePage(request, "Fitted", [section("s", "Two", [column("c1", [heading("h1", "Left")]), column("c2", [heading("h2", "Right")])])]);
    await open(page, id);
    const canvas = page.locator(".canvas");
    const frame = page.locator(".canvas .frame");
    const sideways = () => canvas.evaluate((element) => element.scrollWidth - element.clientWidth);
    const inside = async () => {
      const box = (await frame.boundingBox())!;
      const bench = (await canvas.boundingBox())!;
      return box.x >= bench.x && box.x + box.width <= bench.x + bench.width;
    };

    // Desktop: 928 wide, the page's desktop layout, two columns side by side.
    await expect(width(page)).toHaveText("Page 928 wide, desktop layout");
    await expect(page.locator(".canvas .site")).toHaveCSS("width", "928px");
    await expect(frame).not.toHaveAttribute("data-scale");
    const first = (await page.locator('.canvas [data-block-id="c1"]').boundingBox())!;
    const second = (await page.locator('.canvas [data-block-id="c2"]').boundingBox())!;
    expect(Math.abs(second.y - first.y)).toBeLessThan(1);
    expect(second.x).toBeGreaterThan(first.x + first.width - 1);
    expect(await sideways()).toBe(0);
    expect(await inside()).toBe(true);

    // Tablet: 768 wide, whole.
    await device(page, "Tablet").click();
    await expect(width(page)).toHaveText("Page 768 wide, tablet layout");
    await expect(page.locator(".canvas .site")).toHaveCSS("width", "768px");
    await expect(frame).not.toHaveAttribute("data-scale");
    expect(await sideways()).toBe(0);
    expect(await inside()).toBe(true);

    // The sidebar hidden: the canvas takes its room, the page wider.
    await device(page, "Desktop").click();
    await page.getByRole("button", { name: "Settings sidebar" }).click();
    await expect(width(page)).toHaveText("Page 1232 wide, desktop layout");
    await page.getByRole("button", { name: "Settings sidebar" }).click();
    await expect(width(page)).toHaveText("Page 928 wide, desktop layout");
  });

  test("on a page whose columns stack, the selection's toolbar is drawn whole, each of its keys its own where it is drawn", async ({ page, request }) => {
    const { id } = await makePage(request, "Stacked", [section("s", "Two", [column("c1", [heading("h1", "Left")]), column("c2", [heading("h2", "Right")])])]);
    await open(page, id);
    // The tablet page, where the columns stack.
    await device(page, "Tablet").click();
    await page.locator('.canvas [data-block-id="h1"]').click();
    await page.mouse.move(1270, 790);
    const first = (await page.locator('.canvas [data-block-id="c1"]').boundingBox())!;
    const second = (await page.locator('.canvas [data-block-id="c2"]').boundingBox())!;
    expect(second.y).toBeGreaterThan(first.y + first.height - 1);

    // The short heading's toolbar stands above it, in the section's own
    // space: each of its keys is the toolbar's where it is drawn.
    const clamp = page.getByRole("toolbar", { name: "Heading tools" });
    await expect(clamp).toHaveAttribute("data-side", "above");
    expect(await clampFaults(page)).toEqual([]);
    const keys = await clamp.getByRole("button").all();
    expect(keys).toHaveLength(5);
    for (const key of keys) {
      const box = (await key.boundingBox())!;
      const on = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest(".clamp")?.getAttribute("aria-label") ?? null, { x: box.x + box.width / 2, y: box.y + box.height / 2 });
      expect(on).toBe("Heading tools");
    }
  });

});

// A window under 1150 or so, 1024 by 768: the canvas has 672 for the page,
// so the desktop and tablet pages are drawn smaller to fit.
test.describe("drawn smaller, in a 1024 by 768 window", () => {
  test.use({ viewport: { width: 1024, height: 768 } });

  test("the desktop page keeps its desktop layout, drawn smaller; the tablet page is drawn whole; neither scrolls sideways", async ({ page, request }) => {
    const { id } = await makePage(request, "Fitted smaller", [section("s", "Two", [column("c1", [heading("h1", "Left")]), column("c2", [heading("h2", "Right")])])]);
    await open(page, id);
    const canvas = page.locator(".canvas");
    const frame = page.locator(".canvas .frame");
    const sideways = () => canvas.evaluate((element) => element.scrollWidth - element.clientWidth);
    const inside = async () => {
      const box = (await frame.boundingBox())!;
      const bench = (await canvas.boundingBox())!;
      return box.x >= bench.x && box.x + box.width <= bench.x + bench.width;
    };

    // Desktop: 800 wide, the page's desktop layout, two columns side by side.
    await expect(width(page)).toHaveText(/^Page 800 wide, desktop layout, drawn at 8\d%$/);
    await expect(page.locator(".canvas .site")).toHaveCSS("width", "800px");
    const first = (await page.locator('.canvas [data-block-id="c1"]').boundingBox())!;
    const second = (await page.locator('.canvas [data-block-id="c2"]').boundingBox())!;
    expect(Math.abs(second.y - first.y)).toBeLessThan(1);
    expect(second.x).toBeGreaterThan(first.x + first.width - 1);
    expect(await sideways()).toBe(0);
    expect(await inside()).toBe(true);

    // Tablet: 768 wide, whole, drawn smaller.
    await device(page, "Tablet").click();
    await expect(width(page)).toHaveText(/^Page 768 wide, tablet layout, drawn at 8\d%$/);
    await expect(page.locator(".canvas .site")).toHaveCSS("width", "768px");
    expect(await sideways()).toBe(0);
    expect(await inside()).toBe(true);

    // Phone: 390 wide, with room enough: not scaled.
    await device(page, "Phone").click();
    await expect(width(page)).toHaveText("Page 390 wide, phone layout");
    await expect(frame).not.toHaveAttribute("data-scale");
  });

  // The page drawn smaller draws its marks smaller too, since they hang
  // from its blocks; the editor's own controls and words among them keep
  // their size, each where it hangs: the selection's clamp, the "+" on
  // its edge and on its section's seam, a hovered block's name, a
  // dimension's badge, an empty column's "+" and words.
  test("the page drawn smaller keeps the editor's controls and words on it at their size, where they hang", async ({ page, request }) => {
    const { id } = await makePage(request, "Chrome", [
      section("s", "Two", [column("c1", [heading("h1", "Left"), heading("h3", "Below")]), column("c2", [heading("h2", "Right")])]),
      section("s2", "Empty", [column("c5", [])]),
    ]);
    await open(page, id);
    const frame = page.locator(".canvas .frame");
    const at = (selector: string) => `.canvas ${selector}`;
    const box = async (selector: string) => (await page.locator(at(selector)).boundingBox())!;
    // Its size as drawn against its own layout size (its used width and
    // height, which no transform changes), and the size its words are
    // drawn at.
    const drawn = (selector: string) => page.locator(at(selector)).evaluate((element) => {
      const shown = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      const w = shown.width / parseFloat(style.width);
      const h = shown.height / parseFloat(style.height);
      return { w: Number(w.toFixed(3)), h: Number(h.toFixed(3)), text: Number((parseFloat(style.fontSize) * h).toFixed(2)) };
    });
    const near = (a: number, b: number) => Math.abs(a - b) < 1;

    const pick = device;
    for (const device of ["Desktop", "Tablet"] as const) {
      await pick(page, device).click();
      await expect(frame).toHaveAttribute("data-scale", /^0\.8/);
      const scale = Number(await frame.getAttribute("data-scale"));

      // A hovered block's name: above its outline, from its left, its foot
      // 4 above the inside of the outline's 1.5 line.
      await page.locator(at('[data-block-id="h2"]')).hover();
      const label = '[data-block-id="h2"] > .ov-hover > .ov-label';
      expect(await drawn(label), device).toEqual({ w: 1, h: 1, text: 12 });
      const outline = await box('[data-block-id="h2"] > .ov-hover');
      const name = await box(label);
      expect(near(name.x, outline.x), device).toBe(true);
      expect(near(name.y + name.height, outline.y - 2.5 * scale), device).toBe(true);

      // Selected by the focus: from the second device on the heading is
      // selected already, and a click on a selected heading opens it for
      // writing.
      await page.locator(at('[data-block-id="h1"]')).focus();
      await page.mouse.move(1014, 758);
      await expect(page.locator(at('[data-block-id="h1"] > .ov-sel'))).toHaveCount(1);

      // The toolbar: its keys at their size, 28 square, its head 28 tall;
      // 6 above the frame, from its left edge, on the page drawn smaller
      // as on the page whole.
      const clamp = '[data-block-id="h1"] > .clamp';
      expect(await drawn(clamp), device).toMatchObject({ w: 1, h: 1 });
      const keys = await page.locator(at(`${clamp} > button`)).all();
      expect(keys.length, device).toBe(5);
      for (const [index, key] of keys.entries()) {
        const size = (await key.boundingBox())!;
        if (index === 0) expect(Math.round(size.height), device).toBe(28);
        else expect([Math.round(size.width), Math.round(size.height)], device).toEqual([28, 28]);
      }
      const clampBox = await box(clamp);
      const frameBox = await box('[data-block-id="h1"] > .ov-sel');
      await expect(page.locator(at(clamp)), device).toHaveAttribute("data-side", "above");
      expect(near(clampBox.x, frameBox.x), device).toBe(true);
      expect(near(clampBox.y + clampBox.height, frameBox.y - 6), device).toBe(true);

      // The "+" on the block's edge, 24 across, on the frame's bottom line,
      // in its middle; the seam's below the section, 32, on its edge.
      const plus = '[data-block-id="h1"] > .ov-sel > .ins-after';
      expect(await drawn(plus), device).toMatchObject({ w: 1, h: 1 });
      const plusBox = await box(plus);
      expect([Math.round(plusBox.width), Math.round(plusBox.height)], device).toEqual([24, 24]);
      expect(near(plusBox.x + plusBox.width / 2, frameBox.x + frameBox.width / 2), device).toBe(true);
      // (inside the frame's line, 2 thick)
      expect(near(plusBox.y + plusBox.height / 2, frameBox.y + frameBox.height - 2 * scale), device).toBe(true);
      const seam = '[data-block-id="s"] > .ins-sec';
      const seamBox = await box(seam);
      const band = await box('[data-block-id="s"]');
      expect([Math.round(seamBox.width), Math.round(seamBox.height)], device).toEqual([32, 32]);
      expect(near(seamBox.x + seamBox.width / 2, band.x + band.width / 2), device).toBe(true);
      expect(near(seamBox.y + seamBox.height / 2, band.y + band.height), device).toBe(true);

      // The dimension's badge, beside its line.
      const badge = '[data-block-id="h1"] > .ov-dim-v > span';
      expect(await drawn(badge), device).toEqual({ w: 1, h: 1, text: 12 });
      const dimension = await box('[data-block-id="h1"] > .ov-dim-v');
      const badgeBox = await box(badge);
      expect(near(badgeBox.x, dimension.x + 18 * scale), device).toBe(true);
      expect(near(badgeBox.y, dimension.y + 9 * scale), device).toBe(true);

      // An empty column's large "+" keeps its place on the page, drawn
      // smaller, and its sign and words at their size.
      const smaller = Number(scale.toFixed(3));
      expect(await drawn('[data-block-id="c5"] > .ins-empty'), device).toMatchObject({ w: smaller, h: smaller });
      const big = await box('[data-block-id="c5"] > .ins-empty > .ins-big');
      expect([Math.round(big.width), Math.round(big.height)], device).toEqual([44, 44]);
      expect(Math.round((await box('[data-block-id="c5"] > .ins-empty > .ins-empty-name')).height), device).toBe(20);
    }
  });

  // A hovered block's name stands above its outline, at its top left,
  // where the selected block's toolbar names a block. Where the canvas's
  // top would cut it (a block at the canvas's top), it stands inside the
  // outline's corner; where its right edge would (a block that starts
  // near it, its name longer than the room), at the outline's right end:
  // always whole, at its size, and the canvas never scrolls sideways.
  test("a hovered block's name stays inside the canvas: at its outline's top left, inside the corner at the canvas's top", async ({ page, request }) => {
    const text = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Bring a hat." }] }] };
    const { id } = await makePage(request, "Names", [section("s", "Two", [
      column("c1", [heading("h1", "Left")]),
      column("c2", [
        heading("h2", "Right side heading"),
        widget("t", "text", { doc: text }),
        widget("acc", "accordion", { items: [{ question: "Is it cold?", answer: "Bring a hat." }] }),
        widget("ib", "iconbox", { icon: "info", title: "Warm", text: "Bring a hat." }),
        { ...widget("b", "button", { label: "Join", href: "/join" }), style: { base: { align: "right" } } },
      ]),
    ])]);
    await open(page, id);
    const frame = page.locator(".canvas .frame");
    const choose = (name: "Desktop" | "Tablet" | "Phone") => device(page, name).click();
    // Where each block's name is when it is hovered, read from the
    // geometry: above the outline from its left ("start"), inside its
    // corner, or at its right end; whether it is whole inside the canvas
    // and drawn at its size; how far the canvas scrolls sideways; and
    // whether, at its default place, the canvas cuts it: the side taken
    // must be the default where nothing cuts it.
    const sides = async (targets: readonly string[]) => {
      const found: Record<string, string> = {};
      for (const target of targets) {
        const { width, height } = page.viewportSize()!;
        await page.mouse.move(width - 10, height - 10);
        await block(page, target).hover();
        await expect(block(page, target).locator(":scope > .ov-hover"), target).toHaveCount(1);
        const seen = await block(page, target).evaluate((root) => {
          const canvas = root.closest(".canvas")!;
          const bench = canvas.getBoundingClientRect();
          const left = bench.left + canvas.clientLeft;
          const top = bench.top + canvas.clientTop;
          const mark = root.querySelector(":scope > .ov-hover") as HTMLElement;
          const label = mark.querySelector(":scope > .ov-label")!;
          const name = label.getBoundingClientRect();
          // At its default place, for a moment, then back where it was.
          const was = mark.dataset.labelSide;
          delete mark.dataset.labelSide;
          const start = label.getBoundingClientRect();
          if (was !== undefined) mark.dataset.labelSide = was;
          const cut = start.top < top + 2 || start.right > left + canvas.clientWidth - 2;
          return {
            side: was ?? "start",
            inside: name.left >= left - 0.01 && name.right <= left + canvas.clientWidth + 0.01 && name.top >= top - 0.01,
            sideways: canvas.scrollWidth - canvas.clientWidth,
            size: Number((name.height / parseFloat(getComputedStyle(label).height)).toFixed(3)),
            cut,
          };
        });
        const { cut, ...held } = seen;
        expect({ target, ...held }).toEqual({ target, side: expect.stringMatching(/^(start|inside|end)$/), inside: true, sideways: 0, size: 1 });
        expect(held.side === "start", `${target}: cut at its default place: ${cut}`).toBe(!cut);
        found[target] = seen.side;
      }
      return found;
    };
    const all = ["h1", "h2", "t", "acc", "ib", "b"] as const;
    const each = (side: string) => Object.fromEntries(all.map((target) => [target, side]));

    // The desktop page, drawn smaller, the tablet page drawn smaller, the
    // phone page whole: every name above its outline, at its left.
    await expect(frame).toHaveAttribute("data-scale", /^0\.8/);
    expect(await sides(all)).toEqual(each("start"));
    await choose("Tablet");
    await expect(frame).toHaveAttribute("data-scale", /^0\.8/);
    expect(await sides(all)).toEqual(each("start"));
    await choose("Phone");
    await expect(frame).not.toHaveAttribute("data-scale");
    expect(await sides(all)).toEqual(each("start"));
    // The first block's top at the canvas's top: its name inside the corner.
    await block(page, "h1").evaluate((element) => {
      const canvas = element.closest(".canvas")!;
      canvas.scrollTop += element.getBoundingClientRect().top - (canvas.getBoundingClientRect().top + canvas.clientTop) - 1;
    });
    expect(await sides(["h1"])).toEqual({ h1: "inside" });
  });

  // The block just under the selection, hovered on the tablet page drawn
  // smaller: its name stands above its outline, in the gap where the
  // selection's frame runs, and is drawn over it, whole, rather than
  // struck through by the frame's line.
  test("a hovered block's name above its outline is drawn over the selection's frame", async ({ page, request }) => {
    const { id } = await makePage(request, "Over", [section("s", "One", [column("c", [heading("h1", "Selected first"), heading("h2", "Hovered under it")])])]);
    await open(page, id);
    await device(page, "Tablet").click();
    await expect(page.locator(".canvas .frame")).toHaveAttribute("data-scale", /^0\.8/);
    await block(page, "h1").click();
    await block(page, "h2").hover();
    await expect(block(page, "h2").locator(":scope > .ov-hover")).not.toHaveAttribute("data-label-side");
    const name = (await block(page, "h2").locator(":scope > .ov-hover > .ov-label").boundingBox())!;
    const selected = block(page, "h1").locator(":scope > .ov-sel");
    const frame = (await selected.boundingBox())!;
    // The frame's bottom line runs through the name: what could hide it is
    // there.
    expect(frame.y + frame.height, "the frame's bottom against the name").toBeGreaterThan(name.y);
    expect(frame.y + frame.height - 2, "the frame's bottom against the name").toBeLessThan(name.y + name.height);
    // Where the frame's bottom line runs through the name, the browser
    // finds the name over it. Asked of the browser's own order of drawing,
    // as a click asks it, not of pixels. Marks let clicks through; for the
    // moment of the question, the name and the frame take them.
    const label = await block(page, "h2").locator(":scope > .ov-hover > .ov-label").elementHandle();
    const { over, levels } = await selected.evaluate((frame, label) => {
      const name = label.getBoundingClientRect();
      const box = frame.getBoundingClientRect();
      const scale = box.height / (frame as HTMLElement).offsetHeight;
      const line = box.bottom - (parseFloat(getComputedStyle(frame).borderBottomWidth) * scale) / 2;
      const points: Record<string, [number, number]> = {
        "the line, at the name's left": [name.left + 4, line],
        "the line, at the name's middle": [(name.left + name.right) / 2, line],
        "the line, at the name's right": [name.right - 4, line],
      };
      const taking = [frame, label] as HTMLElement[];
      const before = taking.map((element) => element.style.pointerEvents);
      for (const element of taking) element.style.pointerEvents = "auto";
      try {
        const over = Object.fromEntries(Object.entries(points).map(([where, [x, y]]) => {
          const found = document.elementsFromPoint(x, y);
          const at = (part: Element) => found.findIndex((element) => part.contains(element));
          const [named, framed] = [at(label), at(frame)];
          return [where, named < 0 || framed < 0 ? `not both there: the name ${named}, the frame ${framed}` : named < framed ? "the name" : "the frame"];
        }));
        const level = (element: Element) => getComputedStyle(element).zIndex;
        return { over, levels: `the hovered outline at z-index ${level(label.parentElement!)}, the frame at ${level(frame)}` };
      } finally {
        taking.forEach((element, n) => { element.style.pointerEvents = before[n]!; });
      }
    }, label);
    expect(over, levels).toEqual({
      "the line, at the name's left": "the name",
      "the line, at the name's middle": "the name",
      "the line, at the name's right": "the name",
    });
  });

  // The canvas scrolls, or the window changes size, while the pointer stays
  // on a block: the hovered name takes its side again for the page as it
  // is then drawn, not for the moment before. The block is taller than the
  // pointer's travel, so the pointer is still on it after the change.
  test("a hovered block's name takes its side again when the canvas scrolls or the window changes size under a still pointer", async ({ page, request }) => {
    // A text taller than the pointer's travel at every scale, and sections
    // after it, so the canvas can scroll it to its top.
    const lines = (count: number) => ({ type: "doc", content: Array.from({ length: count }, (_, n) => ({ type: "paragraph", content: [{ type: "text", text: `Line ${n + 1} of the notes.` }] })) });
    const filler = (n: number) => section(`f${n}`, `Filler ${n}`, [column(`fc${n}`, [widget(`ft${n}`, "text", { doc: lines(9) })])]);
    const { id } = await makePage(request, "Resized", [section("s", "One", [column("c", [widget("t", "text", { doc: lines(30) })])]), filler(1), filler(2)]);
    await open(page, id);
    const frame = page.locator(".canvas .frame");
    await device(page, "Tablet").click();
    // The name's side, whether it is whole inside the canvas, and how far
    // the canvas scrolls sideways, two frames after the page settles.
    const seen = (target: string) => block(page, target).evaluate(async (root) => {
      for (let n = 0; n < 2; n += 1) await new Promise((done) => requestAnimationFrame(done));
      const canvas = root.closest(".canvas")!;
      const bench = canvas.getBoundingClientRect();
      const left = bench.left + canvas.clientLeft;
      const top = bench.top + canvas.clientTop;
      const mark = root.querySelector(":scope > .ov-hover");
      if (!mark) return { side: "none", inside: false, sideways: canvas.scrollWidth - canvas.clientWidth };
      const name = mark.querySelector(":scope > .ov-label")!.getBoundingClientRect();
      return {
        side: (mark as HTMLElement).dataset.labelSide ?? "start",
        inside: name.left >= left - 0.01 && name.right <= left + canvas.clientWidth + 0.01 && name.top >= top - 0.01,
        sideways: canvas.scrollWidth - canvas.clientWidth,
      };
    });

    await expect(frame).toHaveAttribute("data-scale", /^0\.8/);
    const text = block(page, "t");
    // The text brought near the canvas's top, the pointer on it: a scroll
    // of a little more than that room takes its top past the canvas's, the
    // pointer still on the text.
    const canvas = page.locator(".canvas");
    await text.evaluate((element) => {
      const bench = element.closest(".canvas")!;
      bench.scrollTop += element.getBoundingClientRect().top - (bench.getBoundingClientRect().top + bench.clientTop) - 60;
    });
    const low = (await text.boundingBox())!;
    // 200 down it: still on it once the canvas scrolls 59 more.
    expect(low.height).toBeGreaterThan(300);
    await page.mouse.move(low.x + 40, low.y + 200);
    expect(await seen("t")).toEqual({ side: "start", inside: true, sideways: 0 });
    // Its top 1 under the canvas's: the name, above the line, would be cut,
    // so it stands inside the corner, and above again once scrolled back.
    const back = await canvas.evaluate((element) => element.scrollTop);
    await canvas.evaluate((element) => { element.scrollTop += 59; });
    expect(await seen("t")).toEqual({ side: "inside", inside: true, sideways: 0 });
    await canvas.evaluate((element, top) => { element.scrollTop = top; }, back);
    expect(await seen("t")).toEqual({ side: "start", inside: true, sideways: 0 });
    // The window changes size, the canvas at its top and the pointer on the
    // text: the page whole, then drawn smaller again; the name whole each
    // time, and the canvas never scrolls sideways.
    await canvas.evaluate((element) => { element.scrollTop = 0; });
    const atTop = (await text.boundingBox())!;
    await page.mouse.move(atTop.x + 40, atTop.y + 200);
    await page.setViewportSize({ width: 1132, height: 768 });
    await expect(frame).not.toHaveAttribute("data-scale");
    expect(await seen("t")).toMatchObject({ inside: true, sideways: 0 });
    await page.setViewportSize({ width: 840, height: 768 });
    await expect(frame).toHaveAttribute("data-scale", /^0\.6/);
    expect(await seen("t")).toMatchObject({ inside: true, sideways: 0 });
  });

  test("the empty page's invitation keeps its size on a page drawn smaller", async ({ page, request }) => {
    const { id } = await makePage(request, "Invited", []);
    await page.goto(`/?page=${id}`);
    await expect(page.getByRole("heading", { name: "Start this page with a section" })).toBeVisible();
    const frame = page.locator(".canvas .frame");
    const sizes = () => page.locator(".canvas .invite").evaluate((invite) => ["h2", ".layout-btn", ".preset"].map((selector) => Math.round(invite.querySelector(selector)!.getBoundingClientRect().height * 10) / 10));
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(frame).not.toHaveAttribute("data-scale");
    const whole = await sizes();
    await page.setViewportSize({ width: 1024, height: 768 });
    await expect(frame).toHaveAttribute("data-scale", /^0\.8/);
    expect(await sizes()).toEqual(whole);
  });
});

// The top bar in a 1280 by 800 window: less room for its words.
test.describe("the top bar, in a 1280 by 800 window", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  // Whether every letter of an element's words shows: their own width, to
  // the fraction of a pixel, against the box's. A box a quarter of a pixel
  // too narrow already ends its text in an ellipsis, which scrollWidth,
  // rounded to whole pixels, can miss.
  const whole = (page: Page, selector: string) => page.locator(selector).evaluate((element) => {
    const words = document.createRange();
    words.selectNodeContents(element);
    return words.getBoundingClientRect().width <= element.getBoundingClientRect().width + 0.01;
  });
  // Whether an element lies inside the top bar, Publish's arrow included.
  const inBar = (page: Page, selector: string) => page.locator(selector).evaluate((element) => {
    const bar = element.closest(".topbar")!.getBoundingClientRect();
    const box = element.getBoundingClientRect();
    return box.left >= bar.left - 0.01 && box.right <= bar.right + 0.01;
  });

  // The browser's own line for the save the network drops below.
  test.describe("with a save the network drops", () => {
    test.use({ allowConsole: /net::ERR_INTERNET_DISCONNECTED/ });

    test("a published page's title stays whole beside its changes not live, and while a save is retried", async ({ page, request }) => {
      const { id } = await makePage(request, "Slack Water", [section("s", "Here", [column("c", [heading("h", "First words")])])]);
      expect((await request.post(`${cms()}/api/pages/${id}/publish`, { data: {} })).status()).toBe(200);
      // Three saves after the live version: the chip's longest form short of
      // two-digit counts.
      for (let n = 0; n < 3; n++) {
        const draft = await draftOf(request, id);
        const document = { schemaVersion: 1, title: "Slack Water", sections: [section("s", "Here", [column("c", [heading("h", `Words ${n}`)])])] };
        expect((await request.put(`${cms()}/api/pages/${id}/draft`, { data: { revision: draft.revision, saveId: unique("bar"), document } })).status()).toBe(200);
      }
      await open(page, id);
      await expect(page.locator(".topbar .tb-status")).toHaveText("Published, 3 changes not live");
      expect(await whole(page, ".tb-page-title")).toBe(true);
      expect(await whole(page, ".tb-status")).toBe(true);
      expect(await inBar(page, ".tb-right > :last-child")).toBe(true);

      // A save that cannot reach the CMS: the save state's longest words.
      await page.route("**/api/pages/*/draft", (route) => (route.request().method() === "PUT" ? route.abort("internetdisconnected") : route.fallback()));
      await page.locator('.canvas [data-block-id="h"]').click();
      const text = page.getByRole("textbox", { name: "Text" });
      await text.fill("Words kept in the tab");
      await text.blur();
      await expect(page.locator(".topbar .save-state")).toHaveText(/^Not saved, retrying in \d+ s$/);
      expect(await whole(page, ".tb-page-title")).toBe(true);
      expect(await inBar(page, ".tb-right > :last-child")).toBe(true);
      await page.unroute("**/api/pages/*/draft");
    });
  });

  test("a title too long for the top bar is cut inside the page switch, never the line under it or the keys on either side", async ({ page, request }) => {
    // A title of every word, as long as a title may be, 120 characters: far
    // longer than the room the bar has for it.
    const longTitle = "Every swim of the long winter series, from the first frost on the slipway to the thaw, at slack water and at first light";
    const long = await makePage(request, "Every swim", [section("s", "Here", [column("c", [])])]);
    const draft = await draftOf(request, long.id);
    const retitled = await request.put(`${cms()}/api/pages/${long.id}/draft`, { data: { revision: draft.revision, saveId: unique("long"), document: { schemaVersion: 1, title: longTitle, sections: [section("s", "Here", [column("c", [])])] } } });
    expect(retitled.status()).toBe(200);
    await open(page, long.id);
    await expect(page.locator(".tb-page-title")).toHaveText(longTitle);
    expect(await whole(page, ".tb-page-title")).toBe(false);
    expect(await whole(page, ".tb-status")).toBe(true);
    // Every key of both sides whole and inside the bar: the left side's
    // last (Redo) and the right side's last (the sidebar's).
    expect(await inBar(page, ".tb-right > :last-child")).toBe(true);
    expect(await inBar(page, ".tb-left > :last-child")).toBe(true);
    const switcher = (await page.locator(".tb-title").boundingBox())!;
    const titleBox = (await page.locator(".tb-page-title").boundingBox())!;
    expect(titleBox.x + titleBox.width).toBeLessThanOrEqual(switcher.x + switcher.width + 0.01);
    const left = (await page.locator(".tb-left").boundingBox())!;
    const right = (await page.locator(".tb-right").boundingBox())!;
    expect(switcher.x).toBeGreaterThanOrEqual(left.x + left.width - 0.01);
    expect(switcher.x + switcher.width).toBeLessThanOrEqual(right.x + 0.01);
    // A short title stands in the bar's middle.
    const { id } = await makePage(request, "Spring series", [section("s", "Here", [column("c", [])])]);
    await open(page, id);
    await expect(page.locator(".tb-page-title")).toHaveText("Spring series");
    expect(await whole(page, ".tb-page-title")).toBe(true);
    const middle = (await page.locator(".tb-title").boundingBox())!;
    expect(Math.abs(middle.x + middle.width / 2 - 640)).toBeLessThan(2);
  });
});
