// The editor's marks on the canvas (the hover outline, the selection's
// frame and clamp) are drawn inside each block's root, after the block's
// own content. They must leave the page's layout as the published page
// draws it: a stylesheet rule that counts a block's children (:last-child)
// would count the marks too. The canvas's other parity checks draw the
// page with nothing hovered or selected, so they cannot see it; this one
// measures the real canvas with a block hovered and selected, against the
// page a visitor gets. A button's marks hug the pill it draws, as the
// approved design draws them, not the column-wide root around it, and
// follow the pill where an alignment moves it. The seam below the
// selection's section carries its +, a section's clamp its grip, and the
// selected block its dimension line, in steps. The clamp keeps to the
// margin, over no words, while a text is written too.
import type { Page } from "@playwright/test";
import { block, caption, clampFaults, clampPlace, moveOnto, pickUp, selectedText, settledTextEditor } from "./helpers/canvas.ts";
import { cms, column, draftOf, expect, heading, makePage, open, openGroup, saved, section, test, widget } from "./helpers/site.ts";

test.use({ viewport: { width: 1440, height: 900 } });

// The rule under an accordion's last question, and the accordion's height.
const accordionShape = (root: Element) => {
  const questions = root.querySelectorAll("details");
  const last = questions[questions.length - 1]!;
  return { rule: getComputedStyle(last).borderBottomWidth, height: root.getBoundingClientRect().height };
};

test("an accordion hovered or selected keeps the rule under its last question, and its height, as the published page draws it", async ({ page, request }) => {
  const items = [{ question: "When do you swim?", answer: "At slack water, twice a day." }, { question: "Is it cold?", answer: "Bring a hat." }];
  const { id, slug } = await makePage(request, "Questions", [section("s", "Questions", [column("c", [widget("a", "accordion", { items }), heading("h", "Below")])])]);
  expect((await request.post(`${cms()}/api/pages/${id}/publish`, { data: {} })).status()).toBe(200);

  const visitor = await page.context().newPage();
  await visitor.goto(`${cms()}/${slug}`);
  const published = await visitor.locator(".sw-accordion").evaluate(accordionShape);
  await visitor.close();
  expect(published.rule).toBe("1px");

  await open(page, id);
  const accordion = page.locator('.canvas [data-block-id="a"]');
  const below = page.locator('.canvas [data-block-id="h"]');
  await page.mouse.move(5, 895);
  const plain = { ...(await accordion.evaluate(accordionShape)), below: (await below.boundingBox())!.y };
  expect(plain.rule).toBe("1px");

  await accordion.hover();
  await expect(accordion.locator(":scope > .ov-hover")).toHaveCount(1);
  expect({ ...(await accordion.evaluate(accordionShape)), below: (await below.boundingBox())!.y }).toEqual(plain);

  await accordion.click();
  await expect(accordion.locator(":scope > .ov-sel")).toHaveCount(1);
  await page.mouse.move(5, 895);
  expect({ ...(await accordion.evaluate(accordionShape)), below: (await below.boundingBox())!.y }).toEqual(plain);
});

test("a button's hover outline and selection frame hug its pill, not its column", async ({ page, request }) => {
  const { id } = await makePage(request, "Pill", [section("s", "Join", [column("c", [widget("b", "button", { label: "Join a trial swim", href: "https://example.com/join" })])])]);
  await open(page, id);
  const button = page.locator('.canvas [data-block-id="b"]');
  const pill = (await button.locator(":scope > .sw-btn").boundingBox())!;
  const root = (await button.boundingBox())!;
  // The root is the column's width, as on the published page.
  expect(root.width).toBeGreaterThan(pill.width + 100);
  const around = async (selector: string, gap: number) => {
    const box = (await button.locator(selector).boundingBox())!;
    return [box.x - (pill.x - gap), box.y - (pill.y - gap), box.width - (pill.width + 2 * gap), box.height - (pill.height + 2 * gap)].map((d) => Math.abs(d) <= 1);
  };

  // The page's links take no pointer on the canvas: the pointer goes to
  // the middle of the pill, over the block.
  await page.mouse.move(pill.x + pill.width / 2, pill.y + pill.height / 2);
  await expect(button.locator(":scope > .ov-hover")).toHaveCount(1);
  expect(await around(":scope > .ov-hover", 4)).toEqual([true, true, true, true]);
  // Its name sits beside the pill.
  const label = (await button.locator(":scope > .ov-hover .ov-label").boundingBox())!;
  expect(label.x).toBeGreaterThan(pill.x + pill.width);
  expect(label.x).toBeLessThan(pill.x + pill.width + 20);

  await button.click();
  await expect(button.locator(":scope > .ov-sel")).toHaveCount(1);
  expect(await around(":scope > .ov-sel", 6)).toEqual([true, true, true, true]);
});

// An alignment moves the pill inside its root and changes the size of
// neither, so nothing that watches sizes sees it: the button's own, set
// with the frame on it, and its column's, which the button takes on, set
// with the outline on it.
test("a button's frame and outline follow its pill when an alignment moves it, the button's own or its column's", async ({ page, request }) => {
  const { id } = await makePage(request, "Aligned pill", [section("s", "Join", [column("c", [widget("b", "button", { label: "Join a trial swim", href: "https://example.com/join" })])])]);
  await open(page, id);
  const button = page.locator('.canvas [data-block-id="b"]');
  const pillX = async () => (await button.locator(":scope > .sw-btn").boundingBox())!.x;
  const hugs = async (selector: string, gap: number) => {
    const pill = (await button.locator(":scope > .sw-btn").boundingBox())!;
    const box = (await button.locator(selector).boundingBox())!;
    return [box.x - (pill.x - gap), box.y - (pill.y - gap), box.width - (pill.width + 2 * gap), box.height - (pill.height + 2 * gap)].map((d) => Math.abs(d) <= 1);
  };
  const alignment = page.getByRole("radiogroup", { name: "Alignment" });

  await button.click();
  await expect(button.locator(":scope > .ov-sel")).toHaveCount(1);
  const left = await pillX();
  await openGroup(page, "Alignment");
  await alignment.getByRole("radio", { name: "Center" }).click();
  await expect.poll(pillX).toBeGreaterThan(left + 50);
  expect(await hugs(":scope > .ov-sel", 6)).toEqual([true, true, true, true]);
  const center = await pillX();
  await alignment.getByRole("radio", { name: "Right" }).click();
  await expect.poll(pillX).toBeGreaterThan(center + 50);
  expect(await hugs(":scope > .ov-sel", 6)).toEqual([true, true, true, true]);
  await page.getByRole("button", { name: "Reset Alignment" }).click();
  await expect.poll(pillX).toBe(left);
  expect(await hugs(":scope > .ov-sel", 6)).toEqual([true, true, true, true]);

  // The column's alignment, chosen by the keyboard while the pointer rests
  // on the button.
  await button.locator(":scope > .clamp").waitFor();
  await page.getByRole("toolbar", { name: "Button tools" }).getByRole("button", { name: /^More/ }).click();
  await page.getByRole("menuitem", { name: /^Select Column/ }).click();
  await expect(block(page, "c")).toHaveAttribute("data-editor-selected", "true");
  await openGroup(page, "Alignment");
  // A column's alignment is the horizontal half of its Alignment field.
  const columnAlignment = page.getByRole("radiogroup", { name: "Horizontal alignment" });
  await columnAlignment.getByRole("radio", { name: "Center" }).click();
  await expect.poll(pillX).toBeGreaterThan(left + 50);
  const pill = (await button.locator(":scope > .sw-btn").boundingBox())!;
  await page.mouse.move(pill.x + pill.width / 2, pill.y + pill.height / 2);
  await expect(button.locator(":scope > .ov-hover")).toHaveCount(1);
  expect(await hugs(":scope > .ov-hover", 4)).toEqual([true, true, true, true]);
  const centered = await pillX();
  await columnAlignment.getByRole("radio", { name: "Center" }).press("ArrowRight");
  await expect.poll(pillX).toBeGreaterThan(centered + 50);
  await expect(button.locator(":scope > .ov-hover")).toHaveCount(1);
  expect(await hugs(":scope > .ov-hover", 4)).toEqual([true, true, true, true]);
});

const twoSections = () => [
  section("s1", "Hero", [column("c1", [heading("h", "Swim at slack water"), widget("t", "button", { label: "Join", href: "/join" })]), column("c2", [])]),
  section("s2", "Questions", [column("c3", [heading("q", "Questions")])]),
];
const sectionIds = (page: Page) => page.locator(".canvas .sw-main > [data-block-id]").evaluateAll((elements) => elements.map((e) => e.getAttribute("data-block-id")));

test("the seam below the selection's section: its +, its yellow line and the section picker, which adds a section after it", async ({ page, request }) => {
  const { id } = await makePage(request, "Seam", twoSections());
  await open(page, id);
  await block(page, "h").click();
  // One + on a seam: the one below Hero, which holds the selection.
  const pluses = page.locator(".canvas .ins-sec");
  await expect(pluses).toHaveCount(1);
  const plus = page.locator('.canvas [data-block-id="s1"] > .ins-sec');
  await expect(plus).toHaveAttribute("aria-label", "Add a section after Hero");
  const hero = (await block(page, "s1").boundingBox())!;
  const drawn = (await plus.boundingBox())!;
  expect(Math.abs(drawn.y + drawn.height / 2 - (hero.y + hero.height))).toBeLessThan(1);
  expect(Math.abs(drawn.x + drawn.width / 2 - (hero.x + hero.width / 2))).toBeLessThan(1);
  await plus.click();
  await expect(plus).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator('.canvas [data-block-id="s1"] > .seam .seam-label')).toHaveText("New section");
  const picker = page.getByRole("dialog", { name: "Add a section after Hero" });
  await expect(picker).toContainText("Lands on the yellow line, between Hero and Questions.");
  await picker.getByRole("button", { name: "1 column" }).click();
  await expect.poll(() => sectionIds(page)).toHaveLength(3);
  const [, added] = await sectionIds(page);
  expect(added).not.toBe("s2");
  await expect(block(page, added!)).toBeFocused();
  await expect(block(page, added!)).toHaveAttribute("data-editor-selected", "true");
  await saved(page);
  const draft = await draftOf(request, id);
  expect(draft.document.sections.map((s) => [s.id, s.children.length])).toEqual([["s1", 2], [added, 1], ["s2", 1]]);
});

test("a section's clamp sits in its margin, its grip dragging the section", async ({ page, request }) => {
  const { id } = await makePage(request, "Section drag", twoSections());
  await open(page, id);
  // The section chosen in the bottom line's path, from a widget in it.
  await block(page, "h").click();
  await page.getByRole("navigation", { name: "Selection" }).getByRole("button", { name: "Hero" }).click();
  const clamp = page.getByRole("toolbar", { name: "Hero tools" });
  await expect(clamp).toBeVisible();
  expect(await clampFaults(page)).toEqual([]);
  expect(await clampPlace(page)).toEqual({ size: "full", side: "left", tie: "none" });
  // On the same vertical as its first column's blocks' clamps.
  const own = (await clamp.boundingBox())!;
  await block(page, "h").click();
  const blocks = (await page.getByRole("toolbar", { name: "Heading tools" }).boundingBox())!;
  expect(Math.abs(own.x - blocks.x)).toBeLessThan(1);
  await page.getByRole("navigation", { name: "Selection" }).getByRole("button", { name: "Hero" }).click();
  await pickUp(page, clamp.locator("[data-grip]"));
  await moveOnto(page, block(page, "s2"), "bottom");
  await expect(caption(page).locator("strong")).toHaveText("Hero will move to the page, after Questions.");
  await page.mouse.up();
  await expect.poll(() => sectionIds(page)).toEqual(["s2", "s1"]);
  await saved(page);
  expect((await draftOf(request, id)).document.sections.map((s) => s.id)).toEqual(["s2", "s1"]);
});

test("the selected widget's dimension line names its column's Space between, as tall as the gap; a column's names its Space inside", async ({ page, request }) => {
  const padded = { ...column("c3", [heading("q", "Questions")]), style: { base: { spaceInside: "m" } } };
  const { id } = await makePage(request, "Dimensions", [twoSections()[0], section("s2", "Questions", [padded])]);
  await open(page, id);
  await block(page, "h").click();
  const line = page.locator('.canvas [data-block-id="h"] > .ov-dim-v');
  await expect(line).toHaveText("L");
  // Clear of the "+" in the middle of the block's bottom edge.
  const badge = (await line.locator("span").boundingBox())!;
  const plus = (await page.locator('.canvas [data-block-id="h"] .ins-after').boundingBox())!;
  expect(badge.x + badge.width < plus.x || plus.x + plus.width < badge.x).toBe(true);
  const above = (await block(page, "h").boundingBox())!;
  const next = (await block(page, "t").boundingBox())!;
  const drawn = (await line.boundingBox())!;
  expect(Math.abs(drawn.y - (above.y + above.height))).toBeLessThan(1);
  expect(Math.abs(drawn.height - (next.y - (above.y + above.height)))).toBeLessThan(1);
  // The last widget of its column has no gap below it.
  await block(page, "t").click();
  await expect(page.locator(".canvas .ov-dim-v")).toHaveCount(0);
  // A column's own space inside, at its top: the column taken by a click
  // in that space.
  const padded3 = (await block(page, "c3").boundingBox())!;
  await page.mouse.click(padded3.x + 4, padded3.y + 4);
  await expect(block(page, "c3")).toHaveAttribute("data-editor-selected", "true");
  const pad = page.locator('.canvas [data-block-id="c3"] > .ov-pad-top');
  await expect(pad).toHaveText("M");
  const padding = await block(page, "c3").evaluate((element) => parseFloat(getComputedStyle(element).paddingTop));
  expect(padding).toBeGreaterThan(0);
  expect(Math.abs((await pad.boundingBox())!.height - padding)).toBeLessThan(1);
});

// A section whose columns stand a step apart (its Space between columns).
const spaced = (id: string, label: string, columns: unknown[], spaceBetween: string) => ({ ...section(id, label, columns), style: { base: { spaceBetween } } });
const boxOf = async (page: Page, selector: string) => (await page.locator(selector).boundingBox())!;

test("the clamp keeps to the margin: full where it has 48, narrow in a gutter of 28 to 47, out to the page's margin under 28, over no block and no words", async ({ page, request }) => {
  const { id } = await makePage(request, "Clamp places", [
    // The theme's own gutter, 48.
    section("wide", "Wide", [column("w1", [heading("wa", "Swim by the keys"), widget("wb", "button", { label: "Join", href: "#" })]), column("w2", [heading("wc", "Tide notes for the week")])]),
    // Space between columns XL: a gutter of 32.
    spaced("narrow", "Narrow", [column("n1", [heading("na", "Dawn swims, twice a week, at first light")]), column("n2", [heading("nb", "Beginners' course")])], "xl"),
    // L: a gutter of 24, too narrow for any clamp.
    spaced("tight", "Tight", [column("t1", [heading("ta", "One")]), column("t2", [heading("tb", "Two")]), column("t3", [heading("tc", "Three")])], "l"),
  ]);
  await open(page, id);
  const at = async (target: string, place: Awaited<ReturnType<typeof clampPlace>>) => {
    await block(page, target).click();
    await page.mouse.move(5, 895);
    await expect.poll(() => clampPlace(page)).toEqual(place);
    expect(await clampFaults(page), target).toEqual([]);
  };
  // A first column's block: the page's margin, the full clamp, tied.
  await at("wa", { size: "full", side: "left", tie: "on" });
  const first = await boxOf(page, '.canvas [data-block-id="wa"]');
  const clamp = await boxOf(page, '.canvas [data-block-id="wa"] > .clamp');
  expect(Math.abs(clamp.x + clamp.width - (first.x - 14))).toBeLessThan(1);
  // A short block: the same clamp, running on below it.
  await at("wb", { size: "full", side: "left", tie: "on" });
  const button = await boxOf(page, '.canvas [data-block-id="wb"]');
  expect((await boxOf(page, '.canvas [data-block-id="wb"] > .clamp')).y + 100).toBeGreaterThan(button.y + button.height);
  // The second column, 48 from the first: the full clamp in the gutter.
  await at("wc", { size: "full", side: "left", tie: "on" });
  // 32 from it: the narrow clamp, centred, 2 clear on each side.
  await at("nb", { size: "narrow", side: "left", tie: "none" });
  const narrow = await boxOf(page, '.canvas [data-block-id="nb"] > .clamp');
  expect(Math.round(narrow.width)).toBe(28);
  expect(Math.abs(narrow.x - ((await boxOf(page, '.canvas [data-block-id="n1"]')).x + (await boxOf(page, '.canvas [data-block-id="n1"]')).width) - 2)).toBeLessThan(1);
  expect(Math.abs((await boxOf(page, '.canvas [data-block-id="nb"]')).x - (narrow.x + narrow.width) - 2)).toBeLessThan(1);
  // 24: out to the nearer page margin, level with the block, untied.
  await at("tb", { size: "full", side: "left", tie: "none" });
  const out = await boxOf(page, '.canvas [data-block-id="tb"] > .clamp');
  expect(out.x + out.width).toBeLessThan((await boxOf(page, '.canvas [data-block-id="t1"]')).x);
  expect(Math.abs(out.y - ((await boxOf(page, '.canvas [data-block-id="tb"]')).y - 6))).toBeLessThan(1);
  await at("tc", { size: "full", side: "right", tie: "none" });
  expect((await boxOf(page, '.canvas [data-block-id="tc"] > .clamp')).x).toBeGreaterThan((await boxOf(page, '.canvas [data-block-id="t3"]')).x + (await boxOf(page, '.canvas [data-block-id="t3"]')).width);
  // A column moves left and right; its clamp keeps the same rules.
  await block(page, "wc").click();
  await page.getByRole("navigation", { name: "Selection" }).getByRole("button", { name: "Column 2" }).click();
  await expect.poll(() => clampPlace(page)).toEqual({ size: "full", side: "left", tie: "on" });
  expect(await clampFaults(page)).toEqual([]);

  // The check finds what it is there to find: the clamp laid over its
  // block, then over the column beside it.
  await block(page, "nb").click();
  await expect.poll(() => clampPlace(page)).toMatchObject({ size: "narrow" });
  await page.locator('.canvas [data-block-id="nb"] > .clamp').evaluate((element) => { (element as HTMLElement).style.left = "20px"; });
  expect((await clampFaults(page)).join("\n")).toMatch(/Heading tools: over its own block[\s\S]*Heading tools: over the words "Beginners/);
  await page.locator('.canvas [data-block-id="nb"] > .clamp').evaluate((element) => { (element as HTMLElement).style.left = "-80px"; });
  expect((await clampFaults(page)).join("\n")).toMatch(/Heading tools: reaches 28 px into the column beside it/);
});

test("while a text is written, its clamp carries bold, italic and link in the same margin, over no words, and Esc gives its moves back", async ({ page, request }) => {
  const text = (words: string) => ({ doc: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: words }] }] } });
  // Columns a third of the page wide, a heading above the text, a rule or
  // a button under it: the clamp stays in the margin all the same.
  const { id } = await makePage(request, "Clamp crowded", [
    section("s1", "Rule", [column("c1", [heading("h1", "Swim by the keys"), widget("t1", "text", text("Tide notes")), widget("d1", "divider", {})]), column("c2", []), column("c3", [])]),
    section("s2", "Button", [column("c4", [{ ...heading("h2", "Swim at slack water"), props: { level: 1, text: "Swim at slack water" } }, widget("t2", "text", text("Dawn swims, beginners' courses and a winter series.")), widget("b2", "button", { label: "Join a trial swim", href: "#" })]), column("c5", []), column("c6", [])]),
  ]);
  await open(page, id);
  const tools = page.getByRole("toolbar", { name: "Text tools" });
  const writing = page.getByRole("toolbar", { name: "Text formatting" });
  for (const selected of ["t1", "t2"]) {
    await block(page, selected).click();
    await expect(tools).toBeVisible();
    const before = (await tools.boundingBox())!;
    expect(await clampFaults(page)).toEqual([]);
    await page.keyboard.press("Enter");
    await settledTextEditor(page, selected);
    // The head names the text being written; the moves give their place,
    // the grip and More stay.
    await expect(writing.getByRole("img", { name: "Text, being written" })).toBeVisible();
    expect(await writing.getByRole("button").evaluateAll((keys) => keys.map((key) => key.getAttribute("aria-label")))).toEqual(["Drag to move, or press Space to pick up", "Bold", "Italic", "Link", "More: copy, paste, duplicate, insert, delete"]);
    const during = (await writing.boundingBox())!;
    expect([during.x, during.y]).toEqual([before.x, before.y]);
    expect(await clampFaults(page)).toEqual([]);
    // The last word made bold from the clamp, the caret kept in the text.
    await page.keyboard.press("End");
    for (let i = 0; i < 5; i += 1) await page.keyboard.press("Shift+ArrowLeft");
    await writing.getByRole("button", { name: "Bold" }).click();
    await expect(writing.getByRole("button", { name: "Bold" })).toHaveAttribute("aria-pressed", "true");
    await expect(block(page, selected).locator(".rte strong")).toHaveCount(1);
    await expect(block(page, selected).locator(".rte")).toBeFocused();
    // From the keyboard: Tab from the text to Bold, Down to Italic, Enter.
    await page.keyboard.press("Tab");
    await expect(writing.getByRole("button", { name: "Bold" })).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(writing.getByRole("button", { name: "Italic" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(block(page, selected).locator(".rte strong em, .rte em strong")).toHaveCount(1);
    await expect(block(page, selected).locator(".rte")).toBeFocused();
    // The link's field opens under the block.
    await page.keyboard.press("Control+k");
    const field = page.locator(".ov-link");
    await expect(field).toBeVisible();
    const own = (await block(page, selected).boundingBox())!;
    expect((await field.boundingBox())!.y).toBeGreaterThanOrEqual(own.y + own.height);
    await expect(writing.getByRole("button", { name: "Link" })).toHaveAttribute("aria-expanded", "true");
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    await expect(writing).toHaveCount(0);
    await expect(tools.getByRole("button", { name: "Move up" })).toBeVisible();
    await page.keyboard.press("Control+z");
  }
});

// Where a written text's clamp stands against the canvas's view: whether
// it is all in view, its top from the view's top, and the canvas's scroll.
async function inView(page: Page): Promise<{ clamp: boolean | null; fromTop: number | null; scrollTop: number }> {
  return page.evaluate(() => {
    const canvas = document.querySelector<HTMLElement>(".canvas")!;
    const view = canvas.getBoundingClientRect();
    const top = view.top + canvas.clientTop;
    const bottom = Math.min(view.top + canvas.clientTop + canvas.clientHeight, window.innerHeight);
    const clamp = document.querySelector(".canvas .clamp")?.getBoundingClientRect();
    if (!clamp) return { clamp: null, fromTop: null, scrollTop: canvas.scrollTop };
    return { clamp: clamp.top >= top && clamp.bottom <= bottom, fromTop: Math.round(clamp.top - top), scrollTop: canvas.scrollTop };
  });
}

// The two scrolling faults stage 3 left, both of the floating bar's place
// under a text: a text opened at the canvas's bottom edge scrolled out
// from under the pointer, and a tall text's bar was not brought into view
// on a new empty line. The clamp stands beside the text, so nothing need
// scroll; beside a text taller than the canvas it keeps to the canvas's
// top, its formatting at hand wherever the caret is.
test("a text opened at the canvas's bottom edge stays under the pointer; beside a text taller than the canvas, its clamp keeps to the canvas's top", async ({ page, request }) => {
  const paragraphs = (...lines: string[]) => ({ doc: { type: "doc", content: lines.map((line) => ({ type: "paragraph", content: [{ type: "text", text: line }] })) } });
  const filler = (n: number) => section(`f${n}`, `Filler ${n}`, [column(`fc${n}`, [heading(`fh${n}`, "Swim by the keys"), widget(`ft${n}`, "text", paragraphs("Tide notes for the week ahead."))])]);
  const long = "Swim at slack water, twice a week, at first light, when the bay is flat";
  const tall = Array.from({ length: 30 }, (_, n) => `Note ${n + 1} on the tides of the bay.`);
  const { id } = await makePage(request, "Clamp at the edge", [
    filler(1), filler(2), filler(3),
    section("s2", "Long", [column("c2", [{ ...heading("long", long), props: { level: 1, text: long } }, widget("t2", "text", paragraphs("Dawn swims, beginners' courses and a winter series.", "Bring a towel."))])]),
    section("s3", "Tall", [column("c3", [{ ...heading("h3", long), props: { level: 1, text: long } }, widget("t3", "text", paragraphs(...tall))])]),
  ]);
  await page.setViewportSize({ width: 1184, height: 900 });
  await open(page, id);
  // The text's first line 30 above the canvas's bottom edge: clicked once
  // it is selected, again it opens there, and a triple click selects the
  // paragraph in it; nothing scrolls, the text stays open.
  const t2 = block(page, "t2");
  await page.locator(".canvas").evaluate((canvas) => {
    const line = canvas.querySelector('[data-block-id="t2"] p')!.getBoundingClientRect();
    canvas.scrollTop += line.bottom - (canvas.getBoundingClientRect().bottom - 30);
  });
  const scrolled = (await inView(page)).scrollTop;
  const first = t2.locator("p").first();
  await first.click({ position: { x: 40, y: 8 } });
  await first.click({ position: { x: 40, y: 8 } });
  await settledTextEditor(page, "t2");
  expect((await inView(page)).scrollTop).toBe(scrolled);
  await first.click({ position: { x: 40, y: 8 }, clickCount: 3 });
  await expect(t2.locator(".rte")).toBeFocused();
  expect(await selectedText(page, "t2")).toContain("Dawn swims");
  expect((await inView(page)).scrollTop).toBe(scrolled);
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");

  // A text taller than the canvas, its top scrolled away: written in its
  // middle, its clamp stands at the canvas's top, all in view; it stays
  // there on a new empty line, which has no box of its own, and as the
  // canvas scrolls on.
  const tallText = block(page, "t3");
  await tallText.evaluate((element) => element.scrollIntoView({ block: "start" }));
  await page.locator(".canvas").evaluate((canvas) => { canvas.scrollTop += 300; });
  await tallText.locator("p").nth(14).click();
  await tallText.locator("p").nth(14).click();
  await settledTextEditor(page, "t3");
  await expect(page.getByRole("toolbar", { name: "Text formatting" })).toBeVisible();
  await expect.poll(() => inView(page)).toMatchObject({ clamp: true, fromTop: 8 });
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await expect.poll(() => inView(page)).toMatchObject({ clamp: true, fromTop: 8 });
  await page.locator(".canvas").evaluate((canvas) => { canvas.scrollTop += 120; });
  await expect.poll(() => inView(page)).toMatchObject({ clamp: true, fromTop: 8 });
  expect(await clampFaults(page)).toEqual([]);
});

test("a short block chosen by the keyboard at the canvas's bottom edge comes into view with its whole clamp, which runs on below it", async ({ page, request }) => {
  const paragraphs = (...lines: string[]) => ({ doc: { type: "doc", content: lines.map((line) => ({ type: "paragraph", content: [{ type: "text", text: line }] })) } });
  const filler = (n: number) => section(`f${n}`, `Filler ${n}`, [column(`fc${n}`, [heading(`fh${n}`, "Swim by the keys"), widget(`ft${n}`, "text", paragraphs("Tide notes for the week ahead."))])]);
  const long = "Swim at slack water, twice a week, at first light, when the bay is flat";
  const { id } = await makePage(request, "Clamp brought in", [
    filler(1), filler(2), filler(3),
    section("s2", "Long", [column("c2", [{ ...heading("long", long), props: { level: 1, text: long } }, widget("t2", "text", paragraphs("Dawn swims.")), widget("b2", "button", { label: "Join", href: "#" })])]),
  ]);
  await page.setViewportSize({ width: 1184, height: 900 });
  await open(page, id);
  // The heading at the canvas's bottom edge, the text and the button under
  // it out of view; the arrow keys bring each in with its clamp, which is
  // taller than either.
  await page.locator(".canvas").evaluate((canvas) => {
    const heading = canvas.querySelector('[data-block-id="long"]')!.getBoundingClientRect();
    canvas.scrollTop += heading.bottom - (canvas.getBoundingClientRect().bottom - 30);
  });
  await block(page, "long").click({ position: { x: 6, y: 6 } });
  for (const next of ["t2", "b2"]) {
    await page.keyboard.press("ArrowDown");
    await expect(block(page, next)).toBeFocused();
    const own = (await block(page, next).boundingBox())!;
    const clamp = (await page.locator(".canvas .clamp").boundingBox())!;
    expect(clamp.y + clamp.height).toBeGreaterThan(own.y + own.height);
    await expect.poll(async () => (await inView(page)).clamp).toBe(true);
  }
  // Written there, the text keeps its caret in view as it grows.
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("Enter");
  await settledTextEditor(page, "t2");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Bring a towel.");
  const caret = await page.evaluate(() => {
    const canvas = document.querySelector<HTMLElement>(".canvas")!;
    const view = canvas.getBoundingClientRect();
    const line = document.getSelection()!.getRangeAt(0).getClientRects()[0]!;
    return line.top >= view.top && line.bottom <= view.top + canvas.clientHeight;
  });
  expect(caret).toBe(true);
  expect(await clampFaults(page)).toEqual([]);
});
