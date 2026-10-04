// The selected block's clamp (design/layout/NOTES.md, section 4.2), in
// Chromium: in every window and preview it keeps to the margin, over no
// block and no words, its head never hidden; under an open drawer it goes
// to the block's right side; its head opens the block menu beside it, its
// More the right click's items, its moves are one step each. The rules
// themselves, on the layout's numbers, are clamp-place.test.ts's; marks
// .spec.ts checks the gutters.
import { block, clampFaults, clampPlace } from "./helpers/canvas.ts";
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
