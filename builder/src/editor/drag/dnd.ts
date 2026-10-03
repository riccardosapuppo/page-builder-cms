// The drag library, @dnd-kit 0.5.0, behind this one module: it is a 0.x
// release, pinned exactly, and an upgrade should have one file to read.
// Nothing else in the editor imports it.
//
// What the editor takes from it: the pointer and keyboard sensors, the
// collision with what is under the pointer, the drop target, the overlay
// that follows the pointer, and the auto-scroll near the canvas's edges.
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
// the floating bar's grip with the mouse and by the keymap's keys (Space)
// on the block itself or the grip.
export const SELECTION_SOURCE = "canvas-selection";

const onGrip = (target: EventTarget | null): boolean => target instanceof Element && target.closest("[data-grip]") !== null;

export const SELECTION_SENSORS = [
  PointerSensor.configure({
    // Only a grip starts a drag: a press anywhere else on a block selects
    // it, and its text can be selected as on any page.
    preventActivation: (event) => !onGrip(event.target),
    activationConstraints: [new PointerActivationConstraints.Distance({ value: 4 })],
    // A press is heard anywhere on the page, not only on the selected
    // block: the grip of a section's tab sits outside the block selected
    // inside that section. Pressed, it selects the section, which the drag
    // then carries, as it carries whatever is selected when it starts.
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

// A widget panel's tile is dragged with the mouse; its keys are a
// button's (Enter adds it after the selection).
export const TILE_SENSORS = [
  PointerSensor.configure({
    // A press that does not move is a click, however long it lasts.
    activationConstraints: [new PointerActivationConstraints.Distance({ value: 5 })],
  }),
];

// The library's collision priority for a container: one with children
// ranks below them (low), an empty one keeps the default (none given).
export function collisionPriority(children: number): CollisionPriority | undefined {
  return containerPriority(children) === "low" ? CollisionPriority.Low : undefined;
}

// What is under the pointer, and nothing else, is a target: a shaded area
// is not a place, even with a target close by. A target that ranks low
// says so in its collisions; the library's hook would read a priority
// given to the target only when it is made, and the priority follows the
// drag.
const LOW: CollisionDetector = (input) => {
  const collision = pointerIntersection(input);
  return collision ? { ...collision, priority: CollisionPriority.Low } : null;
};

export function useDropTarget(input: Omit<UseDroppableInput, "collisionDetector">, priority: CollisionPriority | undefined) {
  return useDroppable({ ...input, collisionDetector: priority === CollisionPriority.Low ? LOW : pointerIntersection });
}
