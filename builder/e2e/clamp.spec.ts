// The selected block's toolbar (design/layout/NOTES.md, section 4.2), in
// Chromium: in every window and preview it stays whole inside the canvas,
// over none of the page's words, its moves and its head in view; under the
// open Insert drawer it moves right of it; a seam's "+" and its tip keep
// clear of it; its head opens the block menu under it, its More the right
// click's items, its moves are one step each. The rules themselves, on
// the page's numbers, are clamp-place.test.ts's; marks.spec.ts checks the
// places it takes.
import { block, clampFaults, clampKeysCovered, clampOverWords, clampPlace } from "./helpers/canvas.ts";
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

test("in every preview, and on a page drawn smaller, the toolbar stays in the canvas, off its block's words, its moves and its head in view", async ({ page, request }) => {
  // Twelve blocks, in three previews, in three windows.
  test.setTimeout(240_000);
  const { id } = await makePage(request, "Toolbar everywhere", page3());
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

test("under the open Insert drawer, the toolbar of a block it floats over moves right of it, and comes back when it closes", async ({ page, request }) => {
  const { id } = await makePage(request, "Toolbar under Insert", page3());
  await open(page, id);
  await block(page, "hh").click();
  await expect.poll(() => clampPlace(page)).toEqual({ side: "above", align: "start" });
  const toolbar = page.locator(".canvas .clamp");
  const frame = (await page.locator('.canvas [data-block-id="hh"] > .ov-sel').boundingBox())!;
  expect(Math.abs((await toolbar.boundingBox())!.x - frame.x)).toBeLessThan(1);
  expect(await clampOverWords(page)).toEqual([]);
  await drawer(page, "Insert");
  const cover = (await page.locator(".drawer-float").boundingBox())!;
  await expect.poll(async () => (await toolbar.boundingBox())!.x).toBeGreaterThanOrEqual(cover.x + cover.width);
  expect(await clampFaults(page)).toEqual([]);
  // A block clear of the drawer keeps its place.
  await block(page, "hi").focus();
  const right = (await page.locator('.canvas [data-block-id="hi"] > .ov-sel').boundingBox())!;
  await expect.poll(async () => Math.abs((await toolbar.boundingBox())!.x - right.x) < 1).toBe(true);
  expect(await clampFaults(page)).toEqual([]);
  // The drawer closed: back on the frame's left edge.
  await block(page, "hh").focus();
  await page.getByRole("button", { name: "Close Insert" }).click();
  await expect.poll(async () => Math.abs((await toolbar.boundingBox())!.x - frame.x) < 1).toBe(true);
});

// A dark band of two columns, as the example site's Notices page has: a
// heading and a text, and beside them a button set in the middle.
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

test("a seam's + moves off the toolbar it would stand on, which is drawn over it: no key of the block in focus is under it", async ({ page, request }) => {
  // On the phone page, a heading at the foot of a section with no space
  // below, under a text: its toolbar stands under it, on the seam below the
  // section, across the page's middle, where the seam has its "+".
  const long = "Tide notes for the whole week ahead, for every swim at the slipway, at first light.";
  const { id } = await makePage(request, "Toolbar over a seam", [
    { ...section("foot", "Foot", [column("f-1", [widget("ft", "text", { doc: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: long }] }] } }), heading("fh", "Swim at slack water, together")])]), style: { base: { spaceBelow: "none" } } },
    section("after", "After", [column("a-1", [heading("ah", "After the band")])]),
  ]);
  await open(page, id);
  await device(page, "Phone").click();
  await block(page, "fh").click();
  await expect.poll(() => clampPlace(page)).toMatchObject({ side: "below" });
  const toolbar = page.locator(".canvas .clamp");
  const plus = page.locator('.canvas [data-block-id="foot"] > .ins-sec');
  await expect(plus).toHaveCount(1);
  const band = (await block(page, "foot").boundingBox())!;
  const middle = band.x + band.width / 2;
  const foot = band.y + band.height;
  const drawn = (await toolbar.boundingBox())!;
  expect(drawn.x).toBeLessThan(middle);
  expect(drawn.x + drawn.width).toBeGreaterThan(middle);
  // Every key of the toolbar is drawn where it is, nothing over it.
  await expect.poll(() => clampKeysCovered(page)).toEqual([]);
  expect(await clampFaults(page)).toEqual([]);
  // The "+" stays on its seam, beside the toolbar, clear of it, and drawn
  // where it is.
  const sign = (await plus.boundingBox())!;
  expect(Math.abs(sign.y + sign.height / 2 - foot)).toBeLessThan(1);
  expect(sign.x >= drawn.x + drawn.width || sign.x + sign.width <= drawn.x).toBe(true);
  expect(await plus.evaluate((element) => {
    const box = element.getBoundingClientRect();
    return element.contains(document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2));
  })).toBe(true);
  // A press on More, where it is drawn, opens the heading's actions, not
  // the section picker of the "+".
  const more = toolbar.getByRole("button", { name: /^More/ });
  const key = (await more.boundingBox())!;
  await page.mouse.click(key.x + key.width / 2, key.y + key.height / 2);
  await expect(page.getByRole("menu", { name: "Heading actions" })).toBeVisible();
  await expect(page.getByRole("dialog", { name: /^Add a section/ })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(more).toBeFocused();
  // The text chosen instead: its toolbar elsewhere, the "+" back in the middle.
  await block(page, "ft").focus();
  await expect.poll(async () => {
    const back = (await plus.boundingBox())!;
    return Math.abs(back.x + back.width / 2 - middle) < 1;
  }).toBe(true);
});

// The tip of the seam below the band, under the pointer: whole inside the
// canvas's visible part, clear of the toolbar and of its "+", and of the
// Insert drawer: right of the "+" on the seam where there is room, as the
// layout draws it.
test("a seam's tip stays whole inside the canvas, clear of the toolbar and of its +", async ({ page, request }) => {
  const { id } = await makePage(request, "Tip beside the toolbar", band());
  for (const [size, beside] of [[{ width: 1440, height: 900 }, null], [{ width: 1184, height: 900 }, "Outline"], [{ width: 1024, height: 768 }, "Outline"]] as const) {
    const where = `${size.width}${beside ? `, the ${beside} open` : ""}`;
    await page.setViewportSize(size);
    await open(page, id);
    if (beside) await drawer(page, beside);
    await block(page, "nb").focus();
    await expect.poll(() => clampKeysCovered(page), where).toEqual([]);
    const plus = page.locator('.canvas [data-block-id="night"] > .ins-sec');
    const sign = (await plus.boundingBox())!;
    await page.mouse.move(sign.x + sign.width / 2 + 40, sign.y + sign.height / 2);
    const tip = page.locator(".canvas .seam-tip");
    await expect(tip, where).toHaveText("Add a section between Dark band and After");
    if (!beside) await expect(tip, where).toHaveAttribute("data-side", "right");
    const drawn = await page.evaluate(() => {
      const canvas = document.querySelector<HTMLElement>(".canvas")!;
      const bench = canvas.getBoundingClientRect();
      const box = (selector: string) => document.querySelector(selector)!.getBoundingClientRect();
      const t = box(".canvas .seam-tip");
      const meet = (a: DOMRect, b: DOMRect) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
      return {
        left: Math.round(t.left - (bench.left + canvas.clientLeft)),
        right: Math.round(bench.left + canvas.clientLeft + canvas.clientWidth - t.right),
        onClamp: meet(t, box(".canvas .clamp")),
        onPlus: meet(t, box('.canvas [data-block-id="night"] > .ins-sec')),
        drawer: [...document.querySelectorAll(".drawer-float")].some((d) => meet(t, d.getBoundingClientRect())),
      };
    });
    // Inside the canvas on both sides, 4 of room kept, and clear of the
    // toolbar, the "+" and the Insert drawer.
    expect(drawn.left, `${where}: room on the tip's left`).toBeGreaterThanOrEqual(3);
    expect(drawn.right, `${where}: room on the tip's right`).toBeGreaterThanOrEqual(3);
    expect(drawn, where).toMatchObject({ onClamp: false, onPlus: false, drawer: false });
  }
});

test("the toolbar's head opens the block menu under it, More the right click's items; its moves are one step each, the focus on the key", async ({ page, request }) => {
  const { id } = await makePage(request, "Toolbar keys", page3());
  await open(page, id);
  await block(page, "hh").click();
  const clamp = page.getByRole("toolbar", { name: "Heading tools" });
  await expect(clamp).toHaveAttribute("aria-orientation", "horizontal");
  const head = clamp.getByRole("button", { name: "Heading: block menu" });
  // The head names the block, its type's icon first.
  await expect(head).toHaveText("Heading");
  await head.click();
  const menu = page.getByRole("menu", { name: "Heading: block menu" });
  await expect(menu.getByRole("menuitem")).toHaveText([/^Move upFirst in Column 1$/, "Move down", /^Copy/, /^Paste after/, /^Duplicate/, "Insert before", /^Insert after/, /^Select Column 1/, /^Delete/]);
  // Under the toolbar, from the head's left.
  const drawn = (await clamp.boundingBox())!;
  const opened = (await menu.boundingBox())!;
  expect(Math.abs(opened.x - (await head.boundingBox())!.x)).toBeLessThan(1);
  expect(opened.y).toBeGreaterThanOrEqual(drawn.y + drawn.height);
  await expect(head).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Escape");
  await expect(head).toBeFocused();
  // Along the toolbar with the arrows.
  await page.keyboard.press("ArrowRight");
  await expect(clamp.locator("[data-grip]")).toBeFocused();
  await page.keyboard.press("ArrowLeft");
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
  // Up, from the toolbar: one more.
  await clamp.getByRole("button", { name: "Move up" }).click();
  await expect.poll(() => page.locator('.canvas [data-block-id="hero-1"] > [data-block-id]').evaluateAll((e) => e.map((x) => x.getAttribute("data-block-id")))).toEqual(["hh", "hb"]);
  await expect(clamp.getByRole("button", { name: "Move up" })).toBeFocused();
  const history = await drawer(page, "History");
  await expect(history.getByRole("listitem").filter({ hasText: "Moved Heading in Hero" })).toHaveCount(2);
});
