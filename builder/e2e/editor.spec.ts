// The editor's shell in Chromium, against the run's own CMS through the
// editor's proxy: a page opens on the canvas; Enter on a widget tile adds
// it where the selection is and the CMS keeps it; the device buttons
// narrow the page root and the page lays out by its own width; the
// navigator and the canvas select together; a 422 from the CMS shows on
// the field it names; an empty page and a new one invite a first section;
// sections anchored with the editor's own ids take none of them; the
// theme's header and footer are drawn around the page, locked; in a
// smaller window, the page is drawn smaller to fit while the editor's own
// controls and words on it keep their size, a hovered block's name stays
// inside the canvas, and a stacked column's tab and the page's title stay
// whole.
//
// Each test makes its own pages through the API, under addresses of its
// own, since the tests of a run share one CMS.
import type { Page } from "@playwright/test";
import { block } from "./helpers/canvas.ts";
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

test("the theme's header and footer are drawn around the page, locked, and the navigator names them", async ({ page, request }) => {
  const site = (await (await request.get(`${cms()}/api/site`)).json()) as { name: string; footer: { lead: string } };
  const { id } = await makePage(request, "Framed", [section("s", "Story", [column("c", [heading("h", "Inside the theme")])])]);
  await open(page, id);
  const header = page.locator('.canvas [data-theme-part="header"]');
  const footer = page.locator('.canvas [data-theme-part="footer"]');
  await expect(header).toContainText(site.name);
  await expect(footer).toContainText(site.footer.lead);
  // Locked: inert, so no click, focus or screen reader reaches them.
  await expect(header).toHaveAttribute("inert", "");
  await expect(footer).toHaveAttribute("inert", "");
  // The page starts with its header, right under the width rule; the
  // sections come between the two.
  const frame = (await page.locator(".canvas .frame").boundingBox())!;
  const top = (await header.boundingBox())!;
  const story = (await page.locator('.canvas [data-block-id="s"]').boundingBox())!;
  const bottom = (await footer.boundingBox())!;
  expect(top.y).toBe(frame.y);
  expect(story.y).toBeGreaterThanOrEqual(top.y + top.height - 0.5);
  expect(bottom.y).toBeGreaterThanOrEqual(story.y + story.height - 0.5);

  // The navigator: the two locked rows, above and below the tree.
  const tray = page.getByRole("complementary", { name: "Navigator" });
  await expect(tray.locator(".t-theme")).toHaveText(["Site header, locked: the same on every page", "Site footer, locked: the same on every page"]);
  const rows = await tray.locator(".t-theme, .tree").evaluateAll((elements) => elements.map((e) => e.className));
  expect(rows).toEqual(["t-row t-theme", "tree", "t-row t-theme"]);

  // A click on the header selects nothing and says why.
  await block(page, "h").click();
  await page.mouse.click(top.x + top.width / 2, top.y + top.height / 2);
  await expect(page.locator(".notice")).toContainText("The site's header is the theme's, the same on every page: it is not edited here.");
  await expect(block(page, "h")).toHaveAttribute("data-editor-selected", "true");
});

// A smaller window, 1280 by 800: the canvas has 660 for the page, so the
// desktop and tablet pages are drawn smaller to fit, and the top bar has
// less room.
test.describe("in a 1280 by 800 window", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("the desktop page keeps its desktop layout, drawn smaller; the tablet page is drawn whole; neither scrolls sideways", async ({ page, request }) => {
    const { id } = await makePage(request, "Fitted", [section("s", "Two", [column("c1", [heading("h1", "Left")]), column("c2", [heading("h2", "Right")])])]);
    await open(page, id);
    const canvas = page.locator(".canvas");
    const rule = page.locator(".wrule-label");
    const frame = page.locator(".canvas .frame");
    const sideways = () => canvas.evaluate((element) => element.scrollWidth - element.clientWidth);
    const inside = async () => {
      const box = (await frame.boundingBox())!;
      const bench = (await canvas.boundingBox())!;
      return box.x >= bench.x && box.x + box.width <= bench.x + bench.width;
    };

    // Desktop: 800 wide, the page's desktop layout, two columns side by side.
    await expect(rule).toHaveText(/^Desktop, 800 wide, drawn at 8\d%$/);
    await expect(page.locator(".canvas .site")).toHaveCSS("width", "800px");
    const first = (await page.locator('.canvas [data-block-id="c1"]').boundingBox())!;
    const second = (await page.locator('.canvas [data-block-id="c2"]').boundingBox())!;
    expect(Math.abs(second.y - first.y)).toBeLessThan(1);
    expect(second.x).toBeGreaterThan(first.x + first.width - 1);
    expect(await sideways()).toBe(0);
    expect(await inside()).toBe(true);
    // The rule spans the page as drawn, its last notch at its end.
    const ruleBox = (await page.locator(".wrule").boundingBox())!;
    const frameBox = (await frame.boundingBox())!;
    expect(Math.abs(ruleBox.width - frameBox.width)).toBeLessThan(1);
    await expect(page.locator(".wrule-notch span")).toHaveText(["Tablet layout", "Desktop layout"]);

    // Tablet: 768 wide, whole, drawn smaller.
    await page.getByRole("group", { name: "Device" }).getByRole("button", { name: "Tablet" }).click();
    await expect(rule).toHaveText(/^Tablet, 768 wide, drawn at 8\d%$/);
    await expect(page.locator(".canvas .site")).toHaveCSS("width", "768px");
    expect(await sideways()).toBe(0);
    expect(await inside()).toBe(true);

    // Phone: 390 wide, with room enough: not scaled.
    await page.getByRole("group", { name: "Device" }).getByRole("button", { name: "Phone" }).click();
    await expect(rule).toHaveText("Phone, 390 wide");
    await expect(frame).not.toHaveAttribute("data-scale");
  });

  test("the tab of the selection's column is drawn whole, over the next column's line", async ({ page, request }) => {
    const { id } = await makePage(request, "Stacked", [section("s", "Two", [column("c1", [heading("h1", "Left")]), column("c2", [heading("h2", "Right")])])]);
    await open(page, id);
    // The tablet page, where the columns stack.
    await page.getByRole("group", { name: "Device" }).getByRole("button", { name: "Tablet" }).click();
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

  // The page drawn smaller draws its marks smaller too, since they hang
  // from its blocks; the editor's own controls and words among them keep
  // their size, each where it hangs: the selection's bar, the section's
  // and the column's tabs, a hovered block's name, a dimension's badge,
  // an empty column's words.
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

    for (const device of ["Desktop", "Tablet"]) {
      await page.getByRole("group", { name: "Device" }).getByRole("button", { name: device }).click();
      await expect(frame).toHaveAttribute("data-scale", /^0\.8/);
      const scale = Number(await frame.getAttribute("data-scale"));

      // A hovered block's name: on the desktop page, beside its outline,
      // at its middle; on the tablet page, where the right column is as
      // wide as the page, above the outline at its right end.
      await page.locator(at('[data-block-id="h2"]')).hover();
      const label = '[data-block-id="h2"] > .ov-hover > .ov-label';
      expect(await drawn(label), device).toEqual({ w: 1, h: 1, text: 12 });
      const outline = await box('[data-block-id="h2"] > .ov-hover');
      const name = await box(label);
      if (device === "Desktop") {
        // 6 past the inside of its 1.5 line.
        expect(near(name.x, outline.x + outline.width + 4.5 * scale), device).toBe(true);
        expect(near(name.y + name.height / 2, outline.y + outline.height / 2), device).toBe(true);
      } else {
        // 3 above the inside of its 1.5 line, its end on the line's end.
        expect(near(name.x + name.width, outline.x + outline.width), device).toBe(true);
        expect(near(name.y + name.height, outline.y - 1.5 * scale), device).toBe(true);
      }

      await page.locator(at('[data-block-id="h1"]')).click();
      await page.mouse.move(1270, 790);
      await expect(page.locator(at('[data-block-id="h1"] > .ov-sel'))).toHaveCount(1);

      // The bar: its buttons 26 square, its name in 12 px words, its
      // corner on the frame's corner mark, 11 above the frame.
      const bar = '[data-block-id="h1"] > .ov-sel > .ov-bar';
      expect(await drawn(bar), device).toEqual({ w: 1, h: 1, text: 12 });
      for (const button of await page.locator(at(`${bar} > button`)).all()) {
        const size = (await button.boundingBox())!;
        expect([Math.round(size.width), Math.round(size.height)], device).toEqual([26, 26]);
      }
      expect((await drawn(`${bar} > .ov-name`)).text, device).toBe(12);
      const barBox = await box(bar);
      const corner = await box('[data-block-id="h1"] > .ov-sel > .br-tl');
      const frameBox = await box('[data-block-id="h1"] > .ov-sel');
      expect(near(barBox.x, corner.x), device).toBe(true);
      expect(near(barBox.y + barBox.height, frameBox.y + 2 * scale - 11 * scale), device).toBe(true);

      // The section's tab, centred on the section's top edge, and its grip
      // and + at their size.
      const tab = '[data-block-id="s"] > .ov-section > .ov-tab';
      expect(await drawn(tab), device).toEqual({ w: 1, h: 1, text: 12 });
      for (const part of [".ov-tab-grip", ".ov-tab-add"]) expect(await drawn(`${tab} > ${part}`), device).toMatchObject({ w: 1, h: 1 });
      const tabBox = await box(tab);
      const band = await box('[data-block-id="s"] > .ov-section');
      expect(near(tabBox.x + tabBox.width / 2, band.x + band.width / 2), device).toBe(true);
      expect(near(tabBox.y + tabBox.height / 2, band.y), device).toBe(true);

      // The column's tab, hanging under the column's line.
      const columnTab = '[data-block-id="c1"] > .ov-col > .ov-tab';
      expect(await drawn(columnTab), device).toEqual({ w: 1, h: 1, text: 12 });
      const line = await box('[data-block-id="c1"] > .ov-col');
      const hanging = await box(columnTab);
      expect(near(hanging.x, line.x - scale), device).toBe(true);
      expect(near(hanging.y, line.y + line.height + scale), device).toBe(true);

      // The dimension's badge, beside its line.
      const badge = '[data-block-id="h1"] > .ov-dim-v > span';
      expect(await drawn(badge), device).toEqual({ w: 1, h: 1, text: 12 });
      const dimension = await box('[data-block-id="h1"] > .ov-dim-v');
      const badgeBox = await box(badge);
      expect(near(badgeBox.x, dimension.x + 18 * scale), device).toBe(true);
      expect(near(badgeBox.y, dimension.y + 9 * scale), device).toBe(true);

      // An empty column keeps its place on the page, drawn smaller, and its
      // words at their size.
      const smaller = Number(scale.toFixed(3));
      expect(await drawn('[data-block-id="c5"] > .col-empty'), device).toEqual({ w: smaller, h: smaller, text: 12 });
    }
  });

  // A hovered block's name stands beside it, past its right edge, as the
  // design draws it. A block as wide as a page that fills the canvas (the
  // tablet page's stacked columns) leaves it no room there: the name would
  // be cut at the canvas's edge and make the canvas scroll sideways. There
  // it stands above the block's outline instead, at its right end, whole
  // and at its size.
  test("a hovered block's name stays inside the canvas: beside the block where it has room, above its right end where it has none", async ({ page, request }) => {
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
    const device = (name: string) => page.getByRole("group", { name: "Device" }).getByRole("button", { name }).click();
    // Where each block's name is when it is hovered: beside its outline at
    // its middle (6 past the inside of its 1.5 line), above it at its right
    // end (3 above the inside of its line), or elsewhere; whether the name
    // is whole inside the canvas, scrollbar aside, and drawn at its size;
    // and how far the canvas then scrolls sideways.
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
          const outline = root.querySelector(":scope > .ov-hover")!.getBoundingClientRect();
          const label = root.querySelector(":scope > .ov-hover > .ov-label")!;
          const name = label.getBoundingClientRect();
          const scale = Number(root.closest(".frame")!.getAttribute("data-scale") ?? "1");
          const near = (a: number, b: number) => Math.abs(a - b) < 1;
          const side = near(name.left, outline.right + 4.5 * scale) && near(name.top + name.height / 2, outline.top + outline.height / 2) ? "beside"
            : near(name.right, outline.right) && near(name.bottom, outline.top - 1.5 * scale) ? "above" : "elsewhere";
          return {
            side,
            inside: name.left >= left - 0.01 && name.right <= left + canvas.clientWidth + 0.01,
            sideways: canvas.scrollWidth - canvas.clientWidth,
            size: Number((name.height / parseFloat(getComputedStyle(label).height)).toFixed(3)),
          };
        });
        expect({ target, ...seen }).toEqual({ target, side: expect.stringMatching(/^(beside|above)$/), inside: true, sideways: 0, size: 1 });
        found[target] = seen.side;
      }
      return found;
    };
    const all = ["h1", "h2", "t", "acc", "ib", "b"] as const;
    const each = (side: string) => Object.fromEntries(all.map((target) => [target, side]));

    // The desktop page, drawn smaller: the columns side by side, the
    // page's margin beside the right one. The button's name is beside its
    // pill, which its alignment puts at the column's right end.
    await expect(frame).toHaveAttribute("data-scale", /^0\.8/);
    expect(await sides(all)).toEqual(each("beside"));
    // The tablet page, drawn smaller: the columns stacked, each block as
    // wide as the page. A name as short as "Text" still has room; the
    // button's, "Button", has under a pixel to spare: whichever side it
    // takes, it is whole and the canvas does not scroll.
    await device("Tablet");
    await expect(frame).toHaveAttribute("data-scale", /^0\.8/);
    expect(await sides(all)).toMatchObject({ h1: "above", h2: "above", t: "beside", acc: "above", ib: "above" });
    // The phone page, whole, with the canvas's room beside it.
    await device("Phone");
    await expect(frame).not.toHaveAttribute("data-scale");
    expect(await sides(all)).toEqual(each("beside"));
    // A window just wide enough for the tablet page whole: a long name
    // still has no room beside a block as wide as the page, a short one has.
    await page.setViewportSize({ width: 1400, height: 800 });
    await device("Tablet");
    await expect(frame).not.toHaveAttribute("data-scale");
    expect(await sides(all)).toMatchObject({ t: "beside", acc: "above" });
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
    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(frame).toHaveAttribute("data-scale", /^0\.8/);
    expect(await sizes()).toEqual(whole);
  });

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
      await expect(page.locator(".topbar .chip")).toHaveText("Published, 3 changes not live");
      expect(await whole(page, ".tb-page-title")).toBe(true);
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

  test("in the top bar a long address gives way before the page's title, all of it", async ({ page, request }) => {
    const { id } = await makePage(request, "Spring series", [section("s", "Here", [column("c", [])])]);
    // An address as long as an address may be, 64 characters: longer than
    // the room the bar has left for it.
    const slug = `${unique("spring")}-every-weekend-morning-at-the-harbour-wall`.slice(0, 64).replace(/-+$/, "");
    expect((await request.patch(`${cms()}/api/pages/${id}`, { data: { slug } })).status()).toBe(200);
    await open(page, id);
    await expect(page.locator(".tb-page-title")).toHaveText("Spring series");
    await expect(page.locator(".tb-page-path")).toHaveText(`/${slug}`);
    // Every letter of the title shows; the address is the one cut short.
    expect(await whole(page, ".tb-page-title")).toBe(true);
    expect(await whole(page, ".tb-page-path")).toBe(false);

    // A title too long for the bar is cut in its turn, inside the page
    // switch, with no address showing at all.
    const longTitle = "Every swim of the long winter series, from the first frost on the slipway to the thaw";
    const long = await makePage(request, "Every swim", [section("s", "Here", [column("c", [])])]);
    const draft = await draftOf(request, long.id);
    const retitled = await request.put(`${cms()}/api/pages/${long.id}/draft`, { data: { revision: draft.revision, saveId: unique("long"), document: { schemaVersion: 1, title: longTitle, sections: [section("s", "Here", [column("c", [])])] } } });
    expect(retitled.status()).toBe(200);
    await open(page, long.id);
    await expect(page.locator(".tb-page-title")).toHaveText(longTitle);
    expect(await whole(page, ".tb-page-title")).toBe(false);
    expect(await inBar(page, ".tb-right > :last-child")).toBe(true);
    const name = (await page.locator(".tb-page-name").boundingBox())!;
    const titleBox = (await page.locator(".tb-page-title").boundingBox())!;
    expect(titleBox.x + titleBox.width).toBeLessThanOrEqual(name.x + name.width + 0.01);
    expect(await page.locator(".tb-page-path").evaluate((element) => element.getBoundingClientRect().left >= element.parentElement!.getBoundingClientRect().right - 0.01)).toBe(true);
  });
});
