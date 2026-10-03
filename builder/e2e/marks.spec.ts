// The editor's marks on the canvas (the hover outline, the selection's
// frame and bar) are drawn inside each block's root, after the block's own
// content. They must leave the page's layout as the published page draws
// it: a stylesheet rule that counts a block's children (:last-child) would
// count the marks too. The canvas's other parity checks draw the page with
// nothing hovered or selected, so they cannot see it; this one measures
// the real canvas with a block hovered and selected, against the page a
// visitor gets. A button's marks hug the pill it draws, as the approved
// design draws them, not the column-wide root around it, and follow the
// pill where an alignment moves it. The section's
// tab carries its grip and its +, and the selected block its dimension
// line, in steps.
import type { Page } from "@playwright/test";
import { block, caption, moveOnto, pickUp } from "./helpers/canvas.ts";
import { cms, column, draftOf, expect, heading, makePage, open, saved, section, test, widget } from "./helpers/site.ts";

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
  await page.getByRole("tab", { name: "Style" }).click();
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
  await button.locator(":scope > .ov-sel .ov-bar").waitFor();
  await page.getByRole("button", { name: /^Select Column/ }).click();
  await expect(block(page, "c")).toHaveAttribute("data-editor-selected", "true");
  await page.getByRole("tab", { name: "Style" }).click();
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

test("the section's tab: its grip, its name and columns, its +, which adds a section after it", async ({ page, request }) => {
  const { id } = await makePage(request, "Tab", twoSections());
  await open(page, id);
  await block(page, "h").click();
  const tab = page.locator('.canvas [data-block-id="s1"] > .ov-section > .ov-tab');
  await expect(tab).toHaveText("Hero 2 columns");
  await expect(tab.locator("[data-grip] svg")).toHaveCount(1);
  await tab.getByRole("button", { name: "Add a section after Hero" }).click();
  await expect.poll(() => sectionIds(page)).toHaveLength(3);
  const [, added] = await sectionIds(page);
  expect(added).not.toBe("s2");
  await expect(block(page, added!)).toBeFocused();
  await expect(block(page, added!)).toHaveAttribute("data-editor-selected", "true");
  await saved(page);
  const draft = await draftOf(request, id);
  expect(draft.document.sections.map((s) => [s.id, s.children.length])).toEqual([["s1", 2], [added, 1], ["s2", 1]]);
});

test("the section's tab's grip drags the section, though a widget inside it is the one selected", async ({ page, request }) => {
  const { id } = await makePage(request, "Tab drag", twoSections());
  await open(page, id);
  await block(page, "h").click();
  await pickUp(page, page.locator('.canvas [data-block-id="s1"] > .ov-section > .ov-tab [data-grip]'));
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

// How much of a block's words the selection's bar covers, in square
// pixels, and where the bar stands.
async function barOver(page: Page, selected: string, above: string): Promise<{ place: string; covered: number }> {
  return page.evaluate(({ id, aboveId }) => {
    const frame = document.querySelector<HTMLElement>(`.canvas [data-block-id="${id}"] > .ov-sel`)!;
    const bar = frame.querySelector(":scope > .ov-bar")!.getBoundingClientRect();
    const range = document.createRange();
    let covered = 0;
    const walker = document.createTreeWalker(document.querySelector(`.canvas [data-block-id="${aboveId}"]`)!, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (node.parentElement?.closest(".ov")) continue;
      range.selectNodeContents(node);
      for (const r of range.getClientRects()) covered += Math.max(0, Math.min(r.right, bar.right) - Math.max(r.left, bar.left)) * Math.max(0, Math.min(r.bottom, bar.bottom) - Math.max(r.top, bar.top));
    }
    return { place: frame.dataset.bar ?? "", covered: Math.round(covered) };
  }, { id: selected, aboveId: above });
}

test("the selection's bar moves to the right corner where the left one would cover the words above, and under a text being written where both would", async ({ page, request }) => {
  const text = (words: string) => ({ doc: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: words }] }] } });
  const { id } = await makePage(request, "Bar places", [
    section("s1", "Short", [column("c1", [heading("short", "Swim by the keys"), widget("t1", "text", text("Tide notes"))])]),
    section("s2", "Long", [column("c2", [{ ...heading("long", "Swim at slack water, twice a week, at first light, when the bay is flat"), props: { level: 1, text: "Swim at slack water, twice a week, at first light, when the bay is flat" } }, widget("t2", "text", text("Dawn swims, beginners' courses and a winter series."))])]),
  ]);
  await open(page, id);
  // A short heading above: the left corner would hide its words, the right one hides none.
  await block(page, "t1").click();
  expect(await barOver(page, "t1", "short")).toEqual({ place: "right", covered: 0 });
  await page.keyboard.press("Enter");
  await expect(page.getByRole("group", { name: "Formatting" })).toBeVisible();
  await expect.poll(() => barOver(page, "t1", "short")).toEqual({ place: "right", covered: 0 });
  await page.keyboard.press("Escape");
  // A heading as wide as its column: both top corners would cover it; the
  // text being written, last in its column, has room under it.
  await block(page, "t2").click();
  expect((await barOver(page, "t2", "long")).place).toMatch(/^(|right)$/);
  await page.keyboard.press("Enter");
  await expect(page.getByRole("group", { name: "Formatting" })).toBeVisible();
  await expect.poll(() => barOver(page, "t2", "long")).toEqual({ place: "below", covered: 0 });
  // The link's field opens under the bar.
  await page.keyboard.press("Control+k");
  const field = page.locator(".ov-link");
  await expect(field).toBeVisible();
  const barBox = (await page.locator('.canvas [data-block-id="t2"] .ov-bar').boundingBox())!;
  expect((await field.boundingBox())!.y).toBeGreaterThanOrEqual(barBox.y + barBox.height);
});
