// The steps block in Chromium, in the editor and on the published page:
// its tile in Insert's Content group and in the "+"'s picker, each adding
// three steps that read as they come; a step written in the block's Steps
// group, drawn on the canvas and kept by the CMS; and published, plain
// HTML with no script, one ordered list, each step a heading and its text,
// numbered 1, 2, 3 by the stylesheet's counter in a disc of the theme's
// primary, its number in the colour that reads on it (on a disc of the
// block's own Accent, the site's Text), with a ring of paper at its edge
// on a primary band; three across on a desktop and one under the other
// below it, on a tablet as on a phone, the disc beside the title.
import type { Locator } from "@playwright/test";
import { axTexts } from "./helpers/ax.ts";
import { block } from "./helpers/canvas.ts";
import { cms, column, draftOf, drawer, expect, heading, makePage, open, openGroup, saved, section, test, widget } from "./helpers/site.ts";

test.use({ viewport: { width: 1440, height: 900 } });

const STEPS = [
  { title: "Get in touch", text: "Tell us what you would like to do and when." },
  { title: "Try it", text: "Come along once, with someone to show you how." },
  { title: "Join", text: "Stay on if it suits you, and we will see you there." },
];

test("the steps' tile is in Insert's Content group and in the picker, and each adds three steps", async ({ page, request }) => {
  const { id } = await makePage(request, "Steps tiles", [section("s", "Club", [column("c1", [heading("h", "How to join")])])]);
  await open(page, id);
  await block(page, "h").click();
  const insert = await drawer(page, "Insert");
  await insert.getByRole("group", { name: "Content" }).getByRole("button", { name: "Steps", exact: true }).click();
  await saved(page);
  await page.getByRole("button", { name: "Close Insert" }).click();

  await block(page, "h").click();
  await page.keyboard.press("+");
  const picker = page.getByRole("dialog", { name: "Add a block after Heading" });
  await picker.getByRole("button", { name: "Steps", exact: true }).click();
  await expect(picker).toHaveCount(0);
  await saved(page);

  const widgets = (await draftOf(request, id)).document.sections[0]!.children[0]!.children;
  expect(widgets.map((w) => w.type)).toEqual(["heading", "steps", "steps"]);
  for (const steps of widgets.slice(1)) expect(steps.props).toEqual({ items: STEPS });
});

test("a step written in the Steps group is drawn on the canvas and kept by the CMS", async ({ page, request }) => {
  const { id } = await makePage(request, "Steps written", [section("s", "Club", [column("c", [widget("sp", "steps", { items: STEPS })])])]);
  await open(page, id);
  await block(page, "sp").click();
  await openGroup(page, "Steps");
  const settings = page.getByRole("complementary", { name: "Settings" });
  const title = settings.getByRole("textbox", { name: "Title 2", exact: true });
  await title.fill("Try a swim");
  await title.blur();
  const text = settings.getByRole("textbox", { name: "Text 2", exact: true });
  await text.fill("Come along once.\nBring a bright cap.");
  await text.blur();
  await expect(block(page, "sp").locator("li > h3")).toHaveText(["Get in touch", "Try a swim", "Join"]);
  // The line break kept, as a break.
  await expect(block(page, "sp").locator("li").nth(1).locator("p br")).toHaveCount(1);
  await saved(page);

  const steps = (await draftOf(request, id)).document.sections[0]!.children[0]!.children[0]!;
  expect(steps.props).toEqual({ items: [STEPS[0], { title: "Try a swim", text: "Come along once.\nBring a bright cap." }, STEPS[2]] });
  await drawer(page, "History");
  await expect(page.getByRole("complementary", { name: "History" }).getByRole("listitem").filter({ hasText: "Changed step 2 in Steps in Club" }).first()).toBeVisible();
});

// Each item's disc as the stylesheet draws it, and where its title stands.
async function discs(root: Locator) {
  return root.locator("ol > li").evaluateAll((items) => items.map((item) => {
    const disc = getComputedStyle(item, "::before");
    const box = item.getBoundingClientRect();
    const title = item.querySelector("h3")!.getBoundingClientRect();
    return {
      content: disc.content, increment: getComputedStyle(item).counterIncrement,
      width: disc.width, height: disc.height, radius: disc.borderRadius, fill: disc.backgroundColor, number: disc.color, ring: disc.boxShadow,
      top: Math.round(box.top), left: Math.round(box.left), titleTop: Math.round(title.top), titleLeft: Math.round(title.left),
    };
  }));
}

// A colour of the theme's, as the page computes it.
async function tone(root: Locator, color: string): Promise<string> {
  return root.evaluate((element, value) => {
    const span = element.appendChild(document.createElement("span"));
    span.style.color = value;
    const computed = getComputedStyle(span).color;
    span.remove();
    return computed;
  }, color);
}

test("published, the steps are an ordered list the CMS serves with no script, numbered by the stylesheet's counter in a disc, three across on a desktop and one under the other below it", async ({ page, request }) => {
  const primary = { ...section("band", "Band", [column("bc", [widget("band-steps", "steps", { items: STEPS })])]), style: { base: { background: "primary" } } };
  const accent = { ...widget("accent-steps", "steps", { items: STEPS }), style: { base: { color: "accent" } } };
  const made = await makePage(request, "Steps served", [section("s", "Club", [column("c", [widget("club-steps", "steps", { items: STEPS }), accent])]), primary]);
  expect((await request.post(`${cms()}/api/pages/${made.id}/publish`, { data: {} })).status()).toBe(200);
  await page.goto(`${cms()}/${made.slug}`);
  await expect(page.locator("script")).toHaveCount(0);

  const root = page.locator('[data-block-id="club-steps"]');
  // One ordered list, each step its title, a heading, then its text.
  await expect(root.locator("ol > li > h3")).toHaveText(STEPS.map((step) => step.title));
  await expect(root.locator("ol > li > p")).toHaveText(STEPS.map((step) => step.text));
  // The page writes no number: the list's counter, started on the list and
  // counted on each item, is drawn before each one; its numbers, 1, 2, 3,
  // as the browser's accessibility tree reads them.
  expect(await root.locator("ol").evaluate((list) => getComputedStyle(list).counterReset)).toBe("step 0");
  const drawn = await discs(root);
  expect(drawn.map((disc) => [disc.content, disc.increment])).toEqual(STEPS.map(() => ["counter(step)", "step 1"]));
  await expect(root.locator("ol")).not.toContainText(/\d/);
  const numbers: string[] = [];
  for (const item of await root.locator("ol > li").all()) numbers.push((await axTexts(page, item))[0] ?? "");
  expect(numbers).toEqual(["1", "2", "3"]);

  // A disc of the theme's primary, its number in the site's Background,
  // no ring on a light band; a disc of the block's own Accent carries its
  // number in the site's Text; on a primary band, a ring of paper.
  const [paper, ink, red, orange] = [await tone(root, "var(--sw-background)"), await tone(root, "var(--sw-text)"), await tone(root, "var(--sw-primary)"), await tone(root, "var(--sw-accent)")];
  for (const disc of drawn) {
    expect([disc.width, disc.height, disc.radius]).toEqual(["40px", "40px", "50%"]);
    expect([disc.fill, disc.number]).toEqual([red, paper]);
    expect(disc.ring).toBe("rgba(0, 0, 0, 0) 0px 0px 0px 2px inset");
  }
  for (const disc of await discs(page.locator('[data-block-id="accent-steps"]'))) expect([disc.fill, disc.number]).toEqual([orange, ink]);
  for (const disc of await discs(page.locator('[data-block-id="band-steps"]'))) expect(disc.ring).toBe(`${paper} 0px 0px 0px 2px inset`);

  // Three across on a desktop, each disc above its title.
  expect(new Set(drawn.map((disc) => disc.top)).size).toBe(1);
  expect(drawn[0]!.left).toBeLessThan(drawn[1]!.left);
  expect(drawn[1]!.left).toBeLessThan(drawn[2]!.left);
  for (const disc of drawn) {
    expect(disc.titleLeft).toBe(disc.left);
    expect(disc.titleTop).toBeGreaterThanOrEqual(disc.top + 40);
  }

  // Below the desktop layout, on a tablet as on a phone, one under the
  // other, each disc beside its title, as a section's columns stack there.
  for (const width of [768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const stacked = await discs(root);
    expect(new Set(stacked.map((disc) => disc.left)).size, `one column at ${width}`).toBe(1);
    expect(stacked[0]!.top).toBeLessThan(stacked[1]!.top);
    expect(stacked[1]!.top).toBeLessThan(stacked[2]!.top);
    for (const disc of stacked) {
      expect(disc.titleLeft).toBeGreaterThanOrEqual(disc.left + 40);
      expect(disc.titleTop).toBeLessThan(disc.top + 40);
    }
  }
});
