// The note on a shaded section ("Widgets go inside a column.") when a key is
// dragged out of Insert (the owner's finding of 4 October 2026, as the
// review found it): Insert floats over the page's left, and the note, at
// the section's left, was under the drawer, so only the grey and the
// bottom line were left to say why. In Chromium against the run's CMS:
// - it starts where the open drawer ends, inside the band, and is what is
//   on top there;
// - with Insert closed (a block moved on the page), it stays at the
//   section's left, where the layout puts it.
import type { Locator, Page } from "@playwright/test";
import { block, caption, moveOnto, pickUp } from "./helpers/canvas.ts";
import { column, drawer, expect, heading, makePage, open, section, test, widget } from "./helpers/site.ts";

test.use({ viewport: { width: 1440, height: 900 } });

const fixture = () => [
  section("s1", "First", [column("c1", [heading("a", "Alpha"), widget("b", "quote", { text: "Bravo" })]), column("c2", [widget("d", "divider", {})])]),
  section("s2", "Second", [column("c3", [widget("e", "spacer", { size: "m" })]), column("c4", [])]),
];

async function insertKey(page: Page, group: "Basic" | "Media" | "Content", name: string): Promise<Locator> {
  const insert = await drawer(page, "Insert");
  const key = insert.getByRole("group", { name: group }).getByRole("button", { name, exact: true });
  await key.scrollIntoViewIfNeeded();
  return key;
}

test("dragged from Insert over a shaded section, the note starts where the open drawer ends, inside the band, and is what is on top there", async ({ page, request }) => {
  const { id } = await makePage(request, "Note beside the drawer", fixture());
  await open(page, id);
  const insert = page.getByRole("complementary", { name: "Insert", exact: true });
  await pickUp(page, await insertKey(page, "Media", "Gallery"));
  await moveOnto(page, block(page, "s2"), "top");
  await expect(caption(page).locator("strong")).toHaveText("Nowhere to drop it here. Widgets go inside a column.");

  const note = block(page, "s2").locator(":scope > .ov-veil .veil-note");
  await expect(note).toBeVisible();
  await expect(note).toHaveText("Widgets go inside a column.");
  const drawerBox = (await insert.boundingBox())!;
  const noteBox = (await note.boundingBox())!;
  const sectionBox = (await block(page, "s2").boundingBox())!;
  expect(noteBox.x, `the note at ${noteBox.x} is under the drawer, which ends at ${drawerBox.x + drawerBox.width}`).toBeGreaterThanOrEqual(drawerBox.x + drawerBox.width);
  expect(noteBox.x + noteBox.width, "the note is inside the section's band").toBeLessThanOrEqual(sectionBox.x + sectionBox.width + 0.5);
  // On top: with the overlay answering the pointer, the note, not the
  // drawer or the page, is what the browser finds at its middle.
  const found = await note.evaluate((element) => {
    const veil = element.parentElement as HTMLElement;
    veil.style.pointerEvents = "auto";
    (element as HTMLElement).style.pointerEvents = "auto";
    const at = element.getBoundingClientRect();
    const top = document.elementsFromPoint(at.x + at.width / 2, at.y + at.height / 2)[0];
    veil.style.pointerEvents = "";
    (element as HTMLElement).style.pointerEvents = "";
    return { note: top !== undefined && (top === element || element.contains(top)), name: top?.className ?? null };
  });
  expect(found.note, `on top there is ${found.name}`).toBe(true);
  await page.keyboard.press("Escape");
  await page.mouse.up();
});

test("with Insert closed, as on a block moved on the page, the note stays at the section's left", async ({ page, request }) => {
  const { id } = await makePage(request, "Note at the left", fixture());
  await open(page, id);
  await block(page, "a").click();
  await pickUp(page, page.locator(".canvas .clamp [data-grip]"));
  await moveOnto(page, block(page, "s2"), "top");
  const note = block(page, "s2").locator(":scope > .ov-veil .veil-note");
  await expect(note).toBeVisible();
  const noteBox = (await note.boundingBox())!;
  const sectionBox = (await block(page, "s2").boundingBox())!;
  expect(noteBox.x - sectionBox.x, "the section's own padding").toBeLessThan(80);
  await page.keyboard.press("Escape");
  await page.mouse.up();
});
