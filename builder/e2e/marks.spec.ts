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
// selection's section carries its +, a section's toolbar its grip, and the
// selected block its dimension line, in steps. The toolbar floats by the
// selection's frame, over no words, while a text is written too.
import type { Page } from "@playwright/test";
import { block, caption, clampFaults, clampOverWords, clampPlace, moveOnto, pickUp, selectedText, settledTextEditor } from "./helpers/canvas.ts";
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
  expect(await around(":scope > .ov-hover", 2)).toEqual([true, true, true, true]);
  // Its name sits at the outline's top left, above the pill.
  const label = (await button.locator(":scope > .ov-hover .ov-label").boundingBox())!;
  expect(Math.abs(label.x - (pill.x - 2))).toBeLessThan(1);
  expect(label.y + label.height).toBeLessThanOrEqual(pill.y);

  await button.click();
  await expect(button.locator(":scope > .ov-sel")).toHaveCount(1);
  expect(await around(":scope > .ov-sel", 3)).toEqual([true, true, true, true]);
});

// An alignment moves the pill inside its root and changes the size of
// neither, so nothing that watches sizes sees it: the button's own, set
// with the frame on it, and its column's, which the button takes on, set
// with the outline on it.
test("a button's frame, outline and toolbar follow its pill when an alignment moves it, the button's own or its column's", async ({ page, request }) => {
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
  // The toolbar stands by the frame, from the edge it says, as the frame
  // moves with the pill.
  const follows = () => page.evaluate(() => {
    const clamp = document.querySelector<HTMLElement>('.canvas [data-block-id="b"] > .clamp')!;
    const frame = document.querySelector('.canvas [data-block-id="b"] > .ov-sel')!.getBoundingClientRect();
    const bar = clamp.getBoundingClientRect();
    return clamp.dataset.align === "end" ? Math.abs(bar.right - frame.right) <= 1 : Math.abs(bar.left - frame.left) <= 1;
  });

  await button.click();
  await expect(button.locator(":scope > .ov-sel")).toHaveCount(1);
  const left = await pillX();
  await openGroup(page, "Alignment");
  await alignment.getByRole("radio", { name: "Center" }).click();
  await expect.poll(pillX).toBeGreaterThan(left + 50);
  expect(await hugs(":scope > .ov-sel", 3)).toEqual([true, true, true, true]);
  await expect.poll(follows).toBe(true);
  const center = await pillX();
  await alignment.getByRole("radio", { name: "Right" }).click();
  await expect.poll(pillX).toBeGreaterThan(center + 50);
  expect(await hugs(":scope > .ov-sel", 3)).toEqual([true, true, true, true]);
  await expect.poll(follows).toBe(true);
  await page.getByRole("button", { name: "Reset Alignment" }).click();
  await expect.poll(pillX).toBe(left);
  expect(await hugs(":scope > .ov-sel", 3)).toEqual([true, true, true, true]);
  await expect.poll(follows).toBe(true);

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
  expect(await hugs(":scope > .ov-hover", 2)).toEqual([true, true, true, true]);
  const centered = await pillX();
  await columnAlignment.getByRole("radio", { name: "Center" }).press("ArrowRight");
  await expect.poll(pillX).toBeGreaterThan(centered + 50);
  await expect(button.locator(":scope > .ov-hover")).toHaveCount(1);
  expect(await hugs(":scope > .ov-hover", 2)).toEqual([true, true, true, true]);
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

test("a section's toolbar stands inside its top left corner, in its padding, its grip dragging the section", async ({ page, request }) => {
  const { id } = await makePage(request, "Section drag", twoSections());
  await open(page, id);
  // The section chosen in the bottom line's path, from a widget in it.
  await block(page, "h").click();
  await page.getByRole("navigation", { name: "Selection" }).getByRole("button", { name: "Hero" }).click();
  const clamp = page.getByRole("toolbar", { name: "Hero tools" });
  await expect(clamp).toBeVisible();
  expect(await clampFaults(page)).toEqual([]);
  expect(await clampPlace(page)).toEqual({ side: "inside", align: "start" });
  // 8 in from the frame's corner.
  const own = (await clamp.boundingBox())!;
  const frame = (await page.locator('.canvas [data-block-id="s1"] > .ov-sel').boundingBox())!;
  expect(Math.abs(own.x - (frame.x + 8))).toBeLessThan(1);
  expect(Math.abs(own.y - (frame.y + 8))).toBeLessThan(1);
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

const boxOf = async (page: Page, selector: string) => (await page.locator(selector).boundingBox())!;

test("the toolbar keeps off the words around the frame: above it where that is free, at its right end, under it; never over its own", async ({ page, request }) => {
  const words = (line: string) => ({ doc: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: line }] }] } });
  const long = "Tide notes for the whole week ahead, for every swim at the slipway.";
  const { id } = await makePage(request, "Toolbar places", [
    // Room above the heading: the section's own space.
    section("free", "Free", [column("f1", [heading("fa", "Swim by the keys")])]),
    // A short line above: the toolbar goes to the frame's right end.
    section("short", "Short", [column("s1", [widget("st", "text", words("One.")), heading("fb", "Swim at slack water")])]),
    // A heading at the canvas's top, nothing under it: under the frame.
    section("under", "Under", [column("u1", [heading("fc", "Swim at slack water")])]),
    // Words above and under: over another block's words, never its own.
    section("boxed", "Boxed", [column("b1", [widget("bt", "text", words(long)), heading("fd", "Swim at slack water"), widget("bu", "text", words(long))])]),
    section("end", "End", [column("e1", [heading("fe", "The end")])]),
  ]);
  await open(page, id);
  const at = async (target: string, place: Awaited<ReturnType<typeof clampPlace>>, top = false) => {
    await block(page, target).evaluate((element, toTop) => {
      if (!toTop) return element.scrollIntoView({ block: "center" });
      const canvas = element.closest(".canvas")!;
      canvas.scrollTop += element.getBoundingClientRect().top - (canvas.getBoundingClientRect().top + canvas.clientTop) - 12;
    }, top);
    await block(page, target).click();
    await page.mouse.move(5, 895);
    await expect.poll(() => clampPlace(page), target).toEqual(place);
    expect(await clampFaults(page), target).toEqual([]);
  };
  await at("fa", { side: "above", align: "start" });
  expect(await clampOverWords(page)).toEqual([]);
  // 6 above the frame, from its left edge.
  const frame = await boxOf(page, '.canvas [data-block-id="fa"] > .ov-sel');
  const toolbar = await boxOf(page, '.canvas [data-block-id="fa"] > .clamp');
  expect(Math.abs(toolbar.x - frame.x)).toBeLessThan(1);
  expect(Math.abs(toolbar.y + toolbar.height - (frame.y - 6))).toBeLessThan(1);
  await at("fb", { side: "above", align: "end" });
  expect(await clampOverWords(page)).toEqual([]);
  const end = await boxOf(page, '.canvas [data-block-id="fb"] > .ov-sel');
  const atEnd = await boxOf(page, '.canvas [data-block-id="fb"] > .clamp');
  expect(Math.abs(atEnd.x + atEnd.width - (end.x + end.width))).toBeLessThan(1);
  await at("fc", { side: "below", align: "start" }, true);
  expect(await clampOverWords(page)).toEqual([]);
  // Clear of the "+" on the frame's foot.
  const plus = await boxOf(page, '.canvas [data-block-id="fc"] > .ov-sel > .ins-after');
  expect((await boxOf(page, '.canvas [data-block-id="fc"] > .clamp')).y).toBeGreaterThan(plus.y + plus.height);
  // Words all around: outside the frame all the same, off its own words.
  await block(page, "fd").evaluate((element) => element.scrollIntoView({ block: "center" }));
  await block(page, "fd").click();
  await expect.poll(async () => (await clampPlace(page))?.side, "fd").not.toBe("inside");
  expect(await clampFaults(page), "fd").toEqual([]);
  // A column's toolbar by the same rules, its moves left and right.
  await block(page, "fa").click();
  await page.getByRole("navigation", { name: "Selection" }).getByRole("button", { name: "Column 1" }).click();
  await expect(page.getByRole("toolbar", { name: "Column 1 tools" }).getByRole("button", { name: "Move left" })).toBeVisible();
  expect(await clampFaults(page)).toEqual([]);

  // The checks find what they are there to find: the toolbar laid over the
  // block's own words, over the words above, then past the canvas's edge.
  await block(page, "fd").click();
  const laid = page.locator('.canvas [data-block-id="fd"] > .clamp');
  await laid.evaluate((element) => { (element as HTMLElement).style.top = "4px"; (element as HTMLElement).style.left = "4px"; });
  expect((await clampFaults(page)).join("\n")).toMatch(/Heading tools: over its own words "Swim at slack water"/);
  // Over the words above, wherever the fonts put them: its top on their
  // last line.
  await laid.evaluate((element) => {
    const toolbar = element as HTMLElement;
    const home = toolbar.offsetParent as HTMLElement;
    const box = home.getBoundingClientRect();
    const scale = box.height / home.offsetHeight || 1;
    const words = document.querySelector('.canvas [data-block-id="bt"] p')!.getBoundingClientRect();
    toolbar.style.top = `${(words.bottom - 12 - box.top) / scale}px`;
  });
  expect((await clampOverWords(page)).join("\n")).toMatch(/Tide notes/);
  await laid.evaluate((element) => { (element as HTMLElement).style.left = "-400px"; });
  expect((await clampFaults(page)).join("\n")).toMatch(/Heading tools: past the canvas's edge/);
});


test("while a text is written, its toolbar carries bold, italic and link where it stood, over no words, and Esc gives its moves back", async ({ page, request }) => {
  const text = (words: string) => ({ doc: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: words }] }] } });
  // Columns a third of the page wide, a heading above the text, a rule or
  // a button under it: the toolbar keeps off their words all the same.
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
    const before = await clampPlace(page);
    expect(await clampFaults(page)).toEqual([]);
    await page.keyboard.press("Enter");
    await settledTextEditor(page, selected);
    // The head names the text being written; the moves give their place,
    // the grip and More stay.
    await expect(writing.getByRole("img", { name: "Text, being written" })).toBeVisible();
    expect(await writing.getByRole("button").evaluateAll((keys) => keys.map((key) => key.getAttribute("aria-label")))).toEqual(["Drag to move, or press Space to pick up", "Bold", "Italic", "Link", "More: copy, paste, duplicate, insert, delete"]);
    // On the same side of the frame as before: the toolbar does not jump.
    expect(await clampPlace(page)).toEqual(before);
    expect(await clampFaults(page)).toEqual([]);
    // The last word made bold from the toolbar, the caret kept in the text.
    await page.keyboard.press("End");
    for (let i = 0; i < 5; i += 1) await page.keyboard.press("Shift+ArrowLeft");
    await writing.getByRole("button", { name: "Bold" }).click();
    await expect(writing.getByRole("button", { name: "Bold" })).toHaveAttribute("aria-pressed", "true");
    await expect(block(page, selected).locator(".rte strong")).toHaveCount(1);
    await expect(block(page, selected).locator(".rte")).toBeFocused();
    // From the keyboard: Tab from the text to Bold, Right to Italic, Enter.
    await page.keyboard.press("Tab");
    await expect(writing.getByRole("button", { name: "Bold" })).toBeFocused();
    await page.keyboard.press("ArrowRight");
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

// Where the selected block's toolbar stands against the canvas's view:
// whether it is all in view, its top from the view's top, and the
// canvas's scroll.
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
// on a new empty line. Opening a text scrolls nothing; by a text taller
// than the canvas the toolbar keeps to the canvas's top, inside it, its
// formatting at hand wherever the caret is.
test("a text opened at the canvas's bottom edge stays under the pointer; by a text taller than the canvas, its toolbar keeps to the canvas's top", async ({ page, request }) => {
  const paragraphs = (...lines: string[]) => ({ doc: { type: "doc", content: lines.map((line) => ({ type: "paragraph", content: [{ type: "text", text: line }] })) } });
  const filler = (n: number) => section(`f${n}`, `Filler ${n}`, [column(`fc${n}`, [heading(`fh${n}`, "Swim by the keys"), widget(`ft${n}`, "text", paragraphs("Tide notes for the week ahead."))])]);
  const long = "Swim at slack water, twice a week, at first light, when the bay is flat";
  const tall = Array.from({ length: 30 }, (_, n) => `Note ${n + 1} on the tides of the bay.`);
  const { id } = await makePage(request, "Toolbar at the edge", [
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
  // middle, its toolbar stands at the canvas's top, inside it, all in view;
  // it stays there on a new empty line, which has no box of its own, and
  // as the canvas scrolls on.
  const tallText = block(page, "t3");
  await tallText.evaluate((element) => element.scrollIntoView({ block: "start" }));
  await page.locator(".canvas").evaluate((canvas) => { canvas.scrollTop += 300; });
  await tallText.locator("p").nth(14).click();
  await tallText.locator("p").nth(14).click();
  await settledTextEditor(page, "t3");
  await expect(page.getByRole("toolbar", { name: "Text formatting" })).toBeVisible();
  await expect.poll(() => inView(page)).toMatchObject({ clamp: true, fromTop: 8 });
  expect(await clampPlace(page)).toEqual({ side: "inside", align: "start" });
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await expect.poll(() => inView(page)).toMatchObject({ clamp: true, fromTop: 8 });
  await page.locator(".canvas").evaluate((canvas) => { canvas.scrollTop += 120; });
  await expect.poll(() => inView(page)).toMatchObject({ clamp: true, fromTop: 8 });
  expect(await clampFaults(page)).toEqual([]);
});

test("a short block chosen by the keyboard at the canvas's bottom edge comes into view with its whole toolbar", async ({ page, request }) => {
  const paragraphs = (...lines: string[]) => ({ doc: { type: "doc", content: lines.map((line) => ({ type: "paragraph", content: [{ type: "text", text: line }] })) } });
  const filler = (n: number) => section(`f${n}`, `Filler ${n}`, [column(`fc${n}`, [heading(`fh${n}`, "Swim by the keys"), widget(`ft${n}`, "text", paragraphs("Tide notes for the week ahead."))])]);
  const long = "Swim at slack water, twice a week, at first light, when the bay is flat";
  const { id } = await makePage(request, "Toolbar brought in", [
    filler(1), filler(2), filler(3),
    section("s2", "Long", [column("c2", [{ ...heading("long", long), props: { level: 1, text: long } }, widget("t2", "text", paragraphs("Dawn swims.")), widget("b2", "button", { label: "Join", href: "#" })])]),
  ]);
  await page.setViewportSize({ width: 1184, height: 900 });
  await open(page, id);
  // The heading at the canvas's bottom edge, the text and the button under
  // it out of view; the arrow keys bring each in with its toolbar.
  await page.locator(".canvas").evaluate((canvas) => {
    const heading = canvas.querySelector('[data-block-id="long"]')!.getBoundingClientRect();
    canvas.scrollTop += heading.bottom - (canvas.getBoundingClientRect().bottom - 30);
  });
  await block(page, "long").click({ position: { x: 6, y: 6 } });
  for (const next of ["t2", "b2"]) {
    await page.keyboard.press("ArrowDown");
    await expect(block(page, next)).toBeFocused();
    await expect.poll(async () => (await inView(page)).clamp).toBe(true);
    await expect.poll(() => clampFaults(page)).toEqual([]);
  }
  // Written there, the text keeps its caret in view as it grows.
  await page.keyboard.press("ArrowUp");
  await expect(block(page, "t2")).toBeFocused();
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
