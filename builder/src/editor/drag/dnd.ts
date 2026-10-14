// The drag library, @dnd-kit 0.5.0, behind this one module: it is a 0.x
// release, pinned exactly, and an upgrade should have one file to read.
// Nothing else in the editor imports it.
//
// What the editor takes from it: the pointer and keyboard sensors, the
// collision with what is under the pointer, the drop target, the overlay
// that follows the pointer, and the auto-scroll near the edges of the
// canvas and of the Outline.
// What it does not take: the library's own feedback (moving or cloning
// the dragged element: the canvas draws the store's preview instead, so
// React keeps every element of the page) and its announcements (the
// editor's live region says where the block will go, in its own words).
import { CollisionPriority, type CollisionDetector, type Plugins } from "@dnd-kit/abstract";
import { pointerIntersection } from "@dnd-kit/collision";
import { Accessibility, AutoScroller, KeyboardSensor, PointerActivationConstraints, PointerSensor, type DragDropManager } from "@dnd-kit/dom";
import { isKeyboardEvent } from "@dnd-kit/dom/utilities";
import { useDroppable, type UseDroppableInput } from "@dnd-kit/react";
import { containerPriority } from "../../document/drag.ts";
import { sensorCodes } from "../keymap.ts";

export { DragDropProvider, DragOverlay, useDraggable } from "@dnd-kit/react";
export type { DragDropManager };
export { isKeyboardEvent };

// The plugins of the library's default preset but its announcements, and
// an auto-scroll that starts only in the last tenth of the canvas: the
// default fifth of a canvas 850 high would scroll the page under a
// pointer aiming at a block near its foot.
export function plugins(defaults: Plugins<DragDropManager>): Plugins<DragDropManager> {
  return defaults
    .filter((plugin) => plugin !== Accessibility)
    .map((plugin) => (plugin === AutoScroller ? AutoScroller.configure({ threshold: 0.1 }) : plugin));
}

// The source of a drag from the canvas: its selected block, carried by
// the clamp's grip with the mouse and by the keymap's keys (Space) on
// the block itself or the grip.
export const SELECTION_SOURCE = "canvas-selection";

const onGrip = (target: EventTarget | null): boolean => target instanceof Element && target.closest("[data-grip]") !== null;

export const SELECTION_SENSORS = [
  PointerSensor.configure({
    // Only a grip starts a drag: a press anywhere else on a block selects
    // it, and its text can be selected as on any page.
    preventActivation: (event) => !onGrip(event.target),
    activationConstraints: [new PointerActivationConstraints.Distance({ value: 4 })],
    // A press is heard anywhere on the page, not only on the selected
    // block's box: the clamp's grip stands in the margin beside it. The
    // drag carries whatever is selected when it starts.
    activatorElements: (source) => {
      const page = source.element?.closest(".canvas .frame") ?? source.element;
      return page ? [page] : [];
    },
  }),
  KeyboardSensor.configure({
    keyboardCodes: sensorCodes(),
    preventActivation: (event, source) => event.target !== source.element && !onGrip(event.target),
  }),
];

// A key of the Insert drawer or of a "+" picker is dragged with the mouse,
// with a finger once it has been held still a quarter of a second (a
// finger that moves at once scrolls the drawer, a sheet on a phone), or
// picked up by the keymap's Space (pickUpTile) and moved with its keys, as
// a block of the canvas is. Enter stays the button's own: it adds the
// block where the drawer's sentence, or the picker's line, says.
export const TILE_SENSORS = [
  PointerSensor.configure({
    // A mouse's press that does not move is a click, however long it lasts.
    activationConstraints: (event) => (event.pointerType === "touch"
      ? [new PointerActivationConstraints.Delay({ value: 250, tolerance: 8 })]
      : [new PointerActivationConstraints.Distance({ value: 5 })]),
  }),
  KeyboardSensor.configure({ keyboardCodes: sensorCodes() }),
];

// A row of the Outline (../Navigator.tsx): dragged with the mouse once it
// has moved 4 pixels, with a finger once it has been held still a quarter
// of a second (a finger that moves at once scrolls the list), or picked up
// with Space and moved with the arrows, as a block of the canvas is. A
// press belongs to the innermost row under it, never to the rows around
// it, and the row's chevron and "…" keep their clicks.
const rowPressed = (target: EventTarget | null, row: Element | undefined): boolean =>
  target instanceof Element && target.closest("[role=treeitem]") === row && target.closest(".t-chev, .t-more") === null;

export const ROW_SENSORS = [
  PointerSensor.configure({
    activationConstraints: (event) => (event.pointerType === "touch"
      ? [new PointerActivationConstraints.Delay({ value: 250, tolerance: 8 })]
      : [new PointerActivationConstraints.Distance({ value: 4 })]),
    preventActivation: (event, source) => !rowPressed(event.target, source.element),
  }),
  KeyboardSensor.configure({ keyboardCodes: sensorCodes() }),
];

// The library's ids for a row, as a source and as a target; the canvas's
// targets are the blocks' own ids, which hold no colon.
export const rowSource = (id: string): string => `row-source:${id}`;
export const rowTarget = (id: string): string => `row:${id}`;
export const rowOfTarget = (id: string): string | null => (id.startsWith("row:") ? id.slice("row:".length) : null);

// The library's collision priority for a container: one with children
// ranks below them (low), an empty one keeps the default (none given).
export function collisionPriority(children: number): CollisionPriority | undefined {
  return containerPriority(children) === "low" ? CollisionPriority.Low : undefined;
}

// Insert floats over the canvas (../Drawer.tsx), and so do every drawer
// and the sidebar in a tablet's or a phone's window (../layout-mode.ts);
// the library measures its targets' shapes, not what lies on top of them:
// a pointer over one would land on the hidden block under it, and a key of
// Insert, picked up there, would already be on its way into that block.
// Over such a panel, the pointer is on nothing of the page (History holds
// none of its blocks; the Outline's rows are targets of their own, for a
// row's drag: useRowTarget). A panel that gives way while one of its keys
// is dragged (Insert on a phone: unseen, out of the pointer's way) covers
// nothing.
const OVER_CANVAS = '.drawer, .app:is([data-layout="medium"], [data-layout="narrow"]) .sidebar';

function overDrawer(point: { x: number; y: number }): boolean {
  for (const panel of document.querySelectorAll(OVER_CANVAS)) {
    if (getComputedStyle(panel).pointerEvents === "none") continue;
    const box = panel.getBoundingClientRect();
    if (point.x >= box.left && point.x <= box.right && point.y >= box.top && point.y <= box.bottom) return true;
  }
  return false;
}

// What is under the pointer, and nothing else, is a target: a shaded area
// is not a place, even with a target close by.
const UNDER: CollisionDetector = (input) => {
  const point = input.dragOperation.position.current;
  return point && overDrawer(point) ? null : pointerIntersection(input);
};

// A target that ranks low says so in its collisions; the library's hook
// would read a priority given to the target only when it is made, and the
// priority follows the drag.
const LOW: CollisionDetector = (input) => {
  const collision = UNDER(input);
  return collision ? { ...collision, priority: CollisionPriority.Low } : null;
};

export function useDropTarget(input: Omit<UseDroppableInput, "collisionDetector">, priority: CollisionPriority | undefined) {
  return useDroppable({ ...input, collisionDetector: priority === CollisionPriority.Low ? LOW : UNDER });
}

// A row of the Outline as a target, for a row's drag alone: what the
// pointer is over in the drawer, which the canvas's targets leave out.
export function useRowTarget(input: Omit<UseDroppableInput, "collisionDetector" | "accept">) {
  return useDroppable({ ...input, accept: (source) => (source.data as { kind?: unknown } | undefined)?.kind === "row", collisionDetector: pointerIntersection });
}
