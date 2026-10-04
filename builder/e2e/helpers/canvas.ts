// The canvas, as the browser tests read and drive it.
//
// A drag library may leave an inert, hidden copy of what is dragged in the
// page while the drag lasts (dnd-kit's placeholder: inert, aria-hidden,
// data-dnd-placeholder), with the same data-block-id as the block: these
// helpers never count it as the block. Being inert is what tells it
// apart: a block of the page may be aria-hidden itself (a spacer is). The
// editor's drag draws the store's preview instead and asks the library
// for no copy, but a test must not depend on that to find the right
// element.
import type { Locator, Page } from "@playwright/test";

const NOT_A_COPY = ":not([inert], [inert] *, [data-dnd-placeholder], [data-dnd-placeholder] *, [data-dnd-overlay] *)";

// The canvas's element for a block.
export function block(page: Page, id: string): Locator {
  return page.locator(`.canvas [data-block-id="${id}"]${NOT_A_COPY}`);
}

// The blocks directly inside a container of the canvas, in order: their
// ids, as the page shows them now.
export async function childIds(page: Page, id: string): Promise<string[]> {
  // A section's columns sit in its .sw-inner row.
  return block(page, id)
    .locator(`:scope > [data-block-id]${NOT_A_COPY}, :scope > .sw-inner > [data-block-id]${NOT_A_COPY}`)
    .evaluateAll((elements) => elements.map((e) => (e as HTMLElement).dataset.blockId ?? ""));
}

// The page's sections, then each one's columns and widgets, as ids.
export async function canvasShape(page: Page): Promise<unknown> {
  return page.locator(`.canvas .sw-main > [data-block-id]${NOT_A_COPY}`).evaluateAll((sections) => sections.map((s) => {
    const kids = (e: Element) => [...e.children].filter((c) => c instanceof HTMLElement && c.dataset.blockId !== undefined && !c.closest("[inert], [data-dnd-placeholder]")) as HTMLElement[];
    // A section's columns sit in its .cols row.
    const row = s.querySelector(":scope > .sw-inner") ?? s;
    return [(s as HTMLElement).dataset.blockId, kids(row).map((c) => [c.dataset.blockId, kids(c).map((w) => w.dataset.blockId)])];
  }));
}

export interface Spot {
  x: number;
  y: number;
}

// A point of an element: its middle, or a few pixels inside its top or
// bottom edge, or a fraction of its height.
export async function spot(target: Locator, where: "top" | "bottom" | "middle" | number = "middle"): Promise<Spot> {
  const box = await target.boundingBox();
  if (!box) throw new Error("the element is not on screen");
  const y = where === "top" ? box.y + 6 : where === "bottom" ? box.y + box.height - 6 : where === "middle" ? box.y + box.height / 2 : box.y + box.height * where;
  return { x: box.x + box.width / 2, y };
}

// Presses the mouse on a handle, moves it in steps past the drag's start
// distance and on to each point in turn, and leaves it there, pressed.
export async function pickUp(page: Page, handle: Locator): Promise<void> {
  await handle.scrollIntoViewIfNeeded();
  const from = await spot(handle);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 8, from.y + 8, { steps: 4 });
}

// Moves the pressed mouse onto a point of an element, brought first to the
// middle of the canvas, away from the edges where the canvas scrolls by
// itself under a pointer that stands still.
export async function moveOnto(page: Page, target: Locator, where: Parameters<typeof spot>[1] = "middle"): Promise<void> {
  await target.evaluate((element) => element.scrollIntoView({ block: "center", inline: "nearest" }));
  const to = await spot(target, where);
  await page.mouse.move(to.x, to.y, { steps: 12 });
  // One more small move where it stands, as a hand does.
  await page.mouse.move(to.x + 1, to.y + 1, { steps: 2 });
}

// The live region's sentence while a block is dragged.
export function caption(page: Page): Locator {
  return page.locator(".live-caption");
}

// The grip of the selected block's clamp.
export function grip(page: Page): Locator {
  return page.locator(".canvas .clamp [data-grip]");
}

// The text editor open in a text block, once it has the focus and
// ProseMirror is done taking it: for 200 ms after the editor takes the
// focus, ProseMirror reads a caret at the very start of the text as one
// the browser put there by itself and puts its own back, so a Ctrl+Home
// pressed at once would be undone (and at 20 ms it may put its own back
// in any case). A person is never that fast; a test is, so it waits, on
// the editor's own record of when it took the focus.
// The words selected in the text editor open in a text block, as the editor
// itself holds them (not the browser's selection): ProseMirror reads a
// selection the browser's own keys made (Shift and an arrow) on the
// browser's next selectionchange event, which a test's next key may beat.
// A person's next key comes later; a test waits for the editor to have it.
export async function selectedText(page: Page, id: string): Promise<string | null> {
  return page.evaluate((blockId) => {
    const dom = document.querySelector(`.canvas [data-block-id="${blockId}"] .rte`) as (Element & { editor?: { state: { selection: { from: number; to: number }; doc: { textBetween(from: number, to: number): string } } } }) | null;
    const state = dom?.editor?.state;
    return state ? state.doc.textBetween(state.selection.from, state.selection.to) : null;
  }, id);
}

export async function settledTextEditor(page: Page, id: string): Promise<Locator> {
  const editor = page.locator(`.canvas [data-block-id="${id}"] .rte`);
  await page.waitForFunction((blockId) => {
    const dom = document.querySelector(`.canvas [data-block-id="${blockId}"] .rte`) as (Element & { editor?: { view?: { input?: { lastFocus?: number } } } }) | null;
    const lastFocus = dom?.editor?.view?.input?.lastFocus;
    return dom !== null && document.activeElement === dom && typeof lastFocus === "number" && Date.now() - lastFocus > 250;
  }, id);
  return editor;
}

// What is wrong with where the selected block's clamp stands, by the
// approved layout's rules (design/layout/NOTES.md, section 4.2, and the
// check its photographs were taken with): over its own block, into
// a column beside it, over any words of the page, its head hidden under
// something else (a drawer, a picker), or without its moves (Move up and
// down, or left and right for a column). Nothing, when all is well. A
// section's clamp sits inside it, in its margin, so only its words count.
export async function clampFaults(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const bad: string[] = [];
    const r = (el: Element) => el.getBoundingClientRect();
    const hit = (a: DOMRect, b: DOMRect) => a.left < b.right - 0.5 && a.right > b.left + 0.5 && a.top < b.bottom - 0.5 && a.bottom > b.top + 0.5;
    const range = document.createRange();
    for (const clamp of document.querySelectorAll<HTMLElement>(".canvas .clamp")) {
      const name = clamp.getAttribute("aria-label") ?? "a clamp";
      const box = r(clamp);
      const own = clamp.parentElement as HTMLElement;
      const section = own.dataset.blockType === "section";
      if (!section && hit(box, r(own))) bad.push(`${name}: over its own block`);
      const column = own.dataset.blockType === "column" ? own : own.closest<HTMLElement>("[data-block-type=column]");
      for (const other of column?.parentElement?.children ?? []) {
        if (other === column || !(other instanceof HTMLElement) || other.dataset.blockType !== "column") continue;
        const o = r(other);
        if (hit(box, o)) bad.push(`${name}: reaches ${Math.round(Math.min(box.right, o.right) - Math.max(box.left, o.left))} px into the column beside it`);
      }
      // The page's words under it, its own block's (a section's) included.
      const walker = document.createTreeWalker(document.querySelector(".canvas .site")!, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (!node.textContent?.trim() || node.parentElement?.closest(".clamp, .ov, .ins, .ins-empty, .seam-tip, [data-theme-part]")) continue;
        range.selectNodeContents(node);
        if ([...range.getClientRects()].some((line) => hit(box, line))) bad.push(`${name}: over the words "${node.textContent.trim().slice(0, 30)}"`);
      }
      if (!clamp.classList.contains("clamp-text")) {
        const labels = [...clamp.querySelectorAll(":scope > button")].map((key) => key.getAttribute("aria-label"));
        const wants = own.dataset.blockType === "column" ? ["Move left", "Move right"] : ["Move up", "Move down"];
        for (const want of wants) if (!labels.includes(want)) bad.push(`${name}: no ${want}`);
      }
      const head = clamp.querySelector(".clamp-head");
      if (head) {
        const h = r(head);
        const top = document.elementFromPoint(h.left + h.width / 2, h.top + h.height / 2);
        if (!top || !clamp.contains(top)) bad.push(`${name}: its head is hidden under ${top ? `${top.tagName.toLowerCase()}.${[...top.classList].join(".")}` : "nothing"}`);
      }
    }
    return bad;
  });
}

// The selected block's clamp: its size, the side of the block it stands
// on, and whether it is tied to the selection's frame.
export async function clampPlace(page: Page): Promise<{ size: string; side: string; tie: string } | null> {
  return page.evaluate(() => {
    const clamp = document.querySelector<HTMLElement>(".canvas .clamp");
    return clamp ? { size: clamp.dataset.size ?? "", side: clamp.dataset.side ?? "", tie: clamp.dataset.tie ?? "" } : null;
  });
}
