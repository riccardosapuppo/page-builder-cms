// Every entry of the keyboard map (src/editor/keymap.ts), pressed in
// Chromium, does what the "?" window says it does: every chord of every
// entry. The exercises are a table keyed by the map's actions, so an entry
// added without one does not compile, and the run checks it pressed them
// all. The "?" window lists the very same entries.
import type { Page } from "@playwright/test";
import { entryCaps, KEYMAP, type KeyAction } from "../src/editor/keymap.ts";
import { block, caption, childIds } from "./helpers/canvas.ts";
import { column, expect, heading, makePage, open, section, test, widget } from "./helpers/site.ts";

test.use({ viewport: { width: 1440, height: 900 } });

const fixture = () => [
  section("s1", "First", [
    column("c1", [heading("a", "Alpha"), widget("b", "quote", { text: "Bravo" }), widget("c", "button", { label: "Charlie", href: "#" })]),
    column("c2", [widget("d", "divider", {})]),
  ]),
];

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
  async addTile(page, pressed) {
    await block(page, "b").click();
    await page.getByRole("tab", { name: "Add" }).click();
    await page.getByRole("group", { name: "Basic" }).getByRole("button", { name: "Spacer" }).focus();
    await press(page, pressed, "Enter");
    await expect.poll(async () => (await childIds(page, "c1")).length).toBe(3);
    await expect(page.locator('.canvas [data-block-id="c1"] > [data-block-id]').nth(1)).toHaveAttribute("data-block-type", "spacer");
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
    await press(page, pressed, "Backspace");
    await expect.poll(async () => (await childIds(page, "c2")).length).toBe(2);
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

test("every entry of the keyboard map does what the window says, by every one of its keys", { tag: "@a11y" }, async ({ page, request, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const { id } = await makePage(request, "Every key", fixture());
  await open(page, id);
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
