// The editor's shell in Chromium, against the run's own CMS through the
// editor's proxy: a page opens on the canvas; Enter on a widget tile adds
// it where the selection is and the CMS keeps it; the device buttons
// narrow the page root and the page lays out by its own width; the
// navigator and the canvas select together; a 422 from the CMS shows on
// the field it names; an empty page and a new one invite a first section;
// sections anchored with the editor's own ids take none of them; in a
// smaller window, a stacked column's tab and the page's title stay whole.
//
// Each test makes its own pages through the API, under addresses of its
// own, since the tests of a run share one CMS.
import type { Page } from "@playwright/test";
import { cms, column, draftOf, expect, heading, makePage, open, saved, section, test, unique, widget } from "./helpers/site.ts";

const row = (page: Page, name: string) => page.getByRole("treeitem", { name, exact: true }).first().locator(":scope > .t-row");

// The approved design's window: the canvas gives the page 832, wide
// enough for the page's desktop layout.
test.use({ viewport: { width: 1440, height: 900 } });

test("Enter on a widget tile adds it after the selected block, focused, and the CMS keeps it", async ({ page, request }) => {
  const { id } = await makePage(request, "Tiles", [section("s", "Tiles", [column("c", [widget("h", "heading", { level: 2, text: "Before the quote" }), widget("b", "button", { label: "After", href: "#" })])])]);
  await open(page, id);
  await page.locator('.canvas [data-block-id="h"]').click();
  await page.getByRole("tab", { name: "Add" }).click();
  const tile = page.getByRole("group", { name: "Content" }).getByRole("button", { name: "Quote" });
  await tile.focus();
  await page.keyboard.press("Enter");

  const blocks = page.locator('.canvas [data-block-id="c"] > [data-block-id]');
  await expect(blocks).toHaveCount(3);
  await expect(blocks.nth(1)).toHaveAttribute("data-block-type", "quote");
  await expect(blocks.nth(1)).toBeFocused();
  await expect(page.getByRole("toolbar", { name: "Quote" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Edit" })).toHaveAttribute("aria-selected", "true");
  await saved(page);
  const draft = await draftOf(request, id);
  expect(draft.document.sections[0]!.children[0]!.children.map((w) => w.type)).toEqual(["heading", "quote", "button"]);

  await page.reload();
  await expect(page.locator('.canvas [data-block-id="c"] > [data-block-type="quote"]')).toHaveCount(1);
});

test("the device buttons narrow the page root, and the page lays out by its own width", async ({ page, request }) => {
  const { id } = await makePage(request, "Widths", [section("s", "Two", [column("c1", [widget("t1", "heading", { level: 2, text: "Left" })]), column("c2", [widget("t2", "heading", { level: 2, text: "Right" })])])]);
  await open(page, id);
  const site = page.locator(".canvas .site");
  const left = page.locator('.canvas [data-block-id="c1"]');
  const right = page.locator('.canvas [data-block-id="c2"]');
  const layout = async () => {
    const [a, b, s] = [await left.boundingBox(), await right.boundingBox(), await site.boundingBox()];
    return { width: Math.round(s!.width), sideBySide: Math.abs(a!.y - b!.y) < 1 && b!.x > a!.x };
  };

  // 1440 wide: the canvas gives the page 832, past the 800 of the desktop layout.
  await expect(page.locator(".wrule-label")).toHaveText("Desktop, 832 wide");
  expect(await layout()).toEqual({ width: 832, sideBySide: true });

  await page.getByRole("button", { name: "Tablet" }).click();
  await expect(page.getByRole("button", { name: "Tablet" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".wrule-label")).toHaveText("Tablet, 768 wide");
  expect(await layout()).toEqual({ width: 768, sideBySide: false });

  await page.getByRole("button", { name: "Phone" }).click();
  await expect(page.locator(".wrule-label")).toHaveText("Phone, 390 wide");
  expect(await layout()).toEqual({ width: 390, sideBySide: false });
  // The window did not change: only the page root's container did.
  expect(page.viewportSize()).toEqual({ width: 1440, height: 900 });
});

test("the navigator and the canvas select the same block, both ways", async ({ page, request }) => {
  const { id } = await makePage(request, "Both ways", [section("s", "Story", [column("c", [widget("h", "heading", { level: 2, text: "Title" }), widget("q", "quote", { text: "Cold, then glad." })])])]);
  await open(page, id);

  await page.locator('.canvas [data-block-id="q"]').click();
  await expect(page.getByRole("treeitem", { name: "Quote: Cold, then glad." })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("treeitem", { name: "Story" })).toHaveAttribute("aria-expanded", "true");

  await row(page, "Column 1").click();
  await expect(page.locator('.canvas [data-block-id="c"]')).toHaveAttribute("data-editor-selected", "true");
  await expect(page.getByRole("toolbar", { name: "Column 1" })).toBeVisible();

  // The tree's keys move the selection, and the canvas with it.
  await page.keyboard.press("ArrowDown");
  await expect(page.locator('.canvas [data-block-id="h"]')).toHaveAttribute("data-editor-selected", "true");
  await expect(page.getByRole("treeitem", { name: "Heading: Title" })).toBeFocused();
  await expect(page.getByRole("textbox", { name: "Text" })).toHaveValue("Title");
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
  await page.getByRole("menuitem", { name: "New page…" }).click();
  await page.getByRole("dialog", { name: "New page" }).getByLabel("Title").fill(title);
  await page.getByRole("button", { name: "Create page" }).click();
  await expect(page.getByRole("heading", { name: "Start this page with a section" })).toBeVisible();
  await expect(page.getByText("No sections yet.", { exact: false })).toBeVisible();
  const newId = Number(new URL(page.url()).searchParams.get("page"));
  expect(newId).not.toBe(id);

  await page.getByRole("group", { name: "Add a section" }).getByRole("button", { name: "2 columns" }).click();
  await expect(page.locator(".canvas .col-empty")).toHaveCount(2);
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

  // ARIA takes the first element with an id: the navigator and the canvas
  // keep their own name and description.
  await expect(page.getByRole("tree", { name: "Navigator" })).toBeVisible();
  await expect(page.getByRole("main", { name: "Page canvas" })).toHaveAccessibleDescription(/^Arrow keys select the next or previous block/);
  const ids = await page.evaluate(() => [...document.querySelectorAll("[id]")].map((element) => ({ id: element.id, onPage: element.closest(".canvas .site") !== null })));
  const all = ids.map((entry) => entry.id);
  expect(all.filter((name, index) => all.indexOf(name) !== index)).toEqual([]);
  // And no id the editor gives itself is one a section could take.
  expect(ids.filter((entry) => !entry.onPage && /^[a-z][a-z0-9-]{0,63}$/.test(entry.id)).map((entry) => entry.id)).toEqual([]);
});

// A smaller window, 1280 by 800: the canvas gives the page 672, so the
// columns stack, and the top bar has less room.
test.describe("in a 1280 by 800 window", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("the tab of the selection's column is drawn whole, over the next column's line", async ({ page, request }) => {
    const { id } = await makePage(request, "Stacked", [section("s", "Two", [column("c1", [heading("h1", "Left")]), column("c2", [heading("h2", "Right")])])]);
    await open(page, id);
    await page.locator('.canvas [data-block-id="h1"]').click();
    await page.mouse.move(1270, 790);
    const first = (await page.locator('.canvas [data-block-id="c1"]').boundingBox())!;
    const second = (await page.locator('.canvas [data-block-id="c2"]').boundingBox())!;
    expect(second.y).toBeGreaterThan(first.y + first.height - 1);

    // The tab hangs below the first column, where the second column's
    // dashed line runs: inside its border (the edge pixels are shared with
    // the line beside it), the tab looks the same with that line hidden.
    const box = (await page.getByRole("button", { name: "Select Column 1" }).boundingBox())!;
    const inside = { x: box.x + 2, y: box.y + 2, width: box.width - 4, height: box.height - 4 };
    const withLine = await page.screenshot({ clip: inside });
    await page.locator('.canvas [data-block-id="c2"] > .ov-col').evaluate((line) => { (line as HTMLElement).style.visibility = "hidden"; });
    expect(await page.screenshot({ clip: inside })).toEqual(withLine);
  });

  test("in the top bar a long address gives way before the page's title, all of it", async ({ page, request }) => {
    const { id, slug } = await makePage(request, "Spring series", [section("s", "Here", [column("c", [])])]);
    await open(page, id);
    await expect(page.locator(".tb-page-title")).toHaveText("Spring series");
    await expect(page.locator(".tb-page-path")).toHaveText(`/${slug}`);
    // Every letter of the title shows; the address is the one cut short.
    // The words' own width, to the fraction of a pixel: a box a quarter
    // of a pixel too narrow already ends its text in an ellipsis, which
    // scrollWidth, rounded to whole pixels, can miss.
    const whole = (selector: string) => page.locator(selector).evaluate((element) => {
      const words = document.createRange();
      words.selectNodeContents(element);
      return words.getBoundingClientRect().width <= element.getBoundingClientRect().width + 0.01;
    });
    expect(await whole(".tb-page-title")).toBe(true);
    expect(await whole(".tb-page-path")).toBe(false);

    // A title too long for the bar is cut in its turn, inside the page
    // switch, with no address showing at all.
    const long = await makePage(request, "Every swim of the long winter series", [section("s", "Here", [column("c", [])])]);
    await open(page, long.id);
    await expect(page.locator(".tb-page-title")).toHaveText("Every swim of the long winter series");
    expect(await whole(".tb-page-title")).toBe(false);
    const name = (await page.locator(".tb-page-name").boundingBox())!;
    const titleBox = (await page.locator(".tb-page-title").boundingBox())!;
    expect(titleBox.x + titleBox.width).toBeLessThanOrEqual(name.x + name.width + 0.01);
    expect(await page.locator(".tb-page-path").evaluate((element) => element.getBoundingClientRect().left >= element.parentElement!.getBoundingClientRect().right - 0.01)).toBe(true);
  });
});
