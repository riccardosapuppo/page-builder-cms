// The whole path by the keyboard alone, in Chromium, against the run's
// CMS: no click, no pointer, only keys (and the system's file chooser,
// which the upload button opens). From the editor's page: Tab to the
// canvas and select a heading; to the widget panel, and add a divider
// after it with Enter; pick the divider up with Space and move it with the
// arrows; edit the heading's text and level in its panel; write in a text
// block on the canvas and make a word bold; give its column a tablet's own
// space in the Style tab, the canvas previewing a tablet; upload an image
// in the media library, give it its alt text and place it; undo and redo
// the placing; keep a named version; publish with the shortcut; open the
// live page from the Publish menu; and the page the CMS serves, at a
// desktop's width and at a tablet's, holds every change. At each step the
// focus is where the step leaves it.
import type { Locator, Page } from "@playwright/test";
import { block, selectedText, settledTextEditor } from "./helpers/canvas.ts";
import { png } from "./helpers/images.ts";
import { cms, column, draftOf, expect, makePage, section, test, unique, widget, heading } from "./helpers/site.ts";

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
const order = (page: Page) => page.locator('.canvas [data-block-id="c"] > [data-block-id]').evaluateAll((e) => e.map((x) => (x as HTMLElement).dataset.blockType));

test("insert, move, write, style a tablet, upload an image, undo, keep a version, publish and open the live page, by the keyboard alone", { tag: "@a11y" }, async ({ page, request }) => {
  test.setTimeout(180_000);
  const notes = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Tide notes" }] }] };
  const { id, slug } = await makePage(request, "By keys", [section("s", "Story", [column("c", [heading("a", "Alpha"), widget("t", "text", { doc: notes }), widget("b", "quote", { text: "Bravo" })])])]);
  await page.goto(`/?page=${id}`);
  await expect(page.getByRole("tree", { name: "Navigator" })).toBeVisible();

  // The canvas's tab stop is its first section; Alt+Down goes inside it.
  await tabTo(page, page.locator('.canvas [data-block-id="s"]'));
  await page.keyboard.press("Alt+ArrowDown");
  await page.keyboard.press("Alt+ArrowDown");
  await expect.poll(() => focusedBlock(page)).toBe("a");
  await expect(block(page, "a")).toHaveAttribute("data-editor-selected", "true");

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
  await expect.poll(() => order(page)).toEqual(["heading", "divider", "text", "quote"]);

  // Move it: Space picks it up, Down twice moves it past the text and the
  // quote, Space drops.
  await page.keyboard.press("Space");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await expect(page.locator(".live-caption strong")).toHaveText("Divider will move to Column 1 in Story, after Quote.");
  await page.keyboard.press("Space");
  await expect.poll(() => order(page)).toEqual(["heading", "text", "quote", "divider"]);
  await expect.poll(() => focusedBlock(page)).toBe(divider);

  // Edit the heading: Up to it, then its panel's Text and Level.
  for (let n = 0; n < 3; n += 1) await page.keyboard.press("ArrowUp");
  await expect.poll(() => focusedBlock(page)).toBe("a");
  const text = page.getByRole("textbox", { name: "Text" });
  await tabTo(page, text, { back: true });
  await page.keyboard.press("Control+a");
  await page.keyboard.type("Swim by the keys");
  await page.keyboard.press("Enter");
  await expect(block(page, "a").locator("h2")).toHaveText("Swim by the keys");
  const h2 = page.getByRole("radiogroup", { name: "Level" }).getByRole("radio", { name: "H2" });
  await tabTo(page, h2);
  await page.keyboard.press("ArrowRight");
  const h3 = page.getByRole("radiogroup", { name: "Level" }).getByRole("radio", { name: "H3" });
  await expect(h3).toBeFocused();
  await expect(h3).toHaveAttribute("aria-checked", "true");
  await expect(block(page, "a").locator("h3")).toHaveText("Swim by the keys");

  // Write in the text on the canvas: back to the selected heading, Down
  // to the text, Enter opens it with the caret at its end; the last word
  // typed is made bold (Ctrl+Shift+Left selects it, Ctrl+B); Esc leaves
  // the text, which is handed over, and the focus is on its block.
  await tabTo(page, block(page, "a"));
  await page.keyboard.press("ArrowDown");
  await expect.poll(() => focusedBlock(page)).toBe("t");
  await page.keyboard.press("Enter");
  // A person is slower than ProseMirror's first 200 ms with the focus,
  // in which it may put back a selection it did not make (helpers/canvas.ts).
  const rte = await settledTextEditor(page, "t");
  await expect(rte).toBeFocused();
  await page.keyboard.type(" for swimmers");
  await page.keyboard.press("Control+Shift+ArrowLeft");
  await expect.poll(() => selectedText(page, "t")).toBe("swimmers");
  await page.keyboard.press("Control+b");
  await expect(page.getByRole("group", { name: "Formatting" }).getByRole("button", { name: "Bold" })).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("End");
  await page.keyboard.press("Escape");
  await expect(rte).toHaveCount(0);
  await expect.poll(() => focusedBlock(page)).toBe("t");
  await expect(block(page, "t").locator("strong")).toHaveText("swimmers");
  await expect(block(page, "t").locator("p")).toHaveText("Tide notes for swimmers");

  // A tablet's own space inside the column: Alt+Up to the column, back to
  // the device switch for Tablet, on to the Style tab and its ruler.
  await page.keyboard.press("Alt+ArrowUp");
  await expect.poll(() => focusedBlock(page)).toBe("c");
  const devices = page.getByRole("group", { name: "Device" });
  await tabTo(page, devices.getByRole("button", { name: "Tablet" }), { back: true });
  await page.keyboard.press("Enter");
  await expect(devices.getByRole("button", { name: "Tablet" })).toHaveAttribute("aria-pressed", "true");
  await tabTo(page, page.getByRole("tab", { name: "Content" }));
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: "Style" })).toBeFocused();
  await expect(page.getByRole("tab", { name: "Style" })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".device-note")).toHaveText("Editing for tablet. Changes you make now apply to tablets only.");
  const spaceInside = page.locator(".tray-left .field").filter({ has: page.locator(".label", { hasText: /^Space inside$/ }) });
  const ruler = spaceInside.getByRole("slider");
  await tabTo(page, ruler);
  await expect(ruler).toHaveAttribute("aria-valuetext", "None, the theme’s default");
  for (let n = 0; n < 3; n += 1) await page.keyboard.press("ArrowRight");
  await expect(ruler).toHaveAttribute("aria-valuetext", "M");
  await expect(ruler).toBeFocused();
  await expect(spaceInside.locator(".scope")).toHaveText("Tablet only");
  await expect(block(page, "c")).toHaveCSS("padding-top", "16px");
  // Back to the desktop, where the column has none.
  await tabTo(page, devices.getByRole("button", { name: "Desktop" }), { back: true });
  await page.keyboard.press("Enter");
  await expect(devices.getByRole("button", { name: "Desktop" })).toHaveAttribute("aria-pressed", "true");
  await expect(block(page, "c")).toHaveCSS("padding-top", "0px");

  // An image after the quote: to the column's quote on the canvas, the
  // Image tile, then in the media library Upload images, the file chosen
  // in the system's chooser, its alt text, Add image.
  await tabTo(page, block(page, "c"));
  await page.keyboard.press("Alt+ArrowDown");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await expect.poll(() => focusedBlock(page)).toBe("b");
  await tabTo(page, page.getByRole("tab", { name: "Edit" }), { back: true });
  await page.keyboard.press("ArrowLeft");
  await tabTo(page, page.getByRole("group", { name: "Basic" }).getByRole("button", { name: "Image" }));
  await page.keyboard.press("Enter");
  const library = page.getByRole("dialog", { name: "Media library" });
  await expect(library).toBeVisible();
  const name = `${unique("by-keys")}.png`;
  await tabTo(page, library.getByRole("button", { name: "Upload images" }));
  const choosing = page.waitForEvent("filechooser");
  await page.keyboard.press("Enter");
  await (await choosing).setFiles({ name, mimeType: "image/png", buffer: png(600, 400, (x) => (x < 300 ? [30, 110, 90] : [230, 200, 140])) });
  await expect(library.getByRole("radio", { name: `${name}, no alt text` })).toHaveAttribute("aria-checked", "true", { timeout: 30_000 });
  const ALT = "Two swimmers by the harbour wall";
  const alt = library.getByRole("textbox", { name: /^Alt text/ });
  await tabTo(page, alt);
  await page.keyboard.type(ALT);
  await tabTo(page, library.getByRole("button", { name: "Add image" }));
  await page.keyboard.press("Enter");
  await expect(library).toHaveCount(0);
  const image = page.locator('.canvas [data-block-id="c"] > [data-block-type="image"]');
  await expect(image.getByRole("img", { name: ALT })).toBeVisible();
  const imageId = (await image.getAttribute("data-block-id"))!;
  await expect.poll(() => focusedBlock(page)).toBe(imageId);
  await expect.poll(() => order(page)).toEqual(["heading", "text", "quote", "image", "divider"]);

  // Undo takes the image off, redo puts the same one back, each from the
  // keyboard on the canvas.
  await page.keyboard.press("Control+z");
  await expect(image).toHaveCount(0);
  await expect.poll(() => order(page)).toEqual(["heading", "text", "quote", "divider"]);
  await page.keyboard.press("Control+y");
  await expect(image.getByRole("img", { name: ALT })).toBeVisible();
  await expect.poll(() => focusedBlock(page)).toBe(imageId);

  // A named version: Ctrl+S opens the history on its name field.
  await page.keyboard.press("Control+s");
  const history = page.getByRole("complementary", { name: "History" });
  const versionName = history.getByRole("textbox", { name: /^Name/ });
  await expect(versionName).toBeFocused();
  await page.keyboard.type("Before the swim");
  await page.keyboard.press("Enter");
  await expect(history.getByRole("listitem").filter({ hasText: "Before the swim" })).toBeVisible();

  // Publish, by its shortcut, from wherever the focus is.
  await page.keyboard.press("Control+Shift+Enter");
  await expect(page.locator(".topbar .chip")).toHaveText("Published");

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
  expect(await served.locator('[data-block-id="c"] > [data-block-id]').evaluateAll((e) => e.map((x) => (x as HTMLElement).dataset.blockType))).toEqual(["heading", "text", "quote", "image", "divider"]);
  await expect(served.locator('[data-block-id="t"] strong')).toHaveText("swimmers");
  const live = served.getByRole("img", { name: ALT });
  await expect(live).toBeVisible();
  expect(await live.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth)).toBe(600);
  // The column's space: none at a desktop's width, the tablet's own M at
  // a tablet's.
  await expect(served.locator('[data-block-id="c"]')).toHaveCSS("padding-top", "0px");
  await served.setViewportSize({ width: 768, height: 900 });
  await expect(served.locator('[data-block-id="c"]')).toHaveCSS("padding-top", "16px");
  await served.close();

  // The CMS's draft is what was published, and the version kept by name
  // is listed.
  const draft = await draftOf(request, id);
  const kept = draft.document.sections[0]!.children[0]! as unknown as { style: unknown; children: Array<{ type: string; props: Record<string, unknown> }> };
  expect(kept.style).toEqual({ base: {}, tablet: { spaceInside: "m" } });
  expect(kept.children.map((w) => w.type)).toEqual(["heading", "text", "quote", "image", "divider"]);
  expect(kept.children[0]!.props).toEqual({ level: 3, text: "Swim by the keys" });
  expect(kept.children[1]!.props).toEqual({ doc: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Tide notes for " }, { type: "text", text: "swimmers", marks: [{ type: "bold" }] }] }] } });
  expect(kept.children[3]!.props).toMatchObject({ alt: ALT });
  expect(kept.children[3]!.props.mediaId).toEqual(expect.any(String));
  const versions = (await (await request.get(`${cms()}/api/pages/${id}/versions`)).json()) as { versions: Array<{ name: string | null; reason: string }> };
  expect(versions.versions.filter((v) => v.name === "Before the swim").map((v) => v.reason)).toEqual(["manual"]);
});
