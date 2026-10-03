// A tablet's and a phone's own values, in Chromium against the run's CMS:
// set in the Style tab with the canvas previewing that device, each shown
// on the canvas through the page's own container queries, and the same on
// the page the CMS serves at that width; the way back to the desktop takes
// the device's key out of the draft the CMS holds, with the focus back on
// the setting; and a block hidden on a phone leaves the phone's canvas and
// the phone's page alone.
import { readFileSync } from "node:fs";
import type { Locator, Page } from "@playwright/test";
import { tokensFile } from "../build/paths.ts";
import { block } from "./helpers/canvas.ts";
import { cms, column, draftOf, expect, heading, makePage, open, saved, section, test, widget } from "./helpers/site.ts";

test.use({ viewport: { width: 1440, height: 900 } });

const space = (JSON.parse(readFileSync(tokensFile, "utf8")) as { space: { site: Record<string, number> } }).space.site;
const px = (step: string) => `${space[step]}px`;

// Hero's column: S inside on every device, until a device has its own.
const fixture = () => [
  section("s", "Hero", [
    { ...column("c", [heading("a", "Alpha"), widget("b", "quote", { text: "Bravo" })]), style: { base: { spaceInside: "s" } } },
    column("c2", [widget("d", "divider", {})]),
  ]),
];

const padding = (target: Locator) => target.evaluate((element) => getComputedStyle(element).paddingTop);
const field = (page: Page, label: string) => page.locator(".tray-left .field").filter({ has: page.locator(".label", { hasText: new RegExp(`^${label}$`) }) });
const device = (page: Page, name: "Desktop" | "Tablet" | "Phone") => page.locator(".topbar").getByRole("button", { name, exact: true }).click();

// The column's padding on the page the CMS serves the draft as, in a
// window of that width: the published page's own container queries.
async function served(page: Page, id: number, width: number): Promise<string> {
  const tab = await page.context().newPage();
  await tab.setViewportSize({ width, height: 900 });
  await tab.goto(`${cms()}/preview/${id}`);
  const value = await padding(tab.locator('[data-block-id="c"]'));
  await tab.close();
  return value;
}

test("a tablet's and a phone's own space, set in the Style tab, is what the canvas and the served page show at each width", { tag: "@a11y" }, async ({ page, request }) => {
  const { id } = await makePage(request, "Devices", fixture());
  await open(page, id);
  // The column, from its heading: Alt+Up.
  await block(page, "a").click();
  await page.keyboard.press("Alt+ArrowUp");
  await expect(block(page, "c")).toHaveAttribute("data-editor-selected", "true");
  await page.getByRole("tab", { name: "Style" }).click();

  // The tablet: the desktop's S, until changed here, to L.
  await device(page, "Tablet");
  await expect(page.locator(".device-note")).toHaveText("Editing for tablet. Changes you make now apply to tablets only.");
  const spaceInside = field(page, "Space inside");
  await expect(spaceInside.locator(".scope")).toHaveText("From desktop");
  await expect(block(page, "c")).toHaveCSS("padding-top", px("s"));
  const ruler = spaceInside.getByRole("slider");
  await ruler.focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await expect(ruler).toHaveAttribute("aria-valuetext", "L");
  await expect(spaceInside.locator(".scope")).toHaveText("Tablet only");
  await expect(spaceInside.locator(".override p")).toHaveText("Tablet override: L on all four sides. Desktop and phone use S, marked with a ring.");
  await expect(spaceInside.locator(".ruler-ghost")).toHaveAttribute("data-step", "s");
  // The canvas, 768 wide, takes the tablet's L through the page's container
  // query; the dimension line says it is the tablet's own.
  await expect(block(page, "c")).toHaveCSS("padding-top", px("l"));
  await expect(page.locator('.canvas [data-block-id="c"] > .ov-pad')).toHaveText("L");
  await expect(page.locator('.canvas [data-block-id="c"] > .ov-pad')).toHaveAttribute("data-device", "tablet");
  // The navigator flags the column.
  await expect(page.locator('.tree [data-row-id="c"] > .t-row > .t-flags')).toHaveAttribute("title", "Has a tablet override");

  // The phone: never the tablet's L, the desktop's S; then its own XS.
  await device(page, "Phone");
  await expect(spaceInside.locator(".scope")).toHaveText("From desktop");
  await expect(ruler).toHaveAttribute("aria-valuetext", "S");
  await expect(block(page, "c")).toHaveCSS("padding-top", px("s"));
  await ruler.focus();
  await page.keyboard.press("ArrowLeft");
  await expect(spaceInside.locator(".scope")).toHaveText("Phone only");
  await expect(block(page, "c")).toHaveCSS("padding-top", px("xs"));
  await expect(spaceInside.locator(".override p")).toHaveText("Phone override: XS on all four sides. Desktop uses S, marked with a ring; tablets have their own, L.");

  // The desktop still S, and says what the devices have.
  await device(page, "Desktop");
  await expect(block(page, "c")).toHaveCSS("padding-top", px("s"));
  await expect(spaceInside.locator(".hint")).toHaveText("Tablets have their own: L. Phones have their own: XS.");

  // The CMS keeps exactly the three values, and serves them at each width
  // as the canvas showed them.
  const stored = async () => JSON.stringify(((await draftOf(request, id)).document.sections[0]!.children[0] as unknown as { style: unknown }).style);
  await expect.poll(stored).toBe(JSON.stringify({ base: { spaceInside: "s" }, tablet: { spaceInside: "l" }, phone: { spaceInside: "xs" } }));
  await saved(page);
  expect([await served(page, id, 1280), await served(page, id, 768), await served(page, id, 390)]).toEqual([px("s"), px("l"), px("xs")]);

  // Back to the desktop on the tablet: the key taken out, the focus on the
  // ruler, which now shows the desktop's S.
  await device(page, "Tablet");
  await spaceInside.getByRole("button", { name: "Remove the tablet override of Space inside" }).click();
  await expect(ruler).toBeFocused();
  await expect(ruler).toHaveAttribute("aria-valuetext", "S");
  await expect(spaceInside.locator(".scope")).toHaveText("From desktop");
  await expect(block(page, "c")).toHaveCSS("padding-top", px("s"));
  await expect(page.locator('.tree [data-row-id="c"] > .t-row > .t-flags')).toHaveAttribute("title", "Has a phone override");
  // No tablet key, and no tablet part left empty: absent, as "from the
  // desktop" is stored (the bytes compared, so an empty part would show).
  await expect.poll(stored).toBe(JSON.stringify({ base: { spaceInside: "s" }, phone: { spaceInside: "xs" } }));
  expect(await served(page, id, 768)).toBe(px("s"));

  // Undone from the keyboard: the tablet's L is back, and the focus on the
  // block the undo touched; redone, gone again.
  await page.keyboard.press("Control+z");
  await expect(block(page, "c")).toHaveCSS("padding-top", px("l"));
  await expect(block(page, "c")).toBeFocused();
  await expect.poll(stored).toBe(JSON.stringify({ base: { spaceInside: "s" }, tablet: { spaceInside: "l" }, phone: { spaceInside: "xs" } }));
  await page.keyboard.press("Control+y");
  await expect(block(page, "c")).toHaveCSS("padding-top", px("s"));
  await expect.poll(stored).toBe(JSON.stringify({ base: { spaceInside: "s" }, phone: { spaceInside: "xs" } }));
});

test("a block hidden on phones leaves the phone's canvas and the phone's page, and stays on the tablet's", { tag: "@a11y" }, async ({ page, request }) => {
  const { id } = await makePage(request, "Hidden on phones", fixture());
  await open(page, id);
  await block(page, "b").click();
  await page.getByRole("tab", { name: "Advanced" }).click();
  await device(page, "Phone");
  const hide = page.getByRole("switch", { name: "Hide on phone" });
  await hide.focus();
  await page.keyboard.press("Space");
  // The switch keeps the focus; the block leaves the phone's canvas, and
  // the tab says where it went.
  await expect(hide).toBeChecked();
  await expect(hide).toBeFocused();
  await expect(block(page, "b")).toBeHidden();
  await expect(page.locator(".tray-left .device-note")).toHaveText("Hidden on phones: the canvas leaves it out while you preview a phone, as a visitor’s phone does.");
  const row = page.locator('.tree [data-row-id="b"]');
  await expect(row).toHaveClass(/t-hidden/);
  await expect(row.locator(":scope > .t-row > .t-flags")).toHaveAttribute("title", "Has a phone override");
  await device(page, "Tablet");
  await expect(block(page, "b")).toBeVisible();
  await expect.poll(async () => JSON.stringify((await draftOf(request, id)).document.sections[0]!.children[0]!.children[1])).toContain('"phone":{"visibility":"hidden"}');
  const tab = await page.context().newPage();
  for (const [width, shown] of [[390, false], [768, true]] as const) {
    await tab.setViewportSize({ width, height: 900 });
    await tab.goto(`${cms()}/preview/${id}`);
    await expect(tab.getByText("Bravo")).toHaveCount(1);
    if (shown) await expect(tab.getByText("Bravo")).toBeVisible();
    else await expect(tab.getByText("Bravo")).toBeHidden();
  }
  await tab.close();
});
