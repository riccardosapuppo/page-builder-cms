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

// The floating bar's grip of the selected block.
export function grip(page: Page): Locator {
  return page.locator(".canvas [data-grip]");
}
