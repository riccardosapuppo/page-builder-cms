// Colours of the site's own, in Chromium against the run's CMS: a slot's
// in Site style and a block's in its panel, picked from the swatches or the
// picker, show on the canvas at once and on the published page, where the
// CMS's stylesheet for them draws them (/colors.css; the page's policy
// takes no inline style); a dark background brings the site's light tone
// for its words; a drag over the picker shows each colour on the canvas
// before it is kept, then keeps one, one step of undo; nothing serious or
// critical for axe with the swatches and the picker open. The tests of a
// run share one CMS, so the site's style is put back afterwards.
import type { APIRequestContext } from "@playwright/test";
import { axe } from "./helpers/axe.ts";
import { block } from "./helpers/canvas.ts";
import { cms, column, draftOf, expect, heading, makePage, open, saved, section, test, widget } from "./helpers/site.ts";

test.use({ viewport: { width: 1440, height: 900 } });

const GREEN = "rgb(47, 111, 94)";
const INDIGO_900 = "rgb(26, 35, 126)";
const PAPER = "rgb(255, 255, 255)";
const PLUM = "rgb(59, 47, 92)";
const TEAL = "rgb(0, 121, 107)";

async function siteStyle(request: APIRequestContext): Promise<{ palette: Record<string, string>; typeScale: string }> {
  return (await (await request.get(`${cms()}/api/site-style`)).json()) as never;
}

// A heading, and a button filled with Primary.
const page1 = () => [section("s", "Story", [column("c", [heading("h", "In the site's own colours"), { ...widget("b", "button", { label: "Join a trial swim", href: "/join" }), style: { base: { background: "primary" } } }])])];

test("a colour of the site's own for Primary shows on the canvas at once, and on the published page from the CMS's stylesheet", { tag: "@a11y" }, async ({ page, request }) => {
  const before = await siteStyle(request);
  try {
    const { id, slug } = await makePage(request, "Own primary", page1());
    expect((await request.post(`${cms()}/api/pages/${id}/publish`, { data: {} })).status()).toBe(200);
    await open(page, id);
    await page.getByRole("complementary", { name: "Settings" }).getByRole("button", { name: "Site style", exact: true }).click();
    const panel = page.getByRole("complementary", { name: "Site style" });
    await panel.getByRole("button", { name: /^Primary/ }).click();
    // The swatches under the tones, the picker's tile last.
    await panel.getByRole("group", { name: "Primary: swatches" }).getByRole("button", { name: "A colour of its own" }).click();
    const hex = panel.getByLabel("Primary: hex");
    await hex.fill("#2F6F5E");
    await hex.press("Enter");
    await expect(page.locator(".canvas .site")).toHaveAttribute("data-primary", "#2f6f5e");
    await expect(page.locator(".canvas .site style[data-free-colors]")).toHaveCount(1);
    await expect(panel.getByRole("status")).toHaveText("Saved for every page");
    expect((await siteStyle(request)).palette.primary).toBe("#2f6f5e");
    await expect(panel.getByRole("button", { name: /^Primary/ })).toContainText("Custom, #2f6f5e");
    expect((await axe(page)).serious).toEqual([]);

    // The published page, as a visitor's browser draws it: by attribute and
    // the stylesheet the layout links, no inline style.
    const visitor = await page.context().newPage();
    await visitor.goto(`${cms()}/${slug}`);
    await expect(visitor.locator(".site")).toHaveAttribute("data-primary", "#2f6f5e");
    await expect(visitor.locator('link[rel=stylesheet][href^="/colors.css?"]')).toHaveCount(1);
    await expect(visitor.locator('[data-block-id="b"] .sw-btn')).toHaveCSS("background-color", GREEN);
    await expect(visitor.locator("[style]")).toHaveCount(0);
    await visitor.close();
  } finally {
    const put = await request.put(`${cms()}/api/site-style`, { data: { palette: before.palette, typeScale: before.typeScale } });
    expect(put.status()).toBe(200);
  }
});

test("a section's background from the swatches, a hue's shade held open, shows on the canvas and the published page, its words in the site's light tone", async ({ page, request }) => {
  const { id, slug } = await makePage(request, "Own background", page1());
  await open(page, id);
  await block(page, "s").focus();
  const sidebar = page.getByRole("complementary", { name: "Settings" });
  await sidebar.getByRole("tab", { name: "Block" }).click();
  const group = sidebar.getByRole("button", { name: /^Background/ });
  if ((await group.getAttribute("aria-expanded")) === "false") await group.click();
  const swatches = sidebar.getByRole("group", { name: "Background: swatches" });
  // Held down, Indigo shows its shades; the press keeps nothing.
  const indigo = swatches.getByRole("button", { name: "Indigo", exact: true });
  await indigo.hover();
  await page.mouse.down();
  await expect(sidebar.getByRole("group", { name: "Indigo shades" })).toBeVisible();
  await page.mouse.up();
  expect((await draftOf(request, id)).document.sections[0]!.style).toEqual({ base: {} });
  await sidebar.getByRole("button", { name: "Indigo 900" }).click();
  await expect(block(page, "s")).toHaveAttribute("data-bg", "#1a237e");
  await expect(block(page, "s")).toHaveCSS("background-color", INDIGO_900);
  // A dark background: the heading takes the site's light tone, by itself.
  await expect(block(page, "h").locator("h2")).toHaveCSS("color", PAPER);
  await expect(swatches.getByRole("button", { name: "Indigo 900" })).toHaveAttribute("aria-pressed", "true");
  await saved(page);
  expect((await draftOf(request, id)).document.sections[0]!.style).toEqual({ base: { background: "#1a237e" } });

  expect((await request.post(`${cms()}/api/pages/${id}/publish`, { data: {} })).status()).toBe(200);
  const visitor = await page.context().newPage();
  await visitor.goto(`${cms()}/${slug}`);
  await expect(visitor.locator('[data-block-id="s"]')).toHaveCSS("background-color", INDIGO_900);
  await expect(visitor.getByRole("heading", { name: "In the site's own colours" })).toHaveCSS("color", PAPER);
  await visitor.close();
});

// Which colour wins with free colours, as with the curated tones: a block's
// own colour over the one its background brings, free or curated, in
// whatever order the stylesheet writes the colours; and a tablet's own
// background brings its colour over the desktop's own colour.
test("a block's own colour wins over the one its free background brings, and a tablet's own background brings its colour over the desktop's", async ({ page, request }) => {
  // A section of one column, the column's style the one given.
  const own = (id: string, text: string, style: Record<string, unknown>) => section(`s${id}`, text, [{ ...column(id, [heading(`${id}h`, text)]), style }]);
  const { id, slug } = await makePage(request, "Whose colour", [
    // A light free background, and a free colour that sorts before it.
    own("c1", "Plum on sand", { base: { background: "#f2c94c", color: "#3b2f5c" } }),
    // A dark free background, and Primary for the words.
    own("c2", "Primary on plum", { base: { background: "#3b2f5c", color: "primary" } }),
    // Teal words; on a tablet, a dark background of the tablet's own.
    own("c3", "Teal, then light on plum", { base: { color: "#00796b" }, tablet: { background: "#3b2f5c" } }),
    section("sp", "Primary", [column("cp", [{ ...heading("p", "Primary"), style: { base: { color: "primary" } } }])]),
  ]);
  const colour = (target: typeof page, block: string) => target.locator(`[data-block-id="${block}"]`).evaluate((element) => getComputedStyle(element).color);

  await open(page, id);
  const primary = await colour(page, "p");
  expect(primary).not.toBe(PAPER);
  await expect(block(page, "c1")).toHaveCSS("color", PLUM);
  await expect(block(page, "c2")).toHaveCSS("color", primary);
  await expect(block(page, "c3")).toHaveCSS("color", TEAL);

  expect((await request.post(`${cms()}/api/pages/${id}/publish`, { data: {} })).status()).toBe(200);
  const visitor = await page.context().newPage();
  await visitor.goto(`${cms()}/${slug}`);
  await expect(visitor.locator('[data-block-id="c1"]')).toHaveCSS("color", PLUM);
  await expect(visitor.locator('[data-block-id="c2"]')).toHaveCSS("color", await colour(visitor, "p"));
  await expect(visitor.locator('[data-block-id="c3"]')).toHaveCSS("color", TEAL);
  // A tablet's width: the tablet's own dark background, and its light words.
  await visitor.setViewportSize({ width: 700, height: 900 });
  await expect(visitor.locator('[data-block-id="c3"]')).toHaveCSS("background-color", PLUM);
  await expect(visitor.locator('[data-block-id="c3"]')).toHaveCSS("color", PAPER);
  await expect(visitor.locator('[data-block-id="c1"]')).toHaveCSS("color", PLUM);
  await visitor.close();
});

test("a drag over the picker shows each colour on the canvas before it is kept, and keeps one when let go: one step of undo", async ({ page, request }) => {
  const { id } = await makePage(request, "Dragged colour", page1());
  await open(page, id);
  await block(page, "s").focus();
  const sidebar = page.getByRole("complementary", { name: "Settings" });
  await sidebar.getByRole("tab", { name: "Block" }).click();
  const group = sidebar.getByRole("button", { name: /^Background/ });
  if ((await group.getAttribute("aria-expanded")) === "false") await group.click();
  await sidebar.getByRole("group", { name: "Background: swatches" }).getByRole("button", { name: "A colour of its own" }).click();
  const area = sidebar.getByRole("slider", { name: "Background: saturation and brightness" });
  const box = (await area.boundingBox())!;
  const shown = () => block(page, "s").evaluate((element) => getComputedStyle(element).backgroundColor);
  const before = await shown();
  await page.mouse.move(box.x + box.width * 0.9, box.y + box.height * 0.2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.3, { steps: 6 });
  // Drawn, not kept: the page's own document is as it was.
  await expect.poll(shown).not.toBe(before);
  const midway = await shown();
  expect((await draftOf(request, id)).document.sections[0]!.style).toEqual({ base: {} });
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.4, { steps: 6 });
  await expect.poll(shown).not.toBe(midway);
  await page.mouse.up();
  await saved(page);
  const kept = (await draftOf(request, id)).document.sections[0]!.style as { base: { background?: string } };
  expect(kept.base.background).toMatch(/^#[0-9a-f]{6}$/);
  // One step back puts the section as it was.
  await page.keyboard.press("Escape");
  await page.locator(".canvas").focus().catch(() => {});
  await page.getByRole("button", { name: /^Undo/ }).click();
  await expect.poll(shown).toBe(before);
});
