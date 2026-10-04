// The selected block's clamp (design/layout/NOTES.md, section 4.2), in
// Chromium: in every window and preview it keeps to the margin, over no
// block and no words, its head never hidden; under an open drawer it goes
// to the block's right side; its head opens the block menu beside it, its
// More the right click's items, its moves are one step each. The rules
// themselves, on the layout's numbers, are clamp-place.test.ts's; marks
// .spec.ts checks the gutters.
import { block, clampFaults, clampKeysCovered, clampPlace } from "./helpers/canvas.ts";
import { column, device, drawer, expect, heading, makePage, open, section, test, widget } from "./helpers/site.ts";

test.use({ viewport: { width: 1440, height: 900 } });

// The approved layout's own page, in short: a hero of two columns 32
// apart, three icon boxes 32 apart, a section of two at the theme's 48.
const page3 = () => [
  { ...section("hero", "Hero", [column("hero-1", [heading("hh", "Swim at slack water"), widget("hb", "button", { label: "Join a trial swim", href: "#" })]), column("hero-2", [heading("hi", "Dawn")])]), style: { base: { spaceBetween: "xl" } } },
  { ...section("swims", "What we do", [column("s-1", [widget("sa", "iconbox", { icon: "sunrise", title: "Dawn swims", text: "Twice a week." })]), column("s-2", [widget("sb", "iconbox", { icon: "buoys", title: "Beginners' course", text: "Four sessions." })]), column("s-3", [widget("sc", "iconbox", { icon: "cup", title: "Winter series", text: "Short and cold." })])]), style: { base: { spaceBetween: "xl" } } },
  section("meet", "See the bay", [column("m-1", [heading("ma", "See the bay before you join")]), column("m-2", [widget("mb", "quote", { text: "Bring a bright cap." })])]),
];
const blocks = ["hh", "hb", "hi", "sa", "sb", "sc", "ma", "mb", "hero-1", "hero-2", "hero", "meet"];

test("in every preview, and on a page drawn smaller, the clamp keeps to the margin, over no block and no words, its moves and its head in view", async ({ page, request }) => {
  // Twelve blocks, in three previews, in three windows.
  test.setTimeout(240_000);
  const { id } = await makePage(request, "Clamp everywhere", page3());
  for (const size of [{ width: 1440, height: 900 }, { width: 1280, height: 800 }, { width: 1024, height: 768 }]) {
    await page.setViewportSize(size);
    await open(page, id);
    for (const preview of ["Desktop", "Tablet", "Phone"] as const) {
      await device(page, preview).click();
      for (const target of blocks) {
        await block(page, target).evaluate((element) => element.scrollIntoView({ block: "center" }));
        await block(page, target).focus();
        await expect(page.locator(".canvas .clamp")).toHaveCount(1);
        await expect.poll(() => clampFaults(page), `${size.width} ${preview} ${target}`).toEqual([]);
      }
    }
    await device(page, "Desktop").click();
  }
});

test("under the open Insert drawer, a first column's clamp goes to the block's right side, by the same rules; the others stay", async ({ page, request }) => {
  const { id } = await makePage(request, "Clamp under Insert", page3());
  await open(page, id);
  await block(page, "hh").click();
  await expect.poll(() => clampPlace(page)).toEqual({ size: "full", side: "left", tie: "on" });
  await drawer(page, "Insert");
  // Its right gutter is 32: the narrow clamp, centred in it.
  await expect.poll(() => clampPlace(page)).toEqual({ size: "narrow", side: "right", tie: "none" });
  expect(await clampFaults(page)).toEqual([]);
  // A block clear of the drawer keeps its left.
  await block(page, "hi").focus();
  await expect.poll(() => clampPlace(page)).toMatchObject({ side: "left" });
  expect(await clampFaults(page)).toEqual([]);
  // The drawer closed: back on the left.
  await block(page, "hh").focus();
  await page.getByRole("button", { name: "Close Insert" }).click();
  await expect.poll(() => clampPlace(page)).toEqual({ size: "full", side: "left", tie: "on" });
});

// A dark band of two columns, as the example site's Notices page has: a
// heading and a text, and beside them a button set in the middle, whose
// clamp stands in the gutter in the page's middle, where the seam's "+"
// below the section stands too.
const band = () => [
  {
    ...section("night", "Dark band", [
      column("n-1", [heading("nh", "Night swim, once a year"), widget("nt", "text", { doc: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "On the shortest night, with lights on the buoys. Members only." }] }] } })]),
      { ...column("n-2", [widget("nb", "button", { label: "Ask about it", href: "#" })]), style: { base: { verticalAlign: "middle" } } },
    ]),
    style: { base: { background: "primary", spaceAbove: "section-s", spaceBelow: "section-s" } },
  },
  section("after", "After", [column("a-1", [heading("ah", "After the band")])]),
];

test("a seam's + moves off the clamp it would stand on, which is drawn over it: no key of the block in focus is under it, on a page drawn smaller or beside the Outline", async ({ page, request }) => {
  const { id } = await makePage(request, "Clamp over a seam", band());
  for (const [size, beside] of [[{ width: 1024, height: 768 }, null], [{ width: 1280, height: 800 }, "Outline"]] as const) {
    const where = `${size.width}${beside ? `, the ${beside} open` : ""}`;
    await page.setViewportSize(size);
    await open(page, id);
    if (beside) await drawer(page, beside);
    // The button chosen by the arrows, as a keyboard user reaches it: up
    // from it, then down again.
    await block(page, "nb").focus();
    await page.keyboard.press("ArrowUp");
    await expect(block(page, "nb")).not.toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(block(page, "nb")).toBeFocused();
    const clamp = page.locator(".canvas .clamp");
    const plus = page.locator('.canvas [data-block-id="night"] > .ins-sec');
    await expect(plus).toHaveCount(1);
    // The page is drawn smaller, and the clamp, at its size, runs on past
    // the section's foot in the page's middle, where the "+" would stand.
    expect(Number(await page.locator(".canvas .frame").getAttribute("data-scale")), where).toBeLessThan(0.9);
    const section = (await block(page, "night").boundingBox())!;
    const middle = section.x + section.width / 2;
    const foot = section.y + section.height;
    const drawn = (await clamp.boundingBox())!;
    expect(drawn.x, where).toBeLessThan(middle);
    expect(drawn.x + drawn.width, where).toBeGreaterThan(middle);
    expect(drawn.y + drawn.height, where).toBeGreaterThan(foot - 16);
    // Every key of the clamp is drawn where it is, nothing over it.
    await expect.poll(() => clampKeysCovered(page), where).toEqual([]);
    // The "+" stays on its seam, beside the clamp, clear of it, and drawn
    // where it is.
    const sign = (await plus.boundingBox())!;
    expect(Math.abs(sign.y + sign.height / 2 - foot), where).toBeLessThan(1);
    expect(sign.x >= drawn.x + drawn.width || sign.x + sign.width <= drawn.x, where).toBe(true);
    expect(await plus.evaluate((element) => {
      const box = element.getBoundingClientRect();
      return element.contains(document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2));
    }), where).toBe(true);
    // A press on More, where it is drawn, opens the button's actions, not
    // the section picker of the "+".
    const more = clamp.getByRole("button", { name: /^More/ });
    const key = (await more.boundingBox())!;
    await page.mouse.click(key.x + key.width / 2, key.y + key.height / 2);
    await expect(page.getByRole("menu", { name: "Button actions" }), where).toBeVisible();
    await expect(page.getByRole("dialog", { name: /^Add a section/ })).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(more).toBeFocused();
    // The heading chosen instead: its clamp in the page's left margin, the
    // "+" back in the middle.
    await block(page, "nh").focus();
    await expect.poll(async () => {
      const back = (await plus.boundingBox())!;
      return Math.abs(back.x + back.width / 2 - middle) < 1;
    }, where).toBe(true);
  }
});

test("the clamp's head opens the block menu beside it, More the right click's items; its moves are one step each, the focus on the key", async ({ page, request }) => {
  const { id } = await makePage(request, "Clamp keys", page3());
  await open(page, id);
  await block(page, "hh").click();
  const clamp = page.getByRole("toolbar", { name: "Heading tools" });
  const head = clamp.getByRole("button", { name: "Heading: block menu" });
  await head.click();
  const menu = page.getByRole("menu", { name: "Heading: block menu" });
  await expect(menu.getByRole("menuitem")).toHaveText([/^Move upFirst in Column 1$/, "Move down", /^Copy/, /^Paste after/, /^Duplicate/, "Insert before", /^Insert after/, /^Select Column 1/, /^Delete/]);
  // Beside the clamp, at its head's height.
  const drawn = (await clamp.boundingBox())!;
  const opened = (await menu.boundingBox())!;
  expect(opened.x).toBeGreaterThanOrEqual(drawn.x + drawn.width);
  expect(Math.abs(opened.y - drawn.y)).toBeLessThan(1);
  await expect(head).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Escape");
  await expect(head).toBeFocused();
  await clamp.getByRole("button", { name: /^More/ }).click();
  await expect(page.getByRole("menu", { name: "Heading actions" }).getByRole("menuitem")).toHaveText([/^Copy/, /^Paste after/, /^Duplicate/, "Insert before", /^Insert after/, /^Select Column 1/, /^Delete/]);
  await page.keyboard.press("Escape");
  await expect(clamp.getByRole("button", { name: /^More/ })).toBeFocused();
  // Down, from the menu: one step, the head keeping the focus.
  await head.click();
  await menu.getByRole("menuitem", { name: "Move down" }).click();
  await expect.poll(() => page.locator('.canvas [data-block-id="hero-1"] > [data-block-id]').evaluateAll((e) => e.map((x) => x.getAttribute("data-block-id")))).toEqual(["hb", "hh"]);
  await expect(head).toBeFocused();
  // Up, from the clamp: one more.
  await clamp.getByRole("button", { name: "Move up" }).click();
  await expect.poll(() => page.locator('.canvas [data-block-id="hero-1"] > [data-block-id]').evaluateAll((e) => e.map((x) => x.getAttribute("data-block-id")))).toEqual(["hh", "hb"]);
  await expect(clamp.getByRole("button", { name: "Move up" })).toBeFocused();
  const history = await drawer(page, "History");
  await expect(history.getByRole("listitem").filter({ hasText: "Moved Heading in Hero" })).toHaveCount(2);
});
