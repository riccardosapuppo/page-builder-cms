// axe on the editor in each of its states, and on the page the CMS
// publishes, in Chromium: no serious or critical finding anywhere. The
// page holds every widget, with every case of their accessibility tests
// (src/widgets/<widget>/a11y.ts), in two sections. Findings of lesser
// impact are listed in the test's output.
import type { Page } from "@playwright/test";
import { WIDGET_A11Y } from "../src/widgets/a11y-all.ts";
import { axe } from "./helpers/axe.ts";
import { block, settledTextEditor } from "./helpers/canvas.ts";
import { sendAgain } from "./helpers/heading.ts";
import { png } from "./helpers/images.ts";
import { cms, column, device, drawer, expect, makePage, open, openGroup, openSiteStyle, section, test, unique, widget } from "./helpers/site.ts";

test.use({
  viewport: { width: 1440, height: 900 },
  // The conflict and the lost save are made on purpose below.
  allowConsole: /net::ERR_INTERNET_DISCONNECTED|status of 409 \(Conflict\)/,
});

// Every case of every widget, half in each of two sections; and a
// heading hidden on phones.
function everyWidget() {
  const blocks = WIDGET_A11Y.flatMap((test) => test.cases.map((c, index) => widget(`${test.type}-${index}`, test.type, c.props)));
  const half = Math.ceil(blocks.length / 2);
  const wide = { ...widget("wide-only", "heading", { level: 2, text: "Only on wider screens" }), style: { base: {}, phone: { visibility: "hidden" } } };
  return [
    section("first", "First", [column("first-a", blocks.slice(0, half)), column("first-b", [])]),
    section("second", "Second", [column("second-a", [...blocks.slice(half), wide])]),
  ];
}

// axe on the page as it is now; the lesser findings are printed.
async function clean(page: Page, state: string, options: Parameters<typeof axe>[1] = {}) {
  const report = await axe(page, options);
  for (const line of report.other) console.log(`${state}: ${line}`);
  expect(report.passes, `${state}: axe ran its rules`).toBeGreaterThan(10);
  expect(report.serious, state).toEqual([]);
}

// The design's window, and the smallest the editor is made for.
for (const size of [{ width: 1440, height: 900 }, { width: 1280, height: 800 }]) test(`the editor has no serious or critical axe finding, in any of its states, at ${size.width} by ${size.height}`, { tag: "@a11y" }, async ({ page, request, context }) => {
  // Thirty-nine states, each read by axe whole.
  test.setTimeout(240_000);
  await page.setViewportSize(size);
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const { id } = await makePage(request, "Every widget", everyWidget());
  await open(page, id);
  await clean(page, "a page, nothing selected");

  await block(page, "heading-0").click();
  await clean(page, "a heading selected, its first group open, the others closed with their values");
  for (const name of ["Size and color", "Type", "Alignment", "Shown on", "Advanced"]) await openGroup(page, name);
  await clean(page, "every group of the heading open");
  // Its toolbar's block menu; the "+" on its edge, its yellow line and the
  // picker beside it; the seam's "+" below its section, and its picker.
  await page.getByRole("button", { name: "Heading: block menu" }).click();
  await expect(page.getByRole("menu", { name: "Heading: block menu" })).toBeVisible();
  await clean(page, "the toolbar's block menu");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Add a block after Heading" }).click();
  await expect(page.getByRole("dialog", { name: "Add a block after Heading" })).toBeVisible();
  await clean(page, "the block picker beside its yellow line");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Add a section after First" }).click();
  await expect(page.getByRole("dialog", { name: "Add a section after First" })).toBeVisible();
  await clean(page, "the section picker on a seam");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  // Nothing selected, the pointer over the seam between the two sections:
  // its hairline, its "+" and the tip naming the place.
  await block(page, "heading-0").focus();
  await page.keyboard.press("Escape");
  await expect(page.locator(".canvas [data-editor-selected=true]")).toHaveCount(0);
  // The second section is taller than the canvas: its top brought 300
  // below the canvas's.
  await block(page, "second").evaluate((element) => {
    element.scrollIntoView({ block: "start" });
    element.closest(".canvas")?.scrollBy(0, -300);
  });
  const second = (await block(page, "second").boundingBox())!;
  await page.mouse.move(second.x + second.width / 2 - 120, second.y + 1, { steps: 4 });
  await expect(page.locator(".canvas .seam-tip")).toBeVisible();
  await clean(page, "a seam under the pointer, its + and its tip");
  await page.mouse.move(size.width - 6, size.height - 6);

  // A text written on the canvas: bold, italic and link in its toolbar,
  // then its link's field under it.
  await block(page, "text-0").click();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("toolbar", { name: "Text formatting" })).toBeVisible();
  await settledTextEditor(page, "text-0");
  await clean(page, "a text being written, bold, italic and link in its toolbar");
  await page.keyboard.press("Control+k");
  await expect(page.locator(".ov-link input")).toBeFocused();
  await clean(page, "the text's link field");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await expect(page.locator(".canvas .rte")).toHaveCount(0);

  // The Outline, both its tabs; a column chosen in it.
  await drawer(page, "Outline");
  await clean(page, "the Outline drawer");
  await page.getByRole("tab", { name: "Headings" }).click();
  await expect(page.getByRole("list", { name: "Headings" })).toBeVisible();
  await clean(page, "the Outline's headings");
  await page.getByRole("tab", { name: "Blocks" }).click();
  // A column's own space on a tablet: the override, its ring and Remove.
  await page.locator('.tree [data-row-id="first-a"] > .t-row').click();
  await expect(page.getByRole("button", { name: "Spacing", exact: true })).toHaveAttribute("aria-expanded", "true");
  await device(page, "Tablet").click();
  const ruler = page.locator(".sidebar .field").filter({ has: page.locator(".label", { hasText: /^Space inside$/ }) }).getByRole("slider");
  await ruler.focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("button", { name: "Remove the tablet override of Space inside" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Spacing", exact: true })).toContainText("Tablet differs");
  await clean(page, "a tablet's own value in its Spacing group");
  await device(page, "Desktop").click();
  // The section's own row: the middle of its item is a row inside it.
  await page.locator('.tree [data-row-id="first"] > .t-row').click();
  await openGroup(page, "Shown on");
  await openGroup(page, "Name and link");
  await clean(page, "a section's Shown on and Name and link");
  await drawer(page, "Insert");
  await clean(page, "the Insert drawer");
  await page.getByRole("complementary", { name: "Insert" }).getByRole("tab", { name: "Sections" }).click();
  await clean(page, "the Insert drawer's ready-made sections");
  await page.getByRole("button", { name: "Close Insert" }).click();
  // A first column's block selected with Insert open beside the page: its
  // toolbar right of the drawer, Insert's yellow line where a click lands.
  await block(page, "heading-0").click();
  await drawer(page, "Insert");
  await page.getByRole("complementary", { name: "Insert" }).getByRole("tab", { name: "Blocks" }).click();
  const cover = (await page.getByRole("complementary", { name: "Insert" }).boundingBox())!;
  await expect.poll(async () => (await page.locator(".canvas .clamp").boundingBox())!.x).toBeGreaterThanOrEqual(cover.x + cover.width);
  await clean(page, "Insert open beside a first column's block, its toolbar right of it");
  // A key of Insert picked up by the keyboard, the grey where it cannot
  // go; then dropped, the window it asks with open at the place.
  await page.getByRole("complementary", { name: "Insert" }).getByRole("group", { name: "Media" }).getByRole("button", { name: "Video", exact: true }).focus();
  await page.keyboard.press("Space");
  await expect(page.locator(".live-caption strong")).toHaveText(/^Video will be added to /);
  await clean(page, "a key of Insert picked up by the keyboard");
  await page.keyboard.press("Space");
  await expect(page.getByRole("dialog", { name: "Add a video" })).toBeVisible();
  await clean(page, "a dropped Video asking for its address at its place");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Add a video" })).toHaveCount(0);
  await page.getByRole("button", { name: "Close Insert" }).click();
  await device(page, "Phone").click();
  await clean(page, "the phone preview");
  // The selection hidden on the phone previewed: the canvas's one Tab stop
  // is the column around it, drawn there.
  await device(page, "Desktop").click();
  await block(page, "wide-only").click();
  await device(page, "Phone").click();
  // (The selection's toolbar keeps its own stop, hidden with its block.)
  await expect(page.locator(".canvas [data-block-id][tabindex=\"0\"]")).toHaveAttribute("data-block-id", "second-a");
  await expect(page.locator(".canvas [data-block-id][tabindex=\"0\"]")).toBeVisible();
  await expect(page.locator(".canvas .clamp")).toBeHidden();
  await clean(page, "a block hidden on the phone previewed, selected");
  await device(page, "Desktop").click();

  // Every block's edges, and the page's own settings in the sidebar.
  await page.getByRole("button", { name: "Block edges" }).click();
  await page.getByRole("tab", { name: "Page" }).click();
  await clean(page, "Block edges on, the sidebar's Page tab");
  await page.getByRole("button", { name: "Block edges" }).click();
  // The sidebar hidden, the canvas taking its room.
  await page.getByRole("button", { name: "Settings sidebar" }).click();
  await expect(page.getByRole("complementary", { name: "Settings" })).toHaveCount(0);
  await clean(page, "the sidebar hidden");
  await page.getByRole("button", { name: "Settings sidebar" }).click();

  await block(page, "quote-0").click({ button: "right" });
  await expect(page.getByRole("menu")).toBeVisible();
  await clean(page, "a block's menu");
  await page.keyboard.press("Escape");

  await block(page, "quote-0").focus();
  await page.keyboard.press("Space");
  await page.keyboard.press("ArrowDown");
  await expect(page.locator(".live-caption")).toBeVisible();
  await clean(page, "a block picked up by the keyboard");
  await page.keyboard.press("Escape");

  await block(page, "quote-0").focus();
  await page.keyboard.press("?");
  await clean(page, "the keyboard shortcuts window");
  await page.keyboard.press("Escape");

  const mark = page.getByRole("button", { name: "Page Builder CMS menu" });
  await mark.click();
  await clean(page, "the mark's menu");
  await page.getByRole("menuitem", { name: "About Page Builder CMS" }).click();
  await expect(page.getByRole("dialog", { name: "About" })).toBeVisible();
  await clean(page, "About");
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: /^Switch page/ }).click();
  await clean(page, "the page switch");
  await page.getByRole("dialog", { name: "Pages" }).getByRole("button", { name: "New page" }).click();
  await clean(page, "the New page window");
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "More publish options" }).click();
  await clean(page, "the Publish menu, before a publish");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page.locator(".topbar .tb-status")).toHaveText("Published");
  await clean(page, "published, with the notice and its link");
  await page.getByRole("button", { name: "More publish options" }).click();
  await clean(page, "the Publish menu, with the live page");
  await page.keyboard.press("Escape");

  // The history: this session's steps and the page's versions, the live
  // one among them; then "Save version" asking for a name.
  const history = await drawer(page, "History");
  await expect(history.getByRole("listitem").filter({ hasText: "Published" })).not.toHaveCount(0);
  await clean(page, "the history, with its steps and versions");
  await history.getByRole("button", { name: "Save version" }).click();
  await expect(history.getByRole("textbox", { name: /^Name/ })).toBeFocused();
  await clean(page, "the history's name field");
  await page.getByRole("button", { name: "Close History" }).click();

  // The media library, from the mark's menu: an image just uploaded and
  // chosen, with no alt text yet.
  await page.getByRole("button", { name: "Page Builder CMS menu" }).click();
  await page.getByRole("menuitem", { name: "Media library" }).click();
  const library = page.getByRole("dialog", { name: "Media library" });
  const name = `${unique("a11y")}.png`;
  await library.getByLabel("Images to upload").setInputFiles({ name, mimeType: "image/png", buffer: png(40, 30, () => [20, 60, 120]) });
  await expect(library.getByRole("radio", { name: `${name}, no alt text` })).toHaveAttribute("aria-checked", "true", { timeout: 30_000 });
  await clean(page, "the media library, an image chosen with no alt text");
  await page.keyboard.press("Escape");
  await expect(library).toHaveCount(0);

  await openSiteStyle(page);
  await page.getByRole("button", { name: /^Accent/ }).click();
  await clean(page, "Site style, a slot open");
  await page.getByRole("button", { name: "Back to Page" }).click();

  // A save the network loses: the countdown and the toast.
  await page.route("**/api/pages/*/draft", (route) => (route.request().method() === "PUT" ? route.abort("internetdisconnected") : route.fallback()));
  await block(page, "heading-0").click();
  await openGroup(page, "Text");
  const text = page.getByRole("textbox", { name: "Text" });
  await text.fill("Words kept in the tab");
  await text.blur();
  await expect(page.getByRole("group", { name: "Not saved" })).toBeVisible();
  await clean(page, "a save retrying, with its toast");
  await page.unroute("**/api/pages/*/draft");
  await sendAgain(page, () => expect(page.locator(".topbar .save-state")).toHaveText("Saved"));

  // Another writer: the conflict's banner.
  const draft = (await (await request.get(`${cms()}/api/pages/${id}/draft`)).json()) as { revision: number; document: unknown };
  expect((await request.put(`${cms()}/api/pages/${id}/draft`, { data: { revision: draft.revision, saveId: "a11y-elsewhere", document: draft.document } })).status()).toBe(200);
  await text.fill("Words of this tab");
  await text.blur();
  await expect(page.getByRole("alert")).toBeVisible();
  await clean(page, "the conflict's banner");
  await page.getByRole("button", { name: "Keep mine" }).click();
  await expect(page.locator(".topbar .save-state")).toHaveText("Saved");

  // An empty page, inviting its first section.
  const empty = await makePage(request, "Nothing yet", []);
  await page.goto(`/?page=${empty.id}`);
  await expect(page.getByRole("heading", { name: "Start this page with a section" })).toBeVisible();
  await clean(page, "an empty page");
});

test("the page the CMS publishes, with every widget, has no serious or critical axe finding", { tag: "@a11y" }, async ({ page, request }) => {
  const { id, slug } = await makePage(request, "Every widget, published", everyWidget());
  expect((await request.post(`${cms()}/api/pages/${id}/publish`, { data: {} })).status()).toBe(200);
  await page.goto(`${cms()}/${slug}`);
  await expect(page.getByRole("heading", { name: "Dawn swims", level: 2 })).toBeVisible();
  await clean(page, "the published page");
  // A visitor on a phone.
  await page.setViewportSize({ width: 390, height: 844 });
  await clean(page, "the published page, 390 wide");
});
