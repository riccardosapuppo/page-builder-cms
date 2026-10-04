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
// When there is no room above or below either, the page is moved so that
// the line is near the top of the canvas and the window goes under it.
//
// placeBeside is the choice, a function of boxes and nothing else;
// standBeside reads the boxes from the page and sets the window's style.

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

const boxOf = (element: Element): Box => {
  const { left, top, right, bottom } = element.getBoundingClientRect();
  return { left, top, right, bottom };
};

// Puts `dialog` (a fixed-position window, centred by the stylesheet) beside
// the element `selector` finds, and says where it went (data-beside), or
// leaves it centred when there is no such element or no room anywhere. The
// canvas is scrolled first if the line is out of its view, and again when
// the window has no room above or below it.
export function standBeside(dialog: HTMLElement, selector: string): Stand | null {
  dialog.style.cssText = "";
  delete dialog.dataset.beside;
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
  }
  let stand = placeBeside(line, view, size);
  if (!stand && canvas) {
    canvas.scrollTop += line.top - (boxOf(canvas).top + 12);
    line = boxOf(anchor);
    stand = placeBeside(line, view, size);
  }
  if (!stand) return null;

  dialog.style.left = `${stand.left}px`;
  dialog.style.top = `${stand.top}px`;
  dialog.style.transform = "none";
  if (stand.height !== null) dialog.style.height = `${stand.height}px`;
  dialog.dataset.beside = stand.side;
  return stand;
}
