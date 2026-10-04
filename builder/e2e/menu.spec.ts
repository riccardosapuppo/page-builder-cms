// The block's menu in Chromium (design/shots-extra/context.png): a right
// click on a block of the canvas, or the menu key on the focused one,
// opens copy, paste, duplicate and delete with their keys; each does what
// its key does, and the CMS keeps it; Escape closes the menu with the
// focus back on the block. Copy writes the system clipboard, so the
// keyboard's paste takes what the menu copied; where the browser will not
// let the page read the clipboard, the menu's Paste takes the block this
// tab copied last.
import { block, childIds } from "./helpers/canvas.ts";
import { column, draftOf, drawer, expect, heading, makePage, open, saved, section, test, widget } from "./helpers/site.ts";

test.use({ viewport: { width: 1440, height: 900 } });

const fixture = () => [
  section("s1", "First", [
    column("c1", [heading("a", "Alpha"), widget("b", "quote", { text: "Bravo" })]),
    column("c2", [widget("d", "divider", {})]),
  ]),
];

test("a right click opens the block's menu, whose items copy, paste, duplicate and delete", async ({ page, request, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const { id } = await makePage(request, "Menu", fixture());
  await open(page, id);

  await block(page, "b").click({ button: "right" });
  const menu = page.getByRole("menu", { name: "Quote actions" });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("menuitem")).toHaveText(["CopyCtrlC", "PasteCtrlV", "DuplicateCtrlD", "DeleteDel"]);
  await expect(menu.getByRole("menuitem").first()).toBeFocused();
  // Its ring shows, opened by the mouse too (design/shots-extra/
  // context.png), and goes with the focus.
  await expect(menu.getByRole("menuitem").first()).toHaveCSS("outline-style", "solid");
  await expect(menu.getByRole("menuitem").first()).toHaveCSS("outline-width", "2px");
  await page.keyboard.press("ArrowDown");
  await expect(menu.getByRole("menuitem").first()).toHaveCSS("outline-style", "none");
  await page.keyboard.press("ArrowUp");
  await expect(menu.getByRole("menuitem").first()).toBeFocused();
  await expect(block(page, "b")).toHaveAttribute("data-editor-selected", "true");

  await menu.getByRole("menuitem", { name: /^Copy/ }).click();
  await expect(menu).toHaveCount(0);
  await expect(page.locator(".notice")).toHaveText(/Copied Quote\./);
  // The system clipboard holds the block: the keyboard's paste takes it.
  await block(page, "d").click();
  await page.keyboard.press("Control+v");
  await expect.poll(() => childIds(page, "c2")).toHaveLength(2);

  await block(page, "a").click({ button: "right" });
  await page.getByRole("menu", { name: "Heading actions" }).getByRole("menuitem", { name: /^Paste/ }).click();
  await expect.poll(() => childIds(page, "c1")).toHaveLength(3);
  const pasted = page.locator('.canvas [data-block-id="c1"] > [data-block-id]').nth(1);
  await expect(pasted).toHaveAttribute("data-block-type", "quote");
  await expect(pasted).toBeFocused();
  const pastedId = (await pasted.getAttribute("data-block-id"))!;

  await block(page, "d").click({ button: "right" });
  await page.getByRole("menu", { name: "Divider actions" }).getByRole("menuitem", { name: /^Duplicate/ }).click();
  await expect.poll(() => childIds(page, "c2")).toHaveLength(3);

  await block(page, "a").click({ button: "right" });
  await page.getByRole("menu", { name: "Heading actions" }).getByRole("menuitem", { name: /^Delete/ }).click();
  await expect(block(page, "a")).toHaveCount(0);
  // The block now in its place.
  await expect(block(page, pastedId)).toBeFocused();

  await saved(page);
  const draft = await draftOf(request, id);
  expect(draft.document.sections[0]!.children.map((c) => c.children.map((w) => w.type))).toEqual([["quote", "quote"], ["divider", "divider", "quote"]]);
});

test("refused the system clipboard, the menu's Paste takes the block this tab copied", async ({ page, request }) => {
  // No clipboard permission: the browser will not let the page read it.
  const { id } = await makePage(request, "Menu without clipboard", fixture());
  await open(page, id);
  const refused = await page.evaluate(() => Promise.race([
    navigator.clipboard.readText().then(() => "read", () => "refused"),
    new Promise<string>((resolve) => setTimeout(() => resolve("no answer"), 3000)),
  ]));
  expect(refused).toBe("refused");

  await block(page, "b").click({ button: "right" });
  await page.getByRole("menu", { name: "Quote actions" }).getByRole("menuitem", { name: /^Copy/ }).click();
  await expect(page.locator(".notice")).toHaveText(/Copied Quote\./);
  await block(page, "d").click({ button: "right" });
  await page.getByRole("menu", { name: "Divider actions" }).getByRole("menuitem", { name: /^Paste/ }).click();
  await expect.poll(() => childIds(page, "c2")).toHaveLength(2);
  const pasted = page.locator('.canvas [data-block-id="c2"] > [data-block-id]').nth(1);
  await expect(pasted).toHaveAttribute("data-block-type", "quote");
  await expect(pasted).toBeFocused();
  await saved(page);
  expect((await draftOf(request, id)).document.sections[0]!.children[1]!.children.map((w) => w.type)).toEqual(["divider", "quote"]);
});

test("the menu key opens the menu on the focused block; Escape closes it, the focus back on the block", { tag: "@a11y" }, async ({ page, request }) => {
  const { id } = await makePage(request, "Menu keys", fixture());
  await open(page, id);
  await block(page, "a").click();
  await page.keyboard.press("Shift+F10");
  const menu = page.getByRole("menu", { name: "Heading actions" });
  await expect(menu.getByRole("menuitem").first()).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(menu.getByRole("menuitem", { name: /^Paste/ })).toBeFocused();
  await page.keyboard.press("End");
  await expect(menu.getByRole("menuitem", { name: /^Delete/ })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await expect(block(page, "a")).toBeFocused();
  // The menu key on a row of the outline opens it too.
  await drawer(page, "Outline");
  await page.getByRole("treeitem", { name: "First" }).focus();
  await page.keyboard.press("Shift+F10");
  await expect(page.getByRole("menu", { name: "First actions" })).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.locator(".notice")).toHaveText(/Copied First\./);
});
