// The whole path by the keyboard alone, in Chromium, against the run's
// CMS: no click, no pointer, only keys (and the system's file chooser,
// which the upload button opens). From the editor's page: Tab to the
// canvas and select a heading; open Insert with its chord, and add a
// divider after the heading with Enter; pick the divider up with Space and
// move it with the arrows; add a button after the quote from the page,
// with the "+" key and its picker, and move it up from its clamp; edit
// the heading's text and level in its Text group in the sidebar; write in
// a text block on the canvas and make a word bold; look
// at a tablet from the bottom line's devices, open a closed group of the
// column's with Enter, and give the column a tablet's own space in its
// Spacing group; follow the selection's path in the
// bottom line and the Outline; upload an image in the media library from
// Insert, give it its alt text and place it; undo and redo the placing;
// keep a named version; publish with the shortcut; open the live page from
// the Publish menu; and the page the CMS serves, at a desktop's width and
// at a tablet's, holds every change. At each step the focus is where the
// step leaves it.
import type { FileChooser, Locator, Page } from "@playwright/test";
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

// The system's file chooser, watched from the moment the test starts.
// Playwright turns its interception on when the first listener is added,
// without waiting for the browser to take it: a listener added just
// before the key that opens the chooser can come after the key, and the
// chooser then never arrives. Each call takes the next chooser, failing
// after `within` rather than at the test's own timeout.
function fileChoosers(page: Page): (within?: number) => Promise<FileChooser> {
  const arrived: FileChooser[] = [];
  const waiting: Array<(chooser: FileChooser) => void> = [];
  page.on("filechooser", (chooser) => {
    const next = waiting.shift();
    if (next) next(chooser);
    else arrived.push(chooser);
  });
  return (within = 15_000) => {
    const ready = arrived.shift();
    if (ready) return Promise.resolve(ready);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`no file chooser opened within ${within} ms`)), within);
      waiting.push((chooser) => {
        clearTimeout(timer);
        resolve(chooser);
      });
    });
  };
}

const focusedBlock = (page: Page) => page.evaluate(() => (document.activeElement as HTMLElement | null)?.dataset.blockId ?? null);

// The next frame. The editor puts the focus where a command leaves it in
// the frame after the command (afterRender, src/editor/act.ts), and a
// frame asked for after the command comes after that one.
const drawn = (page: Page) => page.evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => done())));
const order = (page: Page) => page.locator('.canvas [data-block-id="c"] > [data-block-id]').evaluateAll((e) => e.map((x) => (x as HTMLElement).dataset.blockType));

test("insert from Insert and from the page's +, move, write, style a tablet, upload an image, undo, keep a version, publish and open the live page, by the keyboard alone", { tag: "@a11y" }, async ({ page, request }) => {
  test.setTimeout(180_000);
  const notes = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Tide notes" }] }] };
  const { id, slug } = await makePage(request, "By keys", [section("s", "Story", [column("c", [heading("a", "Alpha"), widget("t", "text", { doc: notes }), widget("b", "quote", { text: "Bravo" })])])]);
  const nextChooser = fileChoosers(page);
  await page.goto(`/?page=${id}`);
  await expect(page.getByRole("button", { name: /^Switch page\. Open:/ })).toBeVisible();

  // The canvas's tab stop is its first section; Alt+Down goes inside it.
  await tabTo(page, page.locator('.canvas [data-block-id="s"]'));
  await page.keyboard.press("Alt+ArrowDown");
  await page.keyboard.press("Alt+ArrowDown");
  await expect.poll(() => focusedBlock(page)).toBe("a");
  await expect(block(page, "a")).toHaveAttribute("data-editor-selected", "true");

  // Insert, by its chord: its search takes the focus; Tab on to the
  // Divider key; Enter adds it after the selection.
  await page.keyboard.press("Alt+Shift+N");
  const insert = page.getByRole("complementary", { name: "Insert" });
  await expect(insert.getByRole("searchbox", { name: "Search blocks and sections" })).toBeFocused();
  await expect(insert.locator(".drawer-where")).toHaveText("Click to add after Heading in Column 1 of Story, or drag to any column.");
  await tabTo(page, insert.getByRole("group", { name: "Basic" }).getByRole("button", { name: "Divider" }));
  await page.keyboard.press("Enter");
  const added = page.locator('.canvas [data-block-id="c"] > [data-block-type="divider"]');
  await expect(added).toHaveCount(1);
  const divider = (await added.getAttribute("data-block-id"))!;
  // Inserted after the selection, and the focus on it.
  await expect.poll(() => focusedBlock(page)).toBe(divider);
  await expect.poll(() => order(page)).toEqual(["heading", "divider", "text", "quote"]);
  // The chord again, from the page, closes Insert; the focus stays.
  await page.keyboard.press("Alt+Shift+N");
  await expect(insert).toHaveCount(0);
  await expect.poll(() => focusedBlock(page)).toBe(divider);

  // Move it: Space picks it up, Down twice moves it past the text and the
  // quote, Space drops.
  await page.keyboard.press("Space");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await expect(page.locator(".live-caption strong")).toHaveText("Divider will move to Column 1 in Story, after Quote.");
  await page.keyboard.press("Space");
  await expect.poll(() => order(page)).toEqual(["heading", "text", "quote", "divider"]);
  await expect.poll(() => focusedBlock(page)).toBe(divider);

  // Add on the page: Up to the quote; the "+" key opens the picker after
  // it, its search taking the focus; typed words narrow it to Button, and
  // Enter adds one after the quote, the focus on the new block.
  await page.keyboard.press("ArrowUp");
  await expect.poll(() => focusedBlock(page)).toBe("b");
  await page.keyboard.press("+");
  const picker = page.getByRole("dialog", { name: "Add a block after Quote" });
  await expect(picker.getByRole("searchbox", { name: "Search blocks" })).toBeFocused();
  await page.keyboard.type("butt");
  await expect(picker.getByRole("group").getByRole("button")).toHaveText(["Button"]);
  await page.keyboard.press("Enter");
  await expect(picker).toHaveCount(0);
  const addedButton = page.locator('.canvas [data-block-id="c"] > [data-block-type="button"]');
  await expect(addedButton).toHaveCount(1);
  const button = (await addedButton.getAttribute("data-block-id"))!;
  await expect.poll(() => focusedBlock(page)).toBe(button);
  await expect.poll(() => order(page)).toEqual(["heading", "text", "quote", "button", "divider"]);

  // Move it from its clamp: Tab goes to the clamp's head, Down along it to
  // Move up, Enter moves the button above the quote with the focus kept on
  // the key, and Esc goes back to the block.
  const tools = page.getByRole("toolbar", { name: "Button tools" });
  await page.keyboard.press("Tab");
  await expect(tools.getByRole("button", { name: "Button: block menu" })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  const moveUp = tools.getByRole("button", { name: "Move up" });
  await expect(moveUp).toBeFocused();
  await page.keyboard.press("Enter");
  await expect.poll(() => order(page)).toEqual(["heading", "text", "button", "quote", "divider"]);
  // The key has the focus before the move too, so the check below could
  // pass before the frame in which the move gives the key the focus, and
  // an Esc pressed before that frame would be undone by it.
  await drawn(page);
  await expect(moveUp).toBeFocused();
  await page.keyboard.press("Escape");
  await expect.poll(() => focusedBlock(page)).toBe(button);

  // Edit the heading: Up to it, then on to the sidebar, its Text and
  // Level in its Text group.
  for (let n = 0; n < 2; n += 1) await page.keyboard.press("ArrowUp");
  await expect.poll(() => focusedBlock(page)).toBe("a");
  const text = page.getByRole("complementary", { name: "Settings" }).getByRole("textbox", { name: "Text" });
  await tabTo(page, text);
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
  await tabTo(page, block(page, "a"), { back: true });
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
  await expect(page.getByRole("toolbar", { name: "Text formatting" }).getByRole("button", { name: "Bold" })).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("End");
  await page.keyboard.press("Escape");
  await expect(rte).toHaveCount(0);
  await expect.poll(() => focusedBlock(page)).toBe("t");
  await expect(block(page, "t").locator("strong")).toHaveText("swimmers");
  await expect(block(page, "t").locator("p")).toHaveText("Tide notes for swimmers");

  // A tablet's own space inside the column: Alt+Up to the column, on past
  // the sidebar to the bottom line's devices, the arrow to Tablet; back to
  // the column's Alignment group, closed, which Enter opens, and up to its
  // Spacing group's ruler.
  await page.keyboard.press("Alt+ArrowUp");
  await expect.poll(() => focusedBlock(page)).toBe("c");
  const crumbs = page.getByRole("navigation", { name: "Selection" }).getByRole("button");
  await expect(crumbs).toHaveText(["Page", "Story", "Column 1"]);
  const devices = page.getByRole("radiogroup", { name: "Look at the page on" });
  await tabTo(page, devices.getByRole("radio", { name: /^Desktop/ }));
  await page.keyboard.press("ArrowRight");
  await expect(devices.getByRole("radio", { name: /^Tablet/ })).toBeFocused();
  await expect(devices.getByRole("radio", { name: /^Tablet/ })).toHaveAttribute("aria-checked", "true");
  await expect(page.locator(".statusbar .sb-width")).toHaveText("Page 768 wide, tablet layout");
  const sidebar = page.getByRole("complementary", { name: "Settings" });
  const alignment = sidebar.getByRole("button", { name: "Alignment", exact: true });
  await tabTo(page, alignment, { back: true });
  await expect(alignment).toHaveAttribute("aria-expanded", "false");
  await page.keyboard.press("Enter");
  await expect(alignment).toHaveAttribute("aria-expanded", "true");
  await expect(alignment).toBeFocused();
  await expect(sidebar.getByRole("radiogroup", { name: "Horizontal alignment" })).toBeVisible();
  await expect(page.locator(".device-note")).toHaveText("Editing for tablet. Changes to its look apply to tablets only.");
  const spaceInside = page.locator(".sidebar .field").filter({ has: page.locator(".label", { hasText: /^Space inside$/ }) });
  const ruler = spaceInside.getByRole("slider");
  await tabTo(page, ruler, { back: true });
  await expect(ruler).toHaveAttribute("aria-valuetext", "None, the theme’s default");
  for (let n = 0; n < 3; n += 1) await page.keyboard.press("ArrowRight");
  await expect(ruler).toHaveAttribute("aria-valuetext", "M");
  await expect(ruler).toBeFocused();
  await expect(spaceInside.locator(".scope")).toHaveText("Tablet only");
  await expect(block(page, "c")).toHaveCSS("padding-top", "16px");
  // Back to the desktop, by its chord, where the column has none; the
  // focus stays on the ruler.
  await page.keyboard.press("Alt+Shift+1");
  await expect(devices.getByRole("radio", { name: /^Desktop/ })).toHaveAttribute("aria-checked", "true");
  await expect(block(page, "c")).toHaveCSS("padding-top", "0px");
  await expect(ruler).toBeFocused();

  // The Outline, by its chord: on the column's row; Right opens it and
  // goes into its first widget, which the canvas selects; the chord again
  // closes it.
  await page.keyboard.press("Alt+Shift+O");
  const column1 = page.locator('.tree [data-row-id="c"]');
  await expect(column1).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await expect(page.locator('.tree [data-row-id="a"]')).toBeFocused();
  await expect(block(page, "a")).toHaveAttribute("data-editor-selected", "true");
  await page.keyboard.press("Alt+Shift+O");
  await expect(page.getByRole("complementary", { name: "Outline" })).toHaveCount(0);

  // An image after the quote: to the column's quote on the canvas, the
  // Image key in Insert, then in the media library Upload images, the file
  // chosen in the system's chooser, its alt text, Add image.
  await tabTo(page, block(page, "a"), { back: true });
  for (let n = 0; n < 3; n += 1) await page.keyboard.press("ArrowDown");
  await expect.poll(() => focusedBlock(page)).toBe("b");
  await page.keyboard.press("Alt+Shift+N");
  await tabTo(page, page.getByRole("group", { name: "Basic" }).getByRole("button", { name: "Image" }));
  await page.keyboard.press("Enter");
  const library = page.getByRole("dialog", { name: "Media library" });
  await expect(library).toBeVisible();
  const name = `${unique("by-keys")}.png`;
  await tabTo(page, library.getByRole("button", { name: "Upload images" }));
  await page.keyboard.press("Enter");
  await (await nextChooser()).setFiles({ name, mimeType: "image/png", buffer: png(600, 400, (x) => (x < 300 ? [30, 110, 90] : [230, 200, 140])) });
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
  await expect.poll(() => order(page)).toEqual(["heading", "text", "button", "quote", "image", "divider"]);

  // Undo takes the image off, redo puts the same one back, each from the
  // keyboard on the canvas.
  await page.keyboard.press("Control+z");
  await expect(image).toHaveCount(0);
  await expect.poll(() => order(page)).toEqual(["heading", "text", "button", "quote", "divider"]);
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
  await expect(page.locator(".topbar .tb-status")).toHaveText("Published");

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
  // The menu is gone, and the focus is back on the button that opened it.
  await expect(menu).toHaveCount(0);
  await expect(more).toBeFocused();
  await served.waitForURL(`${cms()}/${slug}`);
  await expect(served.getByRole("heading", { name: "Swim by the keys", level: 3 })).toBeVisible();
  expect(await served.locator('[data-block-id="c"] > [data-block-id]').evaluateAll((e) => e.map((x) => (x as HTMLElement).dataset.blockType))).toEqual(["heading", "text", "button", "quote", "image", "divider"]);
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
  // Back in the editor, the focus is where the person left it.
  await expect(more).toBeFocused();

  // The CMS's draft is what was published, and the version kept by name
  // is listed.
  const draft = await draftOf(request, id);
  const kept = draft.document.sections[0]!.children[0]! as unknown as { style: unknown; children: Array<{ type: string; props: Record<string, unknown> }> };
  expect(kept.style).toEqual({ base: {}, tablet: { spaceInside: "m" } });
  expect(kept.children.map((w) => w.type)).toEqual(["heading", "text", "button", "quote", "image", "divider"]);
  expect(kept.children[0]!.props).toEqual({ level: 3, text: "Swim by the keys" });
  expect(kept.children[1]!.props).toEqual({ doc: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Tide notes for " }, { type: "text", text: "swimmers", marks: [{ type: "bold" }] }] }] } });
  expect(kept.children[4]!.props).toMatchObject({ alt: ALT });
  expect(kept.children[4]!.props.mediaId).toEqual(expect.any(String));
  const versions = (await (await request.get(`${cms()}/api/pages/${id}/versions`)).json()) as { versions: Array<{ name: string | null; reason: string }> };
  expect(versions.versions.filter((v) => v.name === "Before the swim").map((v) => v.reason)).toEqual(["manual"]);
});
