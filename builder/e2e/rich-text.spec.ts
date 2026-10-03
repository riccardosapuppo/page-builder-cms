// Rich text on the canvas, in Chromium, against the run's own CMS: a text
// block edited where it stands, laid out as the page lays it out; its
// typing kept as one step of the page's history, handed over before a
// drag of the same block; undo and redo, inside the text and outside it,
// giving back exactly the document the CMS holds; bold, italic and a link
// from the block's bar, the link refused with its reason; what a word
// processor and a web page paste, cut to what the schema allows and saved
// by the CMS; and the editor's code loaded only when a text is selected.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Page } from "@playwright/test";
import { axe } from "./helpers/axe.ts";
import { block, childIds, grip, moveOnto, pickUp, settledTextEditor } from "./helpers/canvas.ts";
import { cms, column, draftOf, expect, heading, makePage, open, section, test, widget, type DraftBlock } from "./helpers/site.ts";

test.use({ viewport: { width: 1440, height: 900 } });

const here = dirname(fileURLToPath(import.meta.url));
const pasteFixture = (name: string) => readFileSync(resolve(here, "../test/paste", name), "utf8");

const t = (text: string, ...marks: unknown[]) => (marks.length > 0 ? { type: "text", text, marks } : { type: "text", text });
const p = (...content: unknown[]) => (content.length > 0 ? { type: "paragraph", content } : { type: "paragraph" });

// The text the tests start from: two paragraphs, bold, a link stored with
// the nulls the schema allows, and a list.
const START_TEXT = {
  type: "doc",
  content: [
    p(t("Twice a week, at "), t("first light", { type: "bold" }), t(", when the bay is flat.")),
    p(t("See the "), t("tide times", { type: "link", attrs: { href: "/swims", target: null, rel: null, class: null } }), t(" first.")),
    { type: "bulletList", content: [{ type: "listItem", content: [p(t("A towel"))] }, { type: "listItem", content: [p(t("A warm hat"))] }] },
  ],
};

const fixture = () => [
  section("s", "Story", [
    column("c1", [widget("t", "text", { doc: START_TEXT }), heading("h", "Alpha")]),
    column("c2", [widget("d", "divider", {})]),
  ]),
];

function findBlock(blocks: readonly DraftBlock[], id: string): DraftBlock | undefined {
  for (const b of blocks) {
    if (b.id === id) return b;
    const inner = findBlock(b.children, id);
    if (inner) return inner;
  }
  return undefined;
}

// The text block's document as the CMS holds it now.
async function storedText(request: Parameters<typeof makePage>[0], id: number, blockId = "t"): Promise<unknown> {
  return findBlock((await draftOf(request, id)).document.sections, blockId)?.props.doc;
}

const editor = (page: Page, id = "t") => page.locator(`.canvas [data-block-id="${id}"] .rte`);

// A click selects the text; a second one opens its editor where it falls.
async function openText(page: Page, id = "t") {
  await block(page, id).click();
  await expect(block(page, id)).toHaveAttribute("data-editor-selected", "true");
  await block(page, id).locator("p").first().click();
  await settledTextEditor(page, id);
}

test("the editor opens where the text was clicked, and lays the text out as the page does", async ({ page, request }) => {
  const { id } = await makePage(request, "Text in place", fixture());
  await open(page, id);
  const boxes = () => block(page, "t").locator("p, li").evaluateAll((elements) => elements.map((e) => {
    const box = e.getBoundingClientRect();
    return [e.tagName, Math.round(box.x * 4) / 4, Math.round(box.y * 4) / 4, Math.round(box.width * 4) / 4, Math.round(box.height * 4) / 4];
  }));
  await block(page, "t").click();
  const drawn = await boxes();
  expect(drawn.length).toBe(6);
  // A click on the word "light", in the selected text: the caret lands in it.
  const word = block(page, "t").locator("strong");
  const box = await word.boundingBox();
  if (!box) throw new Error("the bold words are not on screen");
  await page.mouse.click(box.x + box.width - 0.5, box.y + box.height / 2);
  await expect(editor(page)).toBeFocused();
  await expect(editor(page)).toHaveAttribute("role", "textbox");
  await expect(editor(page)).toHaveAccessibleName("Text in Story");
  expect(await boxes()).toEqual(drawn);
  await page.keyboard.type("!");
  await expect(editor(page).locator("strong")).toHaveText("first light!");
  // The page's other texts keep the page's drawing: one editor at a time.
  await expect(page.locator(".canvas .rte")).toHaveCount(1);
});

// Where each word of a text stands, from the first word's line, and how
// tall the text is: in the window's pixels, rounded to a quarter.
async function wordLines(page: Page, selector: string, words: readonly string[]): Promise<Record<string, number>> {
  return page.evaluate(({ scope, wanted }) => {
    const root = document.querySelector(scope) as HTMLElement;
    const quarter = (n: number) => Math.round(n * 4) / 4;
    const out: Record<string, number> = { height: quarter(root.getBoundingClientRect().height) };
    const tops: Record<string, number> = {};
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const word = (node.textContent ?? "").trim();
      if (!wanted.includes(word)) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      tops[word] = range.getBoundingClientRect().top;
    }
    const first = tops[wanted[0]!] ?? 0;
    for (const word of wanted) if (word in tops) out[word] = quarter(tops[word]! - first);
    return out;
  }, { scope: selector, wanted: [...words] });
}

test("empty paragraphs, a break ending a paragraph and an empty list item stand alike on the canvas, while written, and on the page served", async ({ page, request, browser }) => {
  const words = ["Alpha", "Bravo", "Charlie", "Delta", "Echo"];
  const doc = {
    type: "doc",
    content: [
      p(t("Alpha")), p(), p(),
      p(t("Bravo"), { type: "hardBreak" }),
      p(t("Charlie")),
      { type: "bulletList", content: [{ type: "listItem", content: [p()] }, { type: "listItem", content: [p(t("Delta"), { type: "hardBreak" })] }] },
      p(t("Echo")),
    ],
  };
  const { id } = await makePage(request, "Empty lines", [section("s", "Story", [column("c1", [widget("t", "text", { doc }), heading("h", "After")])])]);
  await open(page, id);
  const scope = '.canvas [data-block-id="t"]';
  const canvas = await wordLines(page, scope, words);
  await openText(page);
  const editing = await wordLines(page, scope, words);
  // The editor draws each empty paragraph, and the line after each break
  // that ends one, a line tall: the canvas and the page do the same.
  expect(editing).toEqual(canvas);
  await page.keyboard.press("Escape");
  const width = await page.locator(".canvas .site").evaluate((e) => e.getBoundingClientRect().width);
  const served = await browser.newPage({ viewport: { width: Math.round(width), height: 900 } });
  await served.goto(`${cms()}/preview/${id}`);
  expect(await wordLines(served, '[data-block-id="t"]', words)).toEqual(canvas);
  await served.close();
});

test("text typed and the same block dragged at once: the text stays, as a step of its own before the move", async ({ page, request }) => {
  const { id } = await makePage(request, "Type then drag", fixture());
  await open(page, id);
  await openText(page);
  await page.keyboard.press("Control+End");
  await page.keyboard.type(" Bring tea.");
  // Straight from the text to the block's grip, without leaving it first.
  await pickUp(page, grip(page));
  await moveOnto(page, block(page, "c2"), "bottom");
  await page.mouse.up();
  await expect.poll(() => childIds(page, "c2")).toEqual(["d", "t"]);
  await expect(block(page, "t").locator("li").last()).toHaveText("A warm hat Bring tea.");
  const typed = structuredClone(START_TEXT);
  (typed.content[2] as { content: Array<{ content: Array<{ content: unknown[] }> }> }).content[1]!.content[0]!.content = [t("A warm hat Bring tea.")];
  // The link as the editor writes it: its href alone.
  (typed.content[1] as { content: unknown[] }).content[1] = t("tide times", { type: "link", attrs: { href: "/swims" } });
  await expect.poll(() => storedText(request, id)).toEqual(typed);
  // One undo takes the move back and keeps the words; the next takes the words.
  await page.keyboard.press("Control+z");
  await expect.poll(() => childIds(page, "c1")).toEqual(["t", "h"]);
  await expect(block(page, "t").locator("li").last()).toHaveText("A warm hat Bring tea.");
  await page.keyboard.press("Control+z");
  await expect(block(page, "t").locator("li").last()).toHaveText("A warm hat");
  await expect.poll(() => storedText(request, id)).toEqual(START_TEXT);
});

test("typing, undo and redo give back exactly the document the CMS held, outside the text and inside it", async ({ page, request }) => {
  const { id } = await makePage(request, "Undo exactly", fixture());
  await open(page, id);
  expect(await storedText(request, id)).toEqual(START_TEXT);
  await openText(page);
  await page.keyboard.press("Control+End");
  await page.keyboard.type(" Cold.");
  await page.keyboard.press("Escape");
  // Esc leaves the text for the block, which keeps the focus.
  await expect(block(page, "t")).toBeFocused();
  await expect(page.locator(".canvas .rte")).toHaveCount(0);
  await expect.poll(async () => JSON.stringify(await storedText(request, id))).toContain("A warm hat Cold.");
  const typed = await storedText(request, id);

  // Outside the text, the page's history: back to the very bytes it started from, and forward again.
  await page.keyboard.press("Control+z");
  await expect.poll(() => storedText(request, id)).toEqual(START_TEXT);
  expect(JSON.stringify(await storedText(request, id))).toBe(JSON.stringify(START_TEXT));
  await page.keyboard.press("Control+Shift+Z");
  await expect.poll(() => storedText(request, id)).toEqual(typed);

  // Inside it, TipTap's: the typing undone and redone where the caret is.
  await openText(page);
  await page.keyboard.press("Control+End");
  await page.keyboard.type(" Warm.");
  await expect(editor(page).locator("li").last()).toHaveText("A warm hat Cold. Warm.");
  await page.keyboard.press("Control+z");
  await expect(editor(page).locator("li").last()).toHaveText("A warm hat Cold.");
  await page.keyboard.press("Control+Shift+Z");
  await expect(editor(page).locator("li").last()).toHaveText("A warm hat Cold. Warm.");
  await page.keyboard.press("Control+z");
  await expect(editor(page).locator("li").last()).toHaveText("A warm hat Cold.");
  await page.keyboard.press("Escape");
  // What the text came back to is what the page holds: nothing more was kept.
  await expect(page.locator(".topbar .save-state")).toHaveText("Saved");
  expect(await storedText(request, id)).toEqual(typed);
});

test("bold, italic and a link from the block's bar; a refused address says why on the field; Ctrl+U does nothing", async ({ page, request }) => {
  const { id } = await makePage(request, "Format", [section("s", "Story", [column("c1", [widget("t", "text", { doc: { type: "doc", content: [p(t("Swim at slack water"))] } })])])]);
  await open(page, id);
  await openText(page);
  // The word "slack", selected by the keys.
  await page.keyboard.press("Control+Home");
  for (let i = 0; i < 8; i += 1) await page.keyboard.press("ArrowRight");
  for (let i = 0; i < 5; i += 1) await page.keyboard.press("Shift+ArrowRight");
  const bar = page.locator('.canvas [data-block-id="t"] .ov-bar');
  await expect(bar.getByRole("group", { name: "Formatting" })).toBeVisible();
  await bar.getByRole("button", { name: "Bold" }).click();
  await expect(bar.getByRole("button", { name: "Bold" })).toHaveAttribute("aria-pressed", "true");
  await expect(editor(page)).toBeFocused();
  await bar.getByRole("button", { name: "Italic" }).click();
  await page.keyboard.press("Control+u");
  await expect(editor(page).locator("u")).toHaveCount(0);

  await bar.getByRole("button", { name: "Link" }).click();
  const field = page.getByRole("combobox", { name: "Link to" });
  await expect(field).toBeFocused();
  await field.fill("javascript:alert(1)");
  await field.press("Enter");
  await expect(field).toHaveAttribute("aria-invalid", "true");
  await expect(page.locator(".ov-link .error")).toHaveText(/A link cannot go to a javascript: address\./);
  await field.fill("example.org/tides");
  await field.press("Enter");
  await expect(page.locator(".ov-link .error")).toHaveText("Start the address with https:// (https://example.org/tides), or with / for a page of this site.");
  await field.fill("/tides");
  await page.getByRole("button", { name: "Add link" }).click();
  await expect(page.locator(".ov-link")).toHaveCount(0);
  await expect(editor(page)).toBeFocused();
  await expect(editor(page).locator('a[href="/tides"]')).toHaveText("slack");
  await page.keyboard.press("Escape");
  await expect.poll(() => storedText(request, id)).toEqual({
    type: "doc",
    content: [p(t("Swim at "), t("slack", { type: "bold" }, { type: "italic" }, { type: "link", attrs: { href: "/tides" } }), t(" water"))],
  });
});

test("the editor and its link field have nothing axe finds serious", { tag: "@a11y" }, async ({ page, request }) => {
  const { id } = await makePage(request, "Text a11y", fixture());
  await open(page, id);
  await openText(page);
  await page.keyboard.press("Control+k");
  await expect(page.getByRole("combobox", { name: "Link to" })).toBeFocused();
  const report = await axe(page);
  expect(report.serious).toEqual([]);
  expect(report.passes).toBeGreaterThan(10);
  // Esc in the field goes back to the text, and Esc in the text to the block.
  await page.keyboard.press("Escape");
  await expect(editor(page)).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(block(page, "t")).toBeFocused();
});

// A paste as the browser delivers one: a clipboard event carrying HTML.
async function pasteHtml(page: Page, html: string) {
  await editor(page).evaluate((element, markup) => {
    const data = new DataTransfer();
    data.setData("text/html", markup);
    data.setData("text/plain", "plain words");
    element.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
  }, html);
}

test("a word processor's paste keeps only what the schema allows, and the CMS saves it", async ({ page, request }) => {
  const { id } = await makePage(request, "Paste word", [section("s", "Story", [column("c1", [widget("t", "text", { doc: { type: "doc", content: [p(t("Paste here"))] } })])])]);
  await open(page, id);
  await openText(page);
  await pasteHtml(page, pasteFixture("word-processor.html"));
  await page.keyboard.press("Escape");
  await expect.poll(async () => JSON.stringify(await storedText(request, id))).toContain("Saturday 07:15");
  const stored = JSON.stringify(await storedText(request, id));
  expect(stored).toContain('{"type":"text","text":"Winter swims","marks":[{"type":"bold"}]}');
  expect(stored).toContain('{"type":"link","attrs":{"href":"https://swims.example.org/book"}}');
  expect(stored).not.toMatch(/·|mso|Body Sans|Map of the bay|clip_image/);
});

test("a web page copied in the browser and pasted keeps only what the schema allows, and the CMS saves it", async ({ page, request, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const { id } = await makePage(request, "Paste web", [section("s", "Story", [column("c1", [widget("t", "text", { doc: { type: "doc", content: [p(t("Paste here"))] } })])])]);
  // The web page, in a tab of its own: everything on it selected and copied.
  const source = await context.newPage();
  source.on("dialog", (dialog) => void dialog.dismiss());
  await source.setContent(pasteFixture("web-page.html"));
  await source.keyboard.press("Control+a");
  await source.keyboard.press("Control+c");
  await source.close();
  await open(page, id);
  await openText(page);
  await page.keyboard.press("Control+v");
  await expect(editor(page).locator("li").first()).toHaveText("A towel");
  await page.keyboard.press("Escape");
  await expect.poll(async () => JSON.stringify(await storedText(request, id))).toContain("Tide times");
  const stored = JSON.stringify(await storedText(request, id));
  expect(stored).toContain('{"type":"text","text":"twice a day","marks":[{"type":"bold"}]}');
  expect(stored).toContain('{"type":"link","attrs":{"href":"https://swims.example.org/tides"}}');
  expect(stored).not.toMatch(/alert|javascript|drawn words|typed words|Press|notice|chart of the tide|title|external/);
});

test("the text editor's code is fetched only once a text is selected", async ({ page, request }) => {
  const { id } = await makePage(request, "On demand", fixture());
  const fetched: string[] = [];
  page.on("request", (r) => fetched.push(r.url()));
  await open(page, id);
  await block(page, "h").click();
  await expect(block(page, "h")).toHaveAttribute("data-editor-selected", "true");
  expect(fetched.filter((url) => /rich\/TextEditor|@tiptap_core|@tiptap\/core|prosemirror/.test(url))).toEqual([]);
  await block(page, "t").click();
  await expect.poll(() => fetched.filter((url) => /rich\/TextEditor/.test(url)).length).toBeGreaterThan(0);
});

// A plain-text paste as the browser delivers one.
async function pastePlain(page: Page, words: string) {
  await editor(page).evaluate((element, text) => {
    const data = new DataTransfer();
    data.setData("text/plain", text);
    element.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
  }, words);
}

const LINES = (count: number) => Array.from({ length: count }, (_, n) => `line ${n}`).join("\n");
const notice = (page: Page) => page.locator(".notice");
const CUT = "Only the start of the paste was kept: a text holds at most 500 paragraphs and lists.";

// What the person does next, with the text still being written.
const NEXT: Array<[string, (page: Page) => Promise<void>, (stored: string) => void]> = [
  ["Esc", async (page) => { await page.keyboard.press("Escape"); }, () => {}],
  ["a drag of the block", async (page) => {
    await pickUp(page, grip(page));
    await moveOnto(page, block(page, "c2"), "bottom");
    await page.mouse.up();
    await expect.poll(() => childIds(page, "c2")).toEqual(["d", "t"]);
  }, () => {}],
  ["Duplicate on the block's bar", async (page) => {
    await page.locator('.canvas [data-block-id="t"] .ov-bar').getByRole("button", { name: /^Duplicate / }).click();
    await expect(page.locator('.canvas [data-block-type="text"]')).toHaveCount(2);
  }, () => {}],
];

for (const [what, next] of NEXT) {
  test(`a paste of 501 lines is cut to what the page takes, and the words typed around it survive ${what}`, async ({ page, request }) => {
    const { id } = await makePage(request, `Paste past ${what}`, [
      section("s", "Story", [column("c1", [widget("t", "text", { doc: { type: "doc", content: [p(t("Start"))] } }), heading("h", "Alpha")]), column("c2", [widget("d", "divider", {})])]),
    ]);
    await open(page, id);
    await openText(page);
    await page.keyboard.press("Control+End");
    await page.keyboard.type(" typed-before");
    await pastePlain(page, LINES(501));
    await expect(notice(page)).toContainText(CUT);
    await page.keyboard.type(" typed-after");
    await next(page);
    await expect(page.locator(".topbar .save-state")).toHaveText("Saved", { timeout: 15_000 });
    const stored = JSON.stringify(findBlock((await draftOf(request, id)).document.sections, "t")?.props.doc);
    expect(stored).toContain("Start typed-beforeline 0");
    expect(stored).toContain("line 499 typed-after");
    expect(stored).not.toContain("line 500");
  });
}

test("Undo after a paste cut to fit takes back the paste and the words typed with it, and Redo brings them back", async ({ page, request }) => {
  const { id } = await makePage(request, "Paste then undo", [section("s", "Story", [column("c1", [widget("t", "text", { doc: { type: "doc", content: [p(t("Start"))] } }), heading("h", "Alpha")])])]);
  await open(page, id);
  await openText(page);
  await page.keyboard.press("Control+End");
  await page.keyboard.type(" first words");
  // A pause: the first words become a step of their own.
  await expect.poll(() => storedText(request, id).then((doc) => JSON.stringify(doc))).toContain("first words");
  await page.keyboard.type(" typed-before");
  await pastePlain(page, LINES(501));
  await page.keyboard.type(" typed-after");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.locator(".canvas .rte")).toHaveCount(0);
  await expect(page.locator(".topbar .save-state")).toHaveText("Saved", { timeout: 15_000 });
  let stored = JSON.stringify(await storedText(request, id));
  expect(stored).toContain("Start first words");
  expect(stored).not.toContain("typed-before");
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect.poll(async () => JSON.stringify(await storedText(request, id))).toContain("line 499 typed-after");
  stored = JSON.stringify(await storedText(request, id));
  expect(stored).toContain("Start first words typed-beforeline 0");
});

test("Enter and Tab in a list stop at the depth the page takes, say so, and every word typed is kept", async ({ page, request }) => {
  const { id } = await makePage(request, "Deep list", [section("s", "Story", [column("c1", [widget("t", "text", { doc: { type: "doc", content: [{ type: "bulletList", content: [{ type: "listItem", content: [p(t("level0"))] }] }] } })])])]);
  await open(page, id);
  await openText(page);
  await page.keyboard.press("Control+End");
  for (let level = 1; level <= 14; level += 1) {
    await page.keyboard.press("Enter");
    await page.keyboard.press("Tab");
    await page.keyboard.type(`level${level}`);
  }
  await expect(notice(page)).toContainText("Not done: lists cannot be nested any deeper in a text.");
  await page.keyboard.press("Escape");
  await expect(page.locator(".topbar .save-state")).toHaveText("Saved", { timeout: 15_000 });
  const stored = JSON.stringify(await storedText(request, id));
  for (let level = 0; level <= 14; level += 1) expect(stored).toContain(`"level${level}"`);
  await expect(block(page, "t").locator("ul")).toHaveCount(12);
});
