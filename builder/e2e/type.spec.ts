// Type of a block's own, in Chromium against the run's CMS: a heading's
// size, weight, letter spacing, line height and letter width, set in the
// sidebar's Type group, show on the canvas at once and on the published
// page, where the CMS's stylesheet for them draws them (/type/<digest>.css;
// the page's policy takes no inline style); a size in vw is a hundredth of
// the page's width, the same on the canvas's tablet as in a tablet's
// window; a tablet's and a phone's own values hold on their widths only; a
// value refused is marked on its field and changes nothing; nothing serious
// or critical for axe with the group open.
import type { Locator, Page } from "@playwright/test";
import { axe } from "./helpers/axe.ts";
import { block } from "./helpers/canvas.ts";
import { cms, column, device, draftOf, expect, makePage, open, openGroup, saved, section, test, widget } from "./helpers/site.ts";

test.use({ viewport: { width: 1440, height: 900 } });

const rich = (text: string) => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] });

// A display heading and a text under it, in a band of its own.
const hero = (style: Record<string, unknown> = { base: { textSize: "display" } }) => [
  section("s", "Hero", [column("c", [
    { ...widget("h", "heading", { level: 1, text: "Swim at slack water" }), style },
    widget("t", "text", { doc: rich("Dawn swims, timed to the one quiet hour the tide gives us.") }),
  ])]),
];

// What the stylesheets give an element, in pixels where they are lengths.
async function typeOf(target: Locator): Promise<{ size: number; weight: string; spacing: number; height: number; stretch: string; family: string }> {
  return target.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      size: Number.parseFloat(style.fontSize),
      weight: style.fontWeight,
      spacing: Number.parseFloat(style.letterSpacing),
      height: Number.parseFloat(style.lineHeight),
      stretch: style.fontStretch,
      family: style.fontFamily,
    };
  });
}

const settings = (page: Page) => page.getByRole("complementary", { name: "Settings" });

async function typeIn(box: Locator, text: string): Promise<void> {
  await box.fill(text);
  await box.press("Enter");
}

test("a heading's own type, set in the Type group, shows on the canvas at once and on the published page from the CMS's stylesheet", { tag: "@a11y" }, async ({ page, request }) => {
  const { id, slug } = await makePage(request, "Own type", hero());
  await open(page, id);
  await block(page, "h").click();
  const sidebar = settings(page);
  await sidebar.getByRole("tab", { name: "Block" }).click();
  const group = await openGroup(page, "Type");
  const preset = await typeOf(block(page, "h"));

  // A size in vw: a hundredth of the page's width, the canvas's own.
  await sidebar.getByRole("radiogroup", { name: "Size: unit" }).getByRole("radio", { name: "vw" }).click();
  await typeIn(sidebar.getByRole("textbox", { name: "Size" }), "6");
  await expect(block(page, "h")).toHaveAttribute("data-font-size", "6vw");
  const width = await page.locator(".canvas .site").evaluate((element) => element.getBoundingClientRect().width);
  await expect.poll(async () => (await typeOf(block(page, "h"))).size).toBeCloseTo(width * 0.06, 1);
  // The weight, a step up from the face's Bold.
  const weight = sidebar.getByRole("slider", { name: "Weight" });
  await expect(weight).toHaveAttribute("aria-valuetext", "Bold, 700, the preset’s");
  await weight.focus();
  await weight.press("ArrowRight");
  await typeIn(sidebar.getByRole("textbox", { name: "Letter spacing" }), "-0.02");
  await typeIn(sidebar.getByRole("textbox", { name: "Line height" }), "0.95");
  await typeIn(sidebar.getByRole("textbox", { name: "Letter width" }), "80");
  await expect(block(page, "h")).toHaveAttribute("data-font-stretch", "80");
  const own = await typeOf(block(page, "h"));
  expect(own).toMatchObject({ weight: "800", stretch: "80%", family: preset.family });
  expect(own.spacing).toBeCloseTo(-0.02 * own.size, 2);
  expect(own.height).toBeCloseTo(0.95 * own.size, 2);
  // The text under it keeps its own type.
  expect(await typeOf(block(page, "t"))).toMatchObject({ stretch: "100%" });
  await expect(page.locator(".canvas .site style[data-free-type]")).toHaveCount(1);
  await saved(page);
  expect((await draftOf(request, id)).document.sections[0]!.children[0]!.children[0]!.style).toEqual({
    base: { textSize: "display", fontSize: "6vw", fontWeight: 800, letterSpacing: -0.02, lineHeight: 0.95, letterWidth: 80 },
  });
  expect((await axe(page)).serious).toEqual([]);
  // Closed, the group says what it holds.
  await group.click();
  await expect(group).toHaveAccessibleDescription("6 vw, 800, \u22120.02 em, 0.95, 80 %");

  // The published page, as a visitor's browser draws it: by attribute and
  // the stylesheet the layout links, no inline style.
  expect((await request.post(`${cms()}/api/pages/${id}/publish`, { data: {} })).status()).toBe(200);
  const visitor = await page.context().newPage();
  await visitor.goto(`${cms()}/${slug}`);
  const heading = visitor.locator('[data-block-id="h"]');
  await expect(heading).toHaveAttribute("data-font-size", "6vw");
  await expect(visitor.locator('link[rel=stylesheet][href^="/type/"]')).toHaveCount(1);
  await expect(visitor.locator("[style]")).toHaveCount(0);
  const published = await typeOf(heading);
  expect(published).toMatchObject({ weight: "800", stretch: "80%" });
  expect(published.size).toBeCloseTo(1440 * 0.06, 1);
  expect(published.spacing).toBeCloseTo(-0.02 * published.size, 2);
  expect(published.height).toBeCloseTo(0.95 * published.size, 2);
  await visitor.close();
});

// The heading set in the headings' face by name, so the face's class
// (.w.face-heading, weighing two) draws a weight of its own on every
// device, which the block's own must win over.
test("a size in vw is the page's width on the canvas's tablet as in a tablet's window, and a tablet's and a phone's own values hold on their widths only", async ({ page, request }) => {
  const { id, slug } = await makePage(request, "Type on devices", hero({ base: { textSize: "display", typeface: "heading", fontSize: "6vw", fontWeight: 800 }, phone: { fontSize: "32px" } }));
  await open(page, id);
  await expect(block(page, "h")).toHaveClass(/\bface-heading\b/);
  expect((await typeOf(block(page, "h"))).weight).toBe("800");
  await device(page, "Tablet").click();
  await expect(page.locator(".canvas .site")).toHaveCSS("width", "768px");
  // 6 vw on the canvas's tablet: 6% of 768, not of the editor's window.
  await expect.poll(async () => (await typeOf(block(page, "h"))).size).toBeCloseTo(46.08, 2);

  // The tablet's own size and weight, set where the desktop's show.
  await block(page, "h").click();
  const sidebar = settings(page);
  await sidebar.getByRole("tab", { name: "Block" }).click();
  await openGroup(page, "Type");
  const size = sidebar.getByRole("textbox", { name: "Size" });
  await expect(size).toHaveValue("");
  await expect(size).toHaveAttribute("placeholder", "6");
  await typeIn(size, "5");
  const weight = sidebar.getByRole("slider", { name: "Weight" });
  await weight.focus();
  await weight.press("ArrowLeft");
  await expect(sidebar.getByText("Tablet override: 5 vw. Desktop uses 6 vw; phones have their own, 32 px.")).toBeVisible();
  await expect.poll(async () => (await typeOf(block(page, "h"))).size).toBeCloseTo(38.4, 2);
  const tablet = await typeOf(block(page, "h"));
  expect(tablet.weight).toBe("700");
  await saved(page);
  expect((await draftOf(request, id)).document.sections[0]!.children[0]!.children[0]!.style).toEqual({
    base: { textSize: "display", typeface: "heading", fontSize: "6vw", fontWeight: 800 },
    tablet: { fontSize: "5vw", fontWeight: 700 },
    phone: { fontSize: "32px" },
  });
  await device(page, "Phone").click();
  await expect.poll(async () => (await typeOf(block(page, "h"))).size).toBe(32);
  expect((await typeOf(block(page, "h"))).weight).toBe("800");

  // Published, in a tablet's window, the size the canvas drew; in a
  // phone's, the phone's own; in a wide one, the desktop's 6 vw.
  expect((await request.post(`${cms()}/api/pages/${id}/publish`, { data: {} })).status()).toBe(200);
  const visitor = await page.context().newPage();
  const heading = visitor.locator('[data-block-id="h"]');
  await visitor.setViewportSize({ width: 768, height: 1024 });
  await visitor.goto(`${cms()}/${slug}`);
  await expect(visitor.locator(".site")).toHaveCSS("width", "768px");
  expect(await typeOf(heading)).toMatchObject({ size: tablet.size, weight: "700" });
  await visitor.setViewportSize({ width: 390, height: 844 });
  await expect.poll(async () => (await typeOf(heading)).size).toBe(32);
  expect((await typeOf(heading)).weight).toBe("800");
  await visitor.setViewportSize({ width: 1440, height: 900 });
  await expect.poll(async () => (await typeOf(heading)).size).toBeCloseTo(86.4, 1);
  await visitor.close();
});

test("a value refused is marked on its field, changes nothing, and is kept once put right", async ({ page, request }) => {
  const { id } = await makePage(request, "Refused type", hero());
  await open(page, id);
  await block(page, "h").click();
  const sidebar = settings(page);
  await sidebar.getByRole("tab", { name: "Block" }).click();
  await openGroup(page, "Type");
  const before = await typeOf(block(page, "h"));
  const size = sidebar.getByRole("textbox", { name: "Size" });
  await typeIn(size, "400");
  await expect(size).toHaveAttribute("aria-invalid", "true");
  await expect(size).toHaveAccessibleDescription(/From 8 to 320 px\./);
  await expect(sidebar.getByText("From 8 to 320 px.")).toBeVisible();
  expect((await typeOf(block(page, "h"))).size).toBe(before.size);
  await expect(block(page, "h")).not.toHaveAttribute("data-font-size", /./);
  await typeIn(size, "40");
  await expect(size).not.toHaveAttribute("aria-invalid", "true");
  await expect.poll(async () => (await typeOf(block(page, "h"))).size).toBe(40);
  await saved(page);
  expect((await draftOf(request, id)).document.sections[0]!.children[0]!.children[0]!.style).toEqual({ base: { textSize: "display", fontSize: "40px" } });
});
