// What a drawer may hide (WCAG 2.2, 2.4.11, Focus Not Obscured), in Chromium,
// on a page whose first column is the one a drawer would cover: a section of
// four columns, whose first is 204 wide and begins at the page's left margin.
// The Outline and History stand beside the page, so a block chosen in them or
// focused by a command is in view whole with its clamp; Insert floats over the
// page's left, so a block it covers wholly gives it way, and one it covers in
// part has its clamp on its other side. Esc in the Outline, after another
// block was chosen there, keeps that choice.
import type { Page } from "@playwright/test";
import { block, clampFaults, clampKeysCovered, clampPlace, visibleShare } from "./helpers/canvas.ts";
import { column, drawer, expect, heading, makePage, open, outlineRow, section, test, widget } from "./helpers/site.ts";

const four = () => [
  section("s", "Four", [1, 2, 3, 4].map((n) => column(`k${n}`, [heading(`h${n}`, `Head ${n}`), widget(`q${n}`, "quote", { text: `Quote ${n}` }), widget(`b${n}`, "button", { label: `Go ${n}`, href: "#" })]))),
];
// Three columns: the first is partly under Insert, not wholly.
const three = () => [
  section("s", "Three", [1, 2, 3].map((n) => column(`k${n}`, [heading(`h${n}`, `Head ${n}`), widget(`q${n}`, "quote", { text: `Quote ${n}` })]))),
];

const WINDOWS = [{ width: 1440, height: 900 }, { width: 1280, height: 800 }] as const;

// A block in view whole, and its clamp with it.
async function expectSeenWhole(page: Page, id: string, why: string) {
  await expect(block(page, id), why).toBeFocused();
  expect(await visibleShare(block(page, id)), `${why}: the block`).toBeGreaterThanOrEqual(0.95);
  expect(await clampKeysCovered(page), `${why}: the clamp's keys under something`).toEqual([]);
  expect(await clampFaults(page), `${why}: the clamp`).toEqual([]);
}

for (const size of WINDOWS) {
  test.describe(`in a ${size.width} by ${size.height} window`, () => {
    test.use({ viewport: size });

    for (const name of ["Outline", "History"] as const) {
      test(`with the ${name} open, a first-column block that a command focuses is in view whole with its clamp`, async ({ page, request }) => {
        const { id } = await makePage(request, `${name} beside ${size.width}`, four());
        await open(page, id);
        await block(page, "q1").click();
        await drawer(page, name);
        // The page stands beside the drawer, none of it under it.
        const box = (await page.getByRole("complementary", { name, exact: true }).boundingBox())!;
        expect((await page.locator(".canvas .frame").boundingBox())!.x).toBeGreaterThanOrEqual(box.x + box.width);
        expect(await visibleShare(block(page, "q1"))).toBeGreaterThanOrEqual(0.95);

        // The arrows on the canvas.
        await block(page, "b1").focus();
        await page.keyboard.press("ArrowUp");
        await expectSeenWhole(page, "q1", `${name}, ArrowUp`);

        // Deleted, and the top bar's Undo brings it back and focuses it.
        await page.keyboard.press("Delete");
        await expect(block(page, "q1")).toHaveCount(0);
        await page.locator(".topbar").getByRole("button", { name: "Undo" }).click();
        await expectSeenWhole(page, "q1", `${name}, the top bar's Undo`);
      });
    }

    test("the Outline's own row, chosen and then Enter, puts the focus on a block in view whole", async ({ page, request }) => {
      const { id } = await makePage(request, `Outline row ${size.width}`, four());
      await open(page, id);
      // The Outline opens the rows down to the selection: the first column's.
      await block(page, "b1").click();
      await (await outlineRow(page, "Heading: Head 1")).click();
      await page.keyboard.press("Enter");
      await expectSeenWhole(page, "h1", "Enter on the Outline's row");
    });
  });
}

test.describe("Insert, which floats over the page's left", () => {
  for (const size of WINDOWS) {
    test.describe(`in a ${size.width} by ${size.height} window`, () => {
      test.use({ viewport: size });

      test("a new block it covers wholly makes it give way: the block is focused and in view, with its clamp", async ({ page, request }) => {
        const { id } = await makePage(request, `Insert gives way ${size.width}`, four());
        await open(page, id);
        await block(page, "h1").click();
        const insert = await drawer(page, "Insert");
        // The measure tells covered from seen: the first column is wholly under it.
        expect(await visibleShare(block(page, "q1"))).toBeLessThan(0.05);
        const tile = insert.getByRole("group", { name: "Basic" }).getByRole("button", { name: "Divider" });
        await tile.focus();
        await page.keyboard.press("Enter");

        const added = page.locator('.canvas [data-block-id="k1"] > [data-block-type="divider"]');
        await expect(added).toHaveCount(1);
        await expect(added).toBeFocused();
        await expect(page.locator(".drawer")).toHaveCount(0);
        await expect(page.locator(".notice")).toContainText("Insert closed: it was covering the block.");
        expect(await visibleShare(added)).toBeGreaterThanOrEqual(0.9);
        expect(await clampKeysCovered(page)).toEqual([]);
        expect(await clampFaults(page)).toEqual([]);
        expect(await clampPlace(page)).toMatchObject({ side: "left" });
      });

      test("Tab from Insert onto a block it covers wholly: Insert gives way, and Tab reaches its clamp in view", async ({ page, request }) => {
        const { id } = await makePage(request, `Tab out of Insert ${size.width}`, four());
        await open(page, id);
        await block(page, "q1").click();
        await drawer(page, "Insert");
        expect(await visibleShare(block(page, "q1"))).toBeLessThan(0.05);
        // The canvas is one Tab stop, the selected block, which comes after
        // the drawer's last key.
        await page.locator(".drawer button").last().focus();
        await page.keyboard.press("Tab");
        await expect(block(page, "q1")).toBeFocused();
        await expect(page.locator(".drawer")).toHaveCount(0);
        await page.keyboard.press("Tab");
        await expect(page.getByRole("button", { name: "Quote: block menu" })).toBeFocused();
        expect(await clampKeysCovered(page)).toEqual([]);
        expect(await visibleShare(page.getByRole("button", { name: "Quote: block menu" }))).toBeGreaterThanOrEqual(0.95);
      });

      test("a block it covers in part stays under it, its clamp on the other side and in view", async ({ page, request }) => {
        const { id } = await makePage(request, `Insert covers in part ${size.width}`, three());
        await open(page, id);
        await block(page, "h2").click();
        await drawer(page, "Insert");
        await block(page, "q1").focus();
        await expect(block(page, "q1")).toBeFocused();
        // Part of it is under the drawer; the drawer stays.
        const share = await visibleShare(block(page, "q1"));
        expect(share).toBeGreaterThan(0.1);
        expect(share).toBeLessThan(0.95);
        await expect(page.locator(".drawer")).toHaveCount(1);
        expect(await clampPlace(page)).toMatchObject({ side: "right" });
        expect(await clampKeysCovered(page)).toEqual([]);
        expect(await clampFaults(page)).toEqual([]);
      });
    });
  }
});

test.describe("Esc in the Outline", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("after another block was chosen there keeps the choice: the focus goes to the block chosen, not the one the Outline was opened from", async ({ page, request }) => {
    const { id } = await makePage(request, "Outline keeps the choice", three());
    await open(page, id);
    await block(page, "q1").click();
    // From the keyboard, as a keyboard user opens it.
    await page.keyboard.press("Alt+Shift+O");
    const row = page.getByRole("treeitem", { name: "Quote: Quote 1" });
    await expect(row).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(page.getByRole("treeitem", { name: "Column 2" })).toBeFocused();
    await expect(block(page, "k2")).toHaveAttribute("data-editor-selected", "true");
    await page.keyboard.press("Escape");
    await expect(page.locator(".drawer")).toHaveCount(0);
    await expect(block(page, "k2")).toBeFocused();
    await expect(block(page, "k2")).toHaveAttribute("data-editor-selected", "true");
    await expect(block(page, "q1")).not.toHaveAttribute("data-editor-selected", "true");

    // Nothing chosen but the block it was opened from: back to where it was.
    await block(page, "q3").click();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "Quote: block menu" })).toBeFocused();
    await page.keyboard.press("Alt+Shift+O");
    await expect(page.getByRole("treeitem", { name: "Quote: Quote 3" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: "Quote: block menu" })).toBeFocused();

    // The top bar's own key: the choice made in the drawer holds as well.
    await page.locator(".topbar").getByRole("button", { name: "Outline", exact: true }).click();
    await (await outlineRow(page, "Heading: Head 3")).click();
    await page.getByRole("button", { name: "Close Outline" }).click();
    await expect(block(page, "h3")).toHaveAttribute("data-editor-selected", "true");
  });
});
