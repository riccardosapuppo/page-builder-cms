// The whole path by the keyboard alone, in Chromium, against the run's
// CMS: no click, no pointer. From the editor's page: Tab to the canvas and
// select a heading; to the widget panel, and add a divider after it with
// Enter; pick the divider up with Space and move it with the arrows; edit
// the heading's text and level in its panel; publish with the shortcut;
// open the live page from the Publish menu; and the page the CMS serves
// holds every change. At each step the focus is where the step leaves it.
import type { Locator, Page } from "@playwright/test";
import { cms, column, draftOf, expect, makePage, section, test, widget, heading } from "./helpers/site.ts";

test.use({ viewport: { width: 1440, height: 900 } });

// Presses Tab (or Shift+Tab) until the target has the focus, as a person
// would, and fails past `most` presses: the target is not on the way.
async function tabTo(page: Page, target: Locator, options: { back?: boolean; most?: number } = {}): Promise<number> {
  const most = options.most ?? 80;
  for (let presses = 0; presses <= most; presses += 1) {
    if (await target.evaluate((element) => element === document.activeElement).catch(() => false)) return presses;
    await page.keyboard.press(options.back ? "Shift+Tab" : "Tab");
  }
  throw new Error(`${most} presses of ${options.back ? "Shift+Tab" : "Tab"} did not reach ${target}`);
}

const focusedBlock = (page: Page) => page.evaluate(() => (document.activeElement as HTMLElement | null)?.dataset.blockId ?? null);

test("insert, move, edit, publish and open the live page, by the keyboard alone", { tag: "@a11y" }, async ({ page, request }) => {
  const { id, slug } = await makePage(request, "By keys", [section("s", "Story", [column("c", [heading("a", "Alpha"), widget("b", "quote", { text: "Bravo" })])])]);
  await page.goto(`/?page=${id}`);
  await expect(page.getByRole("tree", { name: "Navigator" })).toBeVisible();

  // The canvas's tab stop is its first section; Alt+Down goes inside it.
  await tabTo(page, page.locator('.canvas [data-block-id="s"]'));
  await page.keyboard.press("Alt+ArrowDown");
  await page.keyboard.press("Alt+ArrowDown");
  await expect.poll(() => focusedBlock(page)).toBe("a");
  await expect(page.locator('.canvas [data-block-id="a"]')).toHaveAttribute("data-editor-selected", "true");

  // The widget panel: back to the tabs, the arrow to Add, on to the tile.
  await tabTo(page, page.getByRole("tab", { name: "Edit" }), { back: true });
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByRole("tab", { name: "Add" })).toBeFocused();
  await expect(page.getByRole("tab", { name: "Add" })).toHaveAttribute("aria-selected", "true");
  await tabTo(page, page.getByRole("group", { name: "Basic" }).getByRole("button", { name: "Divider" }));
  await page.keyboard.press("Enter");
  const added = page.locator('.canvas [data-block-id="c"] > [data-block-type="divider"]');
  await expect(added).toHaveCount(1);
  const divider = (await added.getAttribute("data-block-id"))!;
  // Inserted after the selection, and the focus on it.
  await expect.poll(() => focusedBlock(page)).toBe(divider);
  await expect.poll(() => page.locator('.canvas [data-block-id="c"] > [data-block-id]').evaluateAll((e) => e.map((x) => (x as HTMLElement).dataset.blockId))).toEqual(["a", divider, "b"]);

  // Move it: Space picks it up, Down moves it past the quote, Space drops.
  await page.keyboard.press("Space");
  await page.keyboard.press("ArrowDown");
  await expect(page.locator(".live-caption strong")).toHaveText("Divider will move to Column 1 in Story, after Quote.");
  await page.keyboard.press("Space");
  await expect.poll(() => page.locator('.canvas [data-block-id="c"] > [data-block-id]').evaluateAll((e) => e.map((x) => (x as HTMLElement).dataset.blockId))).toEqual(["a", "b", divider]);
  await expect.poll(() => focusedBlock(page)).toBe(divider);

  // Edit the heading: Up to it, then its panel's Text and Level.
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("ArrowUp");
  await expect.poll(() => focusedBlock(page)).toBe("a");
  const text = page.getByRole("textbox", { name: "Text" });
  await tabTo(page, text, { back: true });
  await page.keyboard.press("Control+a");
  await page.keyboard.type("Swim by the keys");
  await page.keyboard.press("Enter");
  await expect(page.locator('.canvas [data-block-id="a"] h2')).toHaveText("Swim by the keys");
  const h2 = page.getByRole("radiogroup", { name: "Level" }).getByRole("radio", { name: "H2" });
  await tabTo(page, h2);
  await page.keyboard.press("ArrowRight");
  const h3 = page.getByRole("radiogroup", { name: "Level" }).getByRole("radio", { name: "H3" });
  await expect(h3).toBeFocused();
  await expect(h3).toHaveAttribute("aria-checked", "true");
  await expect(page.locator('.canvas [data-block-id="a"] h3')).toHaveText("Swim by the keys");

  // Publish, by its shortcut; the focus stays where it was.
  await page.keyboard.press("Control+Shift+Enter");
  await expect(page.locator(".topbar .chip")).toHaveText("Published");
  await expect(h3).toBeFocused();

  // The live page, from the Publish menu: Enter opens it, the arrows go
  // down it, Enter on the link opens the page in a tab of its own.
  const more = page.getByRole("button", { name: "More publish options" });
  await tabTo(page, more, { back: true });
  await page.keyboard.press("Enter");
  const menu = page.getByRole("menu", { name: "Publish options" });
  await expect(menu.getByRole("menuitem", { name: /Publish now/ })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  const view = menu.getByRole("menuitem", { name: /View live page/ });
  await expect(view).toBeFocused();
  const opening = page.context().waitForEvent("page");
  await page.keyboard.press("Enter");
  const served = await opening;
  await served.waitForURL(`${cms()}/${slug}`);
  await expect(served.getByRole("heading", { name: "Swim by the keys", level: 3 })).toBeVisible();
  const order = await served.locator('[data-block-id="c"] > [data-block-id]').evaluateAll((e) => e.map((x) => (x as HTMLElement).dataset.blockType));
  expect(order).toEqual(["heading", "quote", "divider"]);
  await served.close();

  // The CMS's draft is what was published.
  const draft = await draftOf(request, id);
  expect(draft.document.sections[0]!.children[0]!.children.map((w) => w.type)).toEqual(["heading", "quote", "divider"]);
  expect(draft.document.sections[0]!.children[0]!.children[0]!.props).toEqual({ level: 3, text: "Swim by the keys" });
});
