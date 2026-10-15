// The keys of the Insert drawer (./Palette.tsx) and of a "+" picker
// (./InsertPicker.tsx) as drag sources (./drag/DragLayer.tsx), all of them
// alike, by the mouse and by the keyboard. Each key
// - makes its new block when the drag begins, from the page as it is
//   then, so its ids are ones the page does not have;
// - says where a keyboard move of it starts: where Enter would add it;
// - for a block that cannot exist without something first (an image,
//   images or a video, or the picture of a ready-made section), says what
//   to ask for once it is dropped.
//
// Such a block is dragged as a stand-in of its type, which only places it:
// it is drawn as the drop indicator and never kept. On the drop the place
// is kept, the drag ends with no command, and the key's own window opens
// there (./InsertPicker.tsx); what the window returns makes the block, at
// that place, in ONE command. Esc or Cancel there adds nothing.
import { newSection } from "../document/commands.ts";
import type { DropTarget } from "../document/drag.ts";
import { idDraw, type NewId } from "../document/ids.ts";
import type { Block, BlockType, ImageRef, PageDocument, WidgetBlock } from "../shared/document.ts";
import { WIDGETS } from "../widgets/registry.ts";
import { newWidget, type AnyWidgetDefinition, type Needs } from "../widgets/types.ts";
import type { Asking, InsertPlace } from "./canvas-ui.ts";
import { entry, entryKeysText } from "./keymap.ts";
import { presetSection, type Preset } from "./presets.ts";

export interface TileSource {
  kind: "tile";
  // The type of the block it adds, before any is made.
  type: BlockType;
  make: (page: PageDocument) => Block;
  // Where Space puts it first; null where it has nowhere to go (a widget
  // on a page with no section).
  start: (page: PageDocument) => DropTarget | null;
  asks: Asking | null;
}

// What stands in for the image, the images or the video while the key is
// dragged. The library id is one the library does not hold, so the image
// draws nothing and asks nothing of the network; the stand-in's video, like
// every video on the canvas, never has its player loaded (./Canvas.tsx
// takes the address out of every player it draws).
const PLACING_IMAGE: ImageRef = { mediaId: "placing", alt: "A new image" };
const PLACING: Readonly<Record<Exclude<Needs, null>, unknown>> = {
  image: PLACING_IMAGE,
  images: [PLACING_IMAGE],
  video: { provider: "youtube", videoId: "placeholder" },
};

// What every key's description says of its keyboard drag, beside what
// Enter does (the drawer's sentence, the picker's line).
export const DRAG_WORDS = `${entryKeysText(entry("pickUpTile"))} picks it up instead, to place it elsewhere with the arrows.`;

export function asksOf(definition: AnyWidgetDefinition): Asking | null {
  return definition.needs === null ? null : { kind: "widget", type: definition.type };
}

// A widget that needs nothing first may still take what Insert knows
// (./insert.ts, widgetInput): `input` gives it when the block is made.
export function widgetTile(definition: AnyWidgetDefinition, newId: NewId, start: TileSource["start"], input: () => unknown = () => undefined): TileSource {
  return {
    kind: "tile",
    type: definition.type,
    make: (page) => newWidget(definition as never, idDraw(page, newId)(), (definition.needs === null ? input() : PLACING[definition.needs]) as never) as WidgetBlock,
    start,
    asks: asksOf(definition),
  };
}

export function sectionTile(columns: number, newId: NewId, start: TileSource["start"]): TileSource {
  return { kind: "tile", type: "section", make: (page) => newSection(columns, idDraw(page, newId)), start, asks: null };
}

export function presetTile(preset: Preset, newId: NewId, start: TileSource["start"]): TileSource {
  const picture = preset === "picture";
  return {
    kind: "tile",
    type: "section",
    make: (page) => presetSection(page, preset, newId, picture ? PLACING_IMAGE : undefined),
    start,
    asks: picture ? { kind: "picture" } : null,
  };
}

// The widget a dropped key asks for, or null for the ready-made section.
export function askedWidget(asking: Asking): AnyWidgetDefinition | null {
  return asking.kind === "widget" ? (WIDGETS.find((w) => w.type === asking.type) ?? null) : null;
}

// What the window asks for, in the words the live region uses: "once you
// choose its images".
export function askedWords(asking: Asking): string {
  const needs = askedWidget(asking)?.needs;
  return asking.kind === "picture" ? "its picture" : needs === "images" ? "its images" : needs === "video" ? "its video" : "its image";
}

// A drop place as the "+" names its places: a widget's in a column, a
// section's on the page.
export function placeOfDrop(target: DropTarget): InsertPlace {
  return target.parentId === null ? { kind: "section", index: target.index } : { kind: "block", parentId: target.parentId, index: target.index };
}
