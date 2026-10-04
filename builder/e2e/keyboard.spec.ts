// Every entry of the keyboard map (src/editor/keymap.ts), pressed in
// Chromium, does what the "?" window says it does: every chord of every
// entry. The exercises are a table keyed by the map's actions, so an entry
// added without one does not compile, and the run checks it pressed them
// all. The "?" window lists the very same entries. And in a text being
// written the typing keys are the text's, but for the entries that work
// while typing.
import type { Page } from "@playwright/test";
import { entryCaps, KEYMAP, type KeyAction } from "../src/editor/keymap.ts";
import { block, caption, childIds, settledTextEditor } from "./helpers/canvas.ts";
import { cms, column, device, drawer, expect, heading, makePage, open, section, test, widget } from "./helpers/site.ts";

test.use({ viewport: { width: 1440, height: 900 } });

const fixture = () => [
  section("s1", "First", [
    column("c1", [heading("a", "Alpha"), widget("b", "quote", { text: "Bravo" }), widget("c", "button", { label: "Charlie", href: "#" })]),
    column("c2", [widget("d", "divider", {})]),
  ]),
  // A text, for the keys that open it and the keys inside it.
  section("s2", "Second", [column("c3", [widget("t", "text", { doc: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Tango" }] }] } })])]),
];

const text = (page: Page) => page.locator('.canvas [data-block-id="t"] .rte');

// ProseMirror takes a caret the keys moved from the browser's next
// selection event, and until then deletes from where it last saw it: the
// next key waits for it, as a person's hand would.
const caretAt = (page: Page, id: string, at: number) => page.waitForFunction(([blockId, pos]) => {
  const dom = document.querySelector(`.canvas [data-block-id="${blockId}"] .rte`) as (Element & { editor?: { state: { selection: { from: number; empty: boolean } } } }) | null;
  return dom?.editor?.state.selection.empty === true && dom.editor.state.selection.from === pos;
}, [id, at] as const);

// The page the run makes, for the exercises that open it on the CMS.
let opened = { id: 0, slug: "" };

const selected = (page: Page) => page.locator(".canvas [data-editor-selected=true]").getAttribute("data-block-id");
const focusedId = (page: Page) => page.evaluate(() => (document.activeElement as HTMLElement | null)?.dataset.blockId ?? null);

// Each action, its chords pressed (the keys Playwright names), and what
// they must have done. Runs in this order, on one page.
const EXERCISES: Record<KeyAction, (page: Page, pressed: Set<string>) => Promise<void>> = {
  async selectNext(page, pressed) {
    await block(page, "a").click();
    await press(page, pressed, "ArrowDown");
    expect(await selected(page)).toBe("b");
    await expect.poll(() => focusedId(page)).toBe("b");
  },
  async selectPrevious(page, pressed) {
    await press(page, pressed, "ArrowUp");
    expect(await selected(page)).toBe("a");
  },
  async selectParent(page, pressed) {
    await press(page, pressed, "Alt+ArrowUp");
    expect(await selected(page)).toBe("c1");
  },
  async selectFirstChild(page, pressed) {
    await press(page, pressed, "Alt+ArrowDown");
    expect(await selected(page)).toBe("a");
  },
  async clearSelection(page, pressed) {
    await press(page, pressed, "Escape");
    await expect(page.locator(".canvas [data-editor-selected=true]")).toHaveCount(0);
    await expect(page.locator(".canvas")).toBeFocused();
  },
  async blockTools(page, pressed) {
    // From the block, Tab goes to its clamp, one stop: the arrows go along
    // it and Esc comes back; Tab from the clamp goes on to the sidebar.
    await block(page, "a").click();
    await press(page, pressed, "Tab");
    const clamp = page.getByRole("toolbar", { name: "Heading tools" });
    await expect(clamp.getByRole("button", { name: "Heading: block menu" })).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(clamp.getByRole("button", { name: /^Drag to move/ })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(block(page, "a")).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(clamp.getByRole("button", { name: /^Drag to move/ })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect.poll(() => page.evaluate(() => document.activeElement?.closest(".sidebar") !== null)).toBe(true);
  },
  async pickUp(page, pressed) {
    await block(page, "a").click();
    await press(page, pressed, "Space");
    await expect(caption(page).locator("strong")).toHaveText("Heading is where it was.");
  },
  async moveVertically(page, pressed) {
    await press(page, pressed, "ArrowDown");
    await expect(caption(page).locator("strong")).toHaveText("Heading will move to Column 1 in First, after Quote.");
    await press(page, pressed, "ArrowUp");
    await expect(caption(page).locator("strong")).toHaveText("Heading is where it was.");
  },
  async moveHorizontally(page, pressed) {
    await press(page, pressed, "ArrowRight");
    await expect(caption(page).locator("strong")).toHaveText("Heading will move to Column 2 in First, at the top.");
    await press(page, pressed, "ArrowLeft");
    await expect(caption(page).locator("strong")).toHaveText("Heading is where it was.");
    await press(page, pressed, "ArrowRight");
  },
  async drop(page, pressed) {
    await press(page, pressed, "Space");
    await expect.poll(() => childIds(page, "c2")).toEqual(["a", "d"]);
    await expect(block(page, "a")).toBeFocused();
  },
  async cancelMove(page, pressed) {
    await page.keyboard.press("Space");
    await page.keyboard.press("ArrowDown");
    await press(page, pressed, "Escape");
    await expect(caption(page)).toHaveText("Cancelled: Heading is back where it was.");
    expect(await childIds(page, "c2")).toEqual(["a", "d"]);
  },
  async addHere(page, pressed) {
    // The picker after the selected quote, its search taking the keys: the
    // arrows go to its keys, Enter adds, by one command, focused; Esc
    // closes it, the focus back on the block. Undone after, so the
    // exercises below find the column as they expect it.
    await block(page, "b").click();
    await press(page, pressed, "+");
    const picker = page.getByRole("dialog", { name: "Add a block after Quote" });
    await expect(picker.getByRole("searchbox", { name: "Search blocks" })).toBeFocused();
    await page.keyboard.type("div");
    await page.keyboard.press("ArrowDown");
    await expect(picker.getByRole("button", { name: "Divider" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(picker).toHaveCount(0);
    await expect.poll(() => page.locator('.canvas [data-block-id="c1"] > [data-block-id]').evaluateAll((e) => e.map((x) => x.getAttribute("data-block-type")))).toEqual(["quote", "divider", "button"]);
    await expect(page.locator('.canvas [data-block-id="c1"] > [data-block-type="divider"]')).toBeFocused();
    await page.keyboard.press("Control+z");
    await expect.poll(async () => (await childIds(page, "c1")).length).toBe(2);
    await block(page, "b").click();
    await page.keyboard.press("+");
    await expect(picker.getByRole("searchbox", { name: "Search blocks" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(picker).toHaveCount(0);
    await expect(block(page, "b")).toBeFocused();
    expect(await childIds(page, "c1")).toEqual(["b", "c"]);
  },
  async addTile(page, pressed) {
    await block(page, "b").click();
    const insert = await drawer(page, "Insert");
    await insert.getByRole("group", { name: "Basic" }).getByRole("button", { name: "Spacer" }).focus();
    await press(page, pressed, "Enter");
    await expect.poll(async () => (await childIds(page, "c1")).length).toBe(3);
    await expect(page.locator('.canvas [data-block-id="c1"] > [data-block-id]').nth(1)).toHaveAttribute("data-block-type", "spacer");
    await insert.getByRole("button", { name: "Close Insert" }).click();
  },
  async editText(page, pressed) {
    await block(page, "t").click();
    await press(page, pressed, "Enter");
    await expect(text(page)).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(block(page, "t")).toBeFocused();
    // Another widget's words are in its panel: Enter goes to its first field,
    // on the Block tab though the Page tab was chosen, its group opened
    // though it was closed.
    await block(page, "a").click();
    const sidebar = page.getByRole("complementary", { name: "Settings" });
    await sidebar.getByRole("button", { name: "Text", exact: true }).click();
    await expect(sidebar.getByRole("button", { name: "Text", exact: true })).toHaveAttribute("aria-expanded", "false");
    await sidebar.getByRole("tab", { name: "Page" }).click();
    await block(page, "a").click();
    await expect(sidebar.getByRole("tab", { name: "Page" })).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("Enter");
    await expect(sidebar.getByRole("tab", { name: "Block" })).toHaveAttribute("aria-selected", "true");
    await expect(sidebar.getByRole("button", { name: "Text", exact: true })).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByRole("textbox", { name: "Text" })).toBeFocused();
  },
  async blockMenu(page, pressed) {
    // The browser's context menu key, on the block with the focus.
    await block(page, "a").click();
    await press(page, pressed, "Shift+F10");
    // The block menu: the moves first, the first that can be made focused.
    const menu = page.getByRole("menu", { name: "Heading: block menu" });
    await expect(menu.getByRole("menuitem", { name: "Move down" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);
    await expect(block(page, "a")).toBeFocused();
  },
  async copy(page, pressed) {
    await block(page, "c").click();
    await press(page, pressed, "Control+c");
    await expect(page.locator(".notice")).toHaveText(/Copied Button\./);
  },
  async paste(page, pressed) {
    await block(page, "d").click();
    await press(page, pressed, "Control+v");
    await expect.poll(async () => page.locator('.canvas [data-block-id="c2"] > [data-block-id]').evaluateAll((e) => e.map((x) => x.getAttribute("data-block-type")))).toEqual(["heading", "divider", "button"]);
  },
  async duplicate(page, pressed) {
    await block(page, "d").click();
    await press(page, pressed, "Control+d");
    await expect.poll(async () => (await childIds(page, "c2")).length).toBe(4);
  },
  async delete(page, pressed) {
    await block(page, "d").click();
    await press(page, pressed, "Delete");
    await expect(block(page, "d")).toHaveCount(0);
    // The focus goes to the block now in its place once the page is drawn
    // again: Backspace is for that block, so it waits for it.
    await expect.poll(() => focusedId(page)).not.toBeNull();
    await press(page, pressed, "Backspace");
    await expect.poll(async () => (await childIds(page, "c2")).length).toBe(2);
  },
  async bold(page, pressed) {
    await block(page, "t").click();
    await page.keyboard.press("Enter");
    await expect(text(page)).toBeFocused();
    await page.keyboard.press("Control+a");
    await press(page, pressed, "Control+b");
    await expect(text(page).locator("strong")).toHaveText("Tango");
  },
  async italic(page, pressed) {
    await press(page, pressed, "Control+i");
    await expect(text(page).locator("strong em, em strong")).toHaveText("Tango");
  },
  async link(page, pressed) {
    await press(page, pressed, "Control+k");
    const field = page.locator(".ov-link input");
    await expect(field).toBeFocused();
    await field.fill("/tango");
    await field.press("Enter");
    await expect(text(page).locator('a[href="/tango"]')).toHaveText("Tango");
    await expect(text(page)).toBeFocused();
  },
  async leaveText(page, pressed) {
    await press(page, pressed, "Escape");
    await expect(page.locator(".canvas .rte")).toHaveCount(0);
    await expect(block(page, "t")).toBeFocused();
    await expect(block(page, "t").locator('a[href="/tango"]')).toHaveText("Tango");
    // The text's change is one step of the page's history: undone here, so
    // the history keys below find the steps they expect.
    await page.keyboard.press("Control+z");
    await expect(block(page, "t").locator("strong, em, a")).toHaveCount(0);
  },
  async undo(page, pressed) {
    await press(page, pressed, "Control+z");
    await expect.poll(async () => (await childIds(page, "c2")).length).toBe(3);
  },
  async redo(page, pressed) {
    await press(page, pressed, "Control+Shift+Z");
    await expect.poll(async () => (await childIds(page, "c2")).length).toBe(2);
    await page.keyboard.press("Control+z");
    await press(page, pressed, "Control+y");
    await expect.poll(async () => (await childIds(page, "c2")).length).toBe(2);
  },
  async saveVersion(page, pressed) {
    // The history opens on "Save version", its name field taking the keys.
    await block(page, "a").click();
    await press(page, pressed, "Control+s");
    const history = page.getByRole("complementary", { name: "History" });
    const name = history.getByRole("textbox", { name: /^Name/ });
    await expect(name).toBeFocused();
    await page.keyboard.type("Every key, kept");
    await page.keyboard.press("Enter");
    await expect(history.getByRole("listitem").filter({ hasText: "Every key, kept" })).toBeVisible();
    const listed = await page.request.get(`${cms()}/api/pages/${opened.id}/versions`);
    const { versions } = (await listed.json()) as { versions: Array<{ reason: string; name: string | null }> };
    expect(versions[0]).toMatchObject({ reason: "manual", name: "Every key, kept" });
    await history.getByRole("button", { name: "Close history" }).click();
    await expect(history).toHaveCount(0);
  },
  async preview(page, pressed) {
    // The draft as the CMS serves it, in a tab of its own, on the CMS.
    const opening = page.context().waitForEvent("page");
    await press(page, pressed, "Alt+Shift+P");
    const tab = await opening;
    await tab.waitForURL(`${cms()}/preview/${opened.id}`);
    await expect(tab).toHaveTitle("Preview: Every key");
    await expect(tab.getByRole("heading", { name: "Alpha" })).toBeVisible();
    await tab.close();
  },
  async publish(page, pressed) {
    await block(page, "a").click();
    await press(page, pressed, "Control+Shift+Enter");
    await expect(page.locator(".tb-status")).toHaveText("Published");
    await expect(page.locator(".notice")).toContainText(`Published: visitors see this page at ${new URL(cms()).host}/${opened.slug}.`);
    const live = await page.request.get(`${cms()}/${opened.slug}`);
    expect(live.status()).toBe(200);
    expect(await live.text()).toContain("Alpha");
  },
  async openInsert(page, pressed) {
    // From the selected block: Insert opens on its search; Esc closes it,
    // the focus back on the block; the chord again, from the page, too.
    await block(page, "a").click();
    await press(page, pressed, "Alt+Shift+N");
    const insert = page.getByRole("complementary", { name: "Insert" });
    await expect(insert.getByRole("searchbox", { name: "Search blocks and sections" })).toBeFocused();
    await expect(page.locator(".topbar [data-drawer=insert]")).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.press("Escape");
    await expect(insert).toHaveCount(0);
    await expect(block(page, "a")).toBeFocused();
  },
  async openOutline(page, pressed) {
    // The outline opens on the selected block's row; the chord, pressed
    // there, closes it again, the focus back on the block.
    await press(page, pressed, "Alt+Shift+O");
    await expect(page.getByRole("complementary", { name: "Outline" })).toBeVisible();
    await expect(page.locator('.tree [data-row-id="a"]')).toBeFocused();
    await page.keyboard.press("Alt+Shift+O");
    await expect(page.getByRole("complementary", { name: "Outline" })).toHaveCount(0);
    await expect(block(page, "a")).toBeFocused();
  },
  async deviceDesktop(page, pressed) {
    await device(page, "Phone").click();
    await block(page, "a").focus();
    await press(page, pressed, "Alt+Shift+1");
    await expect(device(page, "Desktop")).toHaveAttribute("aria-checked", "true");
    await expect(page.locator(".canvas .site")).not.toHaveCSS("width", "390px");
  },
  async deviceTablet(page, pressed) {
    await press(page, pressed, "Alt+Shift+2");
    await expect(device(page, "Tablet")).toHaveAttribute("aria-checked", "true");
    await expect(page.locator(".canvas .site")).toHaveCSS("width", "768px");
    // The focus stays where it was.
    await expect(block(page, "a")).toBeFocused();
  },
  async devicePhone(page, pressed) {
    await press(page, pressed, "Alt+Shift+3");
    await expect(device(page, "Phone")).toHaveAttribute("aria-checked", "true");
    await expect(page.locator(".canvas .site")).toHaveCSS("width", "390px");
    await page.keyboard.press("Alt+Shift+1");
  },
  async showShortcuts(page, pressed) {
    await block(page, "a").click();
    await press(page, pressed, "?");
    const dialog = page.getByRole("dialog", { name: "Keyboard shortcuts" });
    await expect(dialog).toBeVisible();
    // The window lists every entry of the map, with its keys.
    const listed = await dialog.locator("[data-action]").evaluateAll((rows) => rows.map((row) => ({
      action: (row as HTMLElement).dataset.action,
      label: row.querySelector("dt")?.textContent,
      keys: [...row.querySelectorAll("kbd")].map((k) => k.getAttribute("aria-label") ?? k.textContent),
    })));
    expect([...listed].sort((x, y) => String(x.action).localeCompare(String(y.action)))).toEqual(
      KEYMAP.map((e) => ({ action: e.action, label: e.label, keys: entryCaps(e).map((cap) => ("text" in cap ? cap.text : cap.name)) }))
        .sort((x, y) => x.action.localeCompare(y.action)),
    );
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
  },
};

// The keys as the map names them, for Playwright.
const PLAYWRIGHT_KEY: Readonly<Record<string, string>> = { " ": "Space" };
function chordName(chord: (typeof KEYMAP)[number]["chords"][number]): string {
  const key = PLAYWRIGHT_KEY[chord.key] ?? (chord.key.length === 1 && chord.shift ? chord.key.toUpperCase() : chord.key);
  return [chord.mod ? "Control" : null, chord.alt ? "Alt" : null, chord.shift ? "Shift" : null, key].filter(Boolean).join("+");
}

async function press(page: Page, pressed: Set<string>, keys: string) {
  await page.keyboard.press(keys);
  pressed.add(keys.toLowerCase());
}

test("in a text being written, Delete, Backspace and Ctrl+D change letters, never the block; keeping a version, previewing and publishing still work", { tag: "@a11y" }, async ({ page, request }) => {
  const made = await makePage(request, "Typing keys", fixture());
  await open(page, made.id);
  await block(page, "t").click();
  await page.keyboard.press("Enter");
  const rte = await settledTextEditor(page, "t");
  // Enter puts the caret at the end: Backspace takes the last letter.
  await page.keyboard.press("Backspace");
  await expect(rte).toHaveText("Tang");
  await page.keyboard.press("Control+Home");
  await caretAt(page, "t", 1);
  await page.keyboard.press("Delete");
  await expect(rte).toHaveText("ang");
  await page.keyboard.press("Control+d");
  await expect(rte).toBeFocused();
  await expect(rte).toHaveText("ang");
  // The block is where it was, alone in its column, and still being written.
  expect(await childIds(page, "c3")).toEqual(["t"]);
  expect(await childIds(page, "c2")).toEqual(["d"]);

  // Ctrl+S: the history, its name field taking the focus; the text, handed
  // over as the editor closed, is in the version.
  await page.keyboard.press("Control+s");
  const history = page.getByRole("complementary", { name: "History" });
  const name = history.getByRole("textbox", { name: /^Name/ });
  await expect(name).toBeFocused();
  await expect(page.locator(".canvas .rte")).toHaveCount(0);
  await page.keyboard.type("Mid-sentence");
  await page.keyboard.press("Enter");
  await expect(history.getByRole("listitem").filter({ hasText: "Mid-sentence" })).toBeVisible();
  const versions = (await (await page.request.get(`${cms()}/api/pages/${made.id}/versions`)).json()) as { versions: Array<{ name: string | null; id: number }> };
  expect(versions.versions[0]?.name).toBe("Mid-sentence");
  await history.getByRole("button", { name: "Close history" }).click();

  // Publish and preview from inside the text: what was typed a moment ago
  // goes with them, and the text stays open under the caret.
  await block(page, "t").click();
  await settledTextEditor(page, "t");
  await page.keyboard.press("Control+End");
  await caretAt(page, "t", 4);
  await page.keyboard.type("o!");
  await page.keyboard.press("Control+Shift+Enter");
  await expect(page.locator(".tb-status")).toHaveText("Published");
  await expect(rte).toBeFocused();
  const live = await page.request.get(`${cms()}/${made.slug}`);
  expect(await live.text()).toContain("ango!");
  await page.keyboard.type("?");
  await expect(rte).toHaveText("ango!?");
  const opening = page.context().waitForEvent("page");
  await page.keyboard.press("Alt+Shift+P");
  const tab = await opening;
  await tab.waitForURL(`${cms()}/preview/${made.id}`);
  await expect(tab.getByText("ango!?")).toBeVisible();
  await tab.close();
  // The "?" went into the text: the window did not open.
  await expect(page.getByRole("dialog", { name: "Keyboard shortcuts" })).toHaveCount(0);
});

test("every entry of the keyboard map does what the window says, by every one of its keys", { tag: "@a11y" }, async ({ page, request, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  opened = await makePage(request, "Every key", fixture());
  await open(page, opened.id);
  const pressed = new Set<string>();
  const done: KeyAction[] = [];
  for (const entry of KEYMAP) {
    await test.step(`${entry.action}: ${entry.label}`, () => EXERCISES[entry.action](page, pressed));
    done.push(entry.action);
  }
  expect(done).toEqual(KEYMAP.map((e) => e.action));
  // Every chord of every entry was pressed (the "?" by its own key).
  const chords = KEYMAP.flatMap((e) => e.chords.map(chordName)).map((k) => k.toLowerCase());
  expect(chords.filter((chord) => !pressed.has(chord) && !(chord === "?" && pressed.has("?")))).toEqual([]);
});
