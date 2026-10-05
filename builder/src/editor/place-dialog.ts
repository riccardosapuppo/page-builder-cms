// Where a window stands when it asks for something at a place on the page:
// a key was dropped at the yellow line, and what it needs first (an image,
// images, a video, a picture) is asked for in a window. That window opens
// at the drop place (the owner's request of 4 October 2026): beside the
// line, as the "+" picker stands beside its "+", and never over it, since
// the line is the one cue to where the block will land.
//
// The video window is narrow enough to stand beside a line, on the side
// with room; the media library, 1060 wide, is not, so it stands above the
// line or under it, made shorter to fit the room there (its list scrolls).
// When there is no room above or below either (a window 768 or 720 high,
// a line in the middle of it), the page is moved: the line brought near
// the top of the canvas, with the window under it, or near its foot, with
// the window over it, as far as the page scrolls; and where the page ends
// too soon for either (a short page, or the last column of a long one,
// already scrolled to its end), the canvas is given room at its foot for
// as long as the window is open, so the line can still go near its top.
//
// placeBeside is the choice for a line where it is, and moveFor the move
// of the page that gives it one, functions of boxes and nothing else;
// standBeside reads the boxes from the page and sets the window's style,
// keepBeside stands it again while it is open if the page changes under
// it, and leaveBeside gives the canvas's room back when it closes.

export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface Stand {
  left: number;
  top: number;
  // Set when the window must be shorter than it is: its own scroll box
  // takes up the difference.
  height: number | null;
  side: "right" | "left" | "below" | "above";
}

export interface StandOptions {
  // Space between the line and the window.
  gap?: number;
  // Space kept free at every edge of the view.
  margin?: number;
  // The shortest a window may be made to fit above or below the line.
  minHeight?: number;
}

const GAP = 24;
const MARGIN = 8;
const MIN_HEIGHT = 420;

// A window of `size` beside `line` in a view of `view`, in the view's own
// coordinates: on the right of the line, else on its left, when the whole
// width fits there; else under the line or over it, wherever there is the
// room, shortened to the room when it must be, down to minHeight. Null when
// none of those gives it room.
export function placeBeside(line: Box, view: Size, size: Size, options: StandOptions = {}): Stand | null {
  const gap = options.gap ?? GAP;
  const margin = options.margin ?? MARGIN;
  const tallest = view.height - 2 * margin;
  const height = Math.min(size.height, tallest);
  const shorter = height < size.height ? height : null;
  const middle = (line.top + line.bottom) / 2;
  const keep = (top: number, tall: number) => Math.max(margin, Math.min(top, view.height - margin - tall));

  if (line.right + gap + size.width <= view.width - margin) {
    return { left: line.right + gap, top: keep(middle - height / 2, height), height: shorter, side: "right" };
  }
  if (line.left - gap - size.width >= margin) {
    return { left: line.left - gap - size.width, top: keep(middle - height / 2, height), height: shorter, side: "left" };
  }

  if (size.width > view.width - 2 * margin) return null;
  const left = Math.max(margin, Math.min((line.left + line.right) / 2 - size.width / 2, view.width - margin - size.width));
  const below = view.height - margin - (line.bottom + gap);
  const above = line.top - gap - margin;
  const needs = Math.min(size.height, options.minHeight ?? MIN_HEIGHT);
  const side = below >= size.height ? "below" : above >= size.height ? "above" : below >= above ? "below" : "above";
  const room = side === "below" ? below : above;
  if (room < needs) return null;
  const tall = Math.min(size.height, room);
  return {
    left,
    top: side === "below" ? line.bottom + gap : line.top - gap - tall,
    height: tall < size.height ? tall : null,
    side,
  };
}

// How far inside the canvas's edge a line moved to its top or its foot is
// brought.
const EDGE = 12;

// The canvas's scroll: where it is, the height it shows, and the height of
// the page it holds, which may be less than what it shows (then it does
// not scroll at all, and room added at its foot first fills the rest).
export interface Scroll {
  top: number;
  client: number;
  content: number;
}

// A move of the canvas that gives a window a place: scroll it by `by`
// (down when positive), after adding `room` at its foot, and the window
// stands at `stand`.
export interface Move {
  by: number;
  room: number;
  stand: Stand;
}

// The least move of the canvas (`frame`, scrolled as `scroll` says) that
// gives a window of `size` a place beside `line`, which is in its view:
// none, if the line has one where it is; else the line brought near the
// canvas's top, as far as the page scrolls; else near its foot, as far as
// the page scrolls back; else near its top with the room the page lacks
// added at its foot. Null when even that gives none (a view too small).
export function moveFor(line: Box, frame: Box, scroll: Scroll, view: Size, size: Size, options: StandOptions = {}): Move | null {
  const free = Math.max(0, scroll.content - scroll.client) - scroll.top;
  const within = (by: number) => Math.max(-scroll.top, Math.min(by, free));
  const toTop = line.top - (frame.top + EDGE);
  const toFoot = line.bottom - (frame.bottom - EDGE);
  const tries = [{ by: 0, room: 0 }, { by: within(toTop), room: 0 }, { by: within(toFoot), room: 0 }];
  // Scrolled to top + toTop, the canvas shows down to that plus its own
  // height: what the page lacks of that is the room.
  if (toTop > free) tries.push({ by: toTop, room: scroll.top + toTop + scroll.client - scroll.content });
  for (const { by, room } of tries) {
    const stand = placeBeside({ ...line, top: line.top - by, bottom: line.bottom - by }, view, size, options);
    if (stand) return { by, room, stand };
  }
  return null;
}

const boxOf = (element: Element): Box => {
  const { left, top, right, bottom } = element.getBoundingClientRect();
  return { left, top, right, bottom };
};

// Takes away the room a window gave the canvas at its foot (moveFor), if
// any: the canvas scrolls back as far as the page then goes.
function leaveBeside(): void {
  for (const canvas of document.querySelectorAll<HTMLElement>(".canvas[data-room]")) {
    canvas.style.removeProperty("padding-bottom");
    delete canvas.dataset.room;
  }
}

// The height of the page the canvas holds, from the top of its scroll: its
// scroll height says it only when the page is taller than the canvas, so
// it is read with a room at the foot that makes it so, then taken away.
function pageHeight(canvas: HTMLElement): number {
  const probe = canvas.clientHeight;
  canvas.style.paddingBottom = `${probe}px`;
  const height = canvas.scrollHeight - probe;
  canvas.style.removeProperty("padding-bottom");
  return height;
}

// Puts `dialog` (a fixed-position window, centred by the stylesheet) beside
// the element `selector` finds, and says where it went (data-beside), or
// leaves it centred when there is no such element or no room anywhere. The
// canvas is scrolled first if the line is out of its view, and moved again
// (moveFor) when the window has no room beside, over or under it there.
function standBeside(dialog: HTMLElement, selector: string): Stand | null {
  dialog.style.cssText = "";
  delete dialog.dataset.beside;
  leaveBeside();
  const anchor = document.querySelector<HTMLElement>(selector);
  if (!anchor) return null;
  const size: Size = { width: dialog.offsetWidth, height: dialog.offsetHeight };
  const view: Size = { width: document.documentElement.clientWidth, height: document.documentElement.clientHeight };
  const canvas = anchor.closest<HTMLElement>(".canvas");

  let line = boxOf(anchor);
  if (canvas) {
    const frame = boxOf(canvas);
    if (line.top < frame.top || line.bottom > frame.bottom) {
      anchor.scrollIntoView({ block: "center", inline: "nearest" });
      line = boxOf(anchor);
    }
    const move = moveFor(line, frame, { top: canvas.scrollTop, client: canvas.clientHeight, content: pageHeight(canvas) }, view, size);
    if (move && move.room > 0) {
      canvas.style.paddingBottom = `${Math.ceil(move.room)}px`;
      canvas.dataset.room = String(Math.ceil(move.room));
    }
    if (move && move.by !== 0) {
      canvas.scrollTop += move.by;
      line = boxOf(anchor);
    }
  }
  const stand = placeBeside(line, view, size);
  if (!stand) {
    leaveBeside();
    return null;
  }

  dialog.style.left = `${stand.left}px`;
  dialog.style.top = `${stand.top}px`;
  dialog.style.transform = "none";
  if (stand.height !== null) dialog.style.height = `${stand.height}px`;
  dialog.dataset.beside = stand.side;
  return stand;
}

const sameBox = (a: Box | null, b: Box | null): boolean =>
  a === b || (a !== null && b !== null && a.left === b.left && a.top === b.top && a.right === b.right && a.bottom === b.bottom);

// Keeps `dialog` beside the element `selector` finds while it is open:
// stood there now (standBeside), and again when the line has moved. The
// page may change under a window that is open: grow or shrink above the
// line, as an image of another site does, which has no size until it
// arrives and is drawn lazily, once the canvas has scrolled to it. Such a
// change is seen once it is laid out (the page's size, watched with the
// element the Canvas's own observer watches, so the box of a page drawn
// smaller has followed it by then), and the window is stood again in the
// next frame if the line moved; the browser's window changing size stands
// it again at once. Returns what undoes it all, the canvas's room included.
export function keepBeside(dialog: HTMLElement, selector: string): () => void {
  const lineNow = (): Box | null => {
    const anchor = document.querySelector(selector);
    return anchor ? boxOf(anchor) : null;
  };
  let left: Box | null = null;
  const stand = () => {
    standBeside(dialog, selector);
    left = lineNow();
  };
  let next = 0;
  const check = () => {
    next = 0;
    if (!sameBox(lineNow(), left)) stand();
  };
  const later = () => {
    if (next === 0) next = requestAnimationFrame(check);
  };

  stand();
  const page = document.querySelector(selector)?.closest(".canvas")?.querySelector(".frame") ?? null;
  const resized = new ResizeObserver(later);
  if (page) resized.observe(page);
  window.addEventListener("resize", stand);
  return () => {
    if (next !== 0) cancelAnimationFrame(next);
    resized.disconnect();
    window.removeEventListener("resize", stand);
    leaveBeside();
  };
}
