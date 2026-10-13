// Headings written where they stand, in Chromium, against the run's CMS
// (src/editor/HeadingEditor.tsx, src/editor/heading-session.ts): a
// heading clicked once more opens its line, the caret where the click was;
// the words typed are the CMS's after the pause, one step of the page's
// history; Esc and Enter leave it, the block focused; a character typed on
// the selected heading writes into it, so the Space after it is a space,
// never a move; a pasted paragraph comes in as one line; and axe finds
// nothing serious on the line being written.
import { axe } from "./helpers/axe.ts";
import { block } from "./helpers/canvas.ts";
import { column, draftOf, expect, heading, makePage, open, saved, section, test, type DraftBlock } from "./helpers/site.ts";

test.use({ viewport: { width: 1440, height: 900 } });

const fixture = () => [section("s", "Story", [column("c", [heading("h", "Swim at dawn"), heading("g", "Tea after")])])];

function find(blocks: readonly DraftBlock[], id: string): DraftBlock | undefined {
  for (const one of blocks) {
    if (one.id === id) return one;
    const inside = find(one.children, id);
    if (inside) return inside;
  }
  return undefined;
}

test("a heading clicked once more is written where it stands, the caret where the click was; the CMS keeps the words, and Ctrl+Z takes them back in one step", { tag: "@a11y" }, async ({ page, request }) => {
  const { id } = await makePage(request, "Heading in place", fixture());
  await open(page, id);
  const words = block(page, "h").locator("h2");
  await block(page, "h").click();
  // Once more, at the start of the words: the caret there.
  const box = (await words.boundingBox())!;
  await page.mouse.click(box.x + 2, box.y + box.height / 2);
  const line = block(page, "h").getByRole("textbox", { name: /^Heading/ });
  await expect(line).toBeFocused();
  await page.keyboard.type("Cold, ");
  await expect(line).toHaveText("Cold, Swim at dawn");
  await saved(page);
  await expect.poll(async () => find((await draftOf(request, id)).document.sections, "h")?.props.text).toBe("Cold, Swim at dawn");

  const report = await axe(page, { include: '.canvas [data-block-id="h"]' });
  expect(report.serious).toEqual([]);
  for (const line of report.other) console.log(`a heading being written: ${line}`);

  await page.keyboard.press("Escape");
  await expect(line).toHaveCount(0);
  await expect(block(page, "h")).toBeFocused();
  await expect(words).toHaveText("Cold, Swim at dawn");
  await page.keyboard.press("Control+z");
  await expect(words).toHaveText("Swim at dawn");
  await saved(page);
  await expect.poll(async () => find((await draftOf(request, id)).document.sections, "h")?.props.text).toBe("Swim at dawn");
});

test("with a heading's line open, Tab reaches its clamp and Esc comes back into the line; a character typed on the block itself goes into the line at its end", async ({ page, request }) => {
  const { id } = await makePage(request, "Heading clamp", fixture());
  await open(page, id);
  await block(page, "g").click();
  await page.keyboard.press("Enter");
  const line = block(page, "g").getByRole("textbox", { name: /^Heading/ });
  await expect(line).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(block(page, "g").getByRole("button", { name: "Heading: block menu" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(line).toBeFocused();
  await page.keyboard.type(" now");
  await expect(line).toHaveText("Tea after now");
  // The focus on the block itself, the line still open: a character goes
  // into the line, at its end, and the next ones follow it there.
  await block(page, "g").focus();
  await page.keyboard.type("!!");
  await expect(line).toHaveText("Tea after now!!");
  await page.keyboard.press("Escape");
  await saved(page);
  await expect.poll(async () => find((await draftOf(request, id)).document.sections, "g")?.props.text).toBe("Tea after now!!");
});

test("a character typed on a selected heading writes into it, and the Space after it is a space; Enter leaves; a pasted paragraph comes in as one line", async ({ page, request, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const { id } = await makePage(request, "Heading typed", fixture());
  await open(page, id);
  await block(page, "g").click();
  await page.keyboard.type("! Yes");
  const line = block(page, "g").getByRole("textbox", { name: /^Heading/ });
  await expect(line).toHaveText("Tea after! Yes");
  // Nothing picked up: no block is moving.
  await expect(page.locator(".canvas [data-drag-slot]")).toHaveCount(0);
  await page.keyboard.press("Enter");
  await expect(line).toHaveCount(0);
  await expect(block(page, "g")).toBeFocused();
  await expect(block(page, "g").locator("h2")).toHaveText("Tea after! Yes");

  await page.evaluate(() => navigator.clipboard.writeText("and cake\nat the slipway"));
  await page.keyboard.press("Enter");
  await expect(line).toBeFocused();
  await page.keyboard.type(" ");
  await page.keyboard.press("Control+v");
  await expect(line).toHaveText("Tea after! Yes and cake at the slipway");
  await page.keyboard.press("Escape");
  await saved(page);
  await expect.poll(async () => find((await draftOf(request, id)).document.sections, "g")?.props.text).toBe("Tea after! Yes and cake at the slipway");
});
