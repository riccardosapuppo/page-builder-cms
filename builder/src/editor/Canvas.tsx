// The canvas: the page drawn by the published page's renderer (../render)
// with the published page's stylesheets, on the approved design's bench
// (design/shots/editor.png). The page root is as wide as the device
// previewed (the canvas, a tablet, a phone), and the page's container
// queries lay it out for that width, as a visitor's device would.
//
// What the editor adds to the page is drawn inside each block's root
// (../render/context.ts, useDecoration): the selection's marks and its
// toolbar floating by its frame (./Clamp.tsx), the hover outline, and the
// round "+" that add on the page (the approved layout, design/layout/
// NOTES.md, section 2): on the selected block's bottom edge, on the seam
// below the section that holds the selection and on any seam the pointer
// is over, and large inside every empty column. A "+" opens the yellow
// insertion line at its place and its picker beside it
// (./InsertPicker.tsx); while the Insert drawer is open, its own yellow
// line marks where a click in it lands. Each block subscribes to its own
// part of the state, so a new selection redraws the blocks it concerns
// and no others.
//
// While a block is dragged (./drag/DragLayer.tsx) the canvas draws the
// store's preview, a separate page with the block where it would land,
// and each block draws its part of the drag (./drag/marks.ts): the
// dragged block as the drop indicator, the container it would land in
// framed, those that cannot take it shaded. Every block, and the page
// itself, is a drop target of the drag library; the selected block is its
// source, picked up by the clamp's grip or by Space. A block moved from a
// row of the Outline is drawn as itself where it would land, framed and
// named, and kept in view, so the page moves with it (live); once the
// pointer comes over the canvas, as the drop indicator again.
//
// The page's own links, buttons and disclosures do nothing here: a click
// selects the block it falls in, a right click opens its menu.
//
// Around a page the canvas draws the site's header and footer, the parts'
// drafts, locked: a click on one opens it, to be edited as a page is. A
// part being edited is drawn in its own element, header or footer, with the
// page opened last around it, dimmed and locked: a click on that page goes
// back to it.
//
// A text block is edited where it stands (./rich/): a click on the text
// block already selected, or a double click on any, opens its editor with
// the caret at the click, and Enter opens it at the end. While it is open
// the block's clamp carries the text's bold, italic and link, and the
// link's field opens under the block.
import {
  createContext, Suspense, useCallback, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState,
  type CSSProperties, type ReactNode, type RefObject,
} from "react";
import { useStore } from "zustand";
import { useShallow } from "zustand/react/shallow";
import { makeInsert, makeInsertSection } from "../document/commands.ts";
import { blockName, blockWithPlace, plural, tokenName } from "../document/labels.ts";
import { locate } from "../document/tree.ts";
import { OwnClassPrefix, type Decoration, type RawBlock, type RenderContext, type ShownEntry } from "../render/context.ts";
import { fieldOf } from "../render/entry-words.ts";
import { fieldDrawing, TITLE } from "../widgets/field/drawing.ts";
import { cartDrawing } from "../widgets/addToCart/drawing.ts";
import type { ShopSettings } from "../shared/shop.ts";
import { CANVAS_CLASS_PREFIX } from "../shared/custom-css.ts";
import { PageSections } from "../render/blocks.tsx";
import { CustomCssStyle, FreeColorsStyle, FreeTypeStyle, PageRoot, partContext, siteStyleAttributes, type SiteStyleChoice } from "../render/page.tsx";
import { SitePart, stickyHeader } from "../render/theme.tsx";
import type { BlockType, ImageRef, PageDocument } from "../shared/document.ts";
import { isPartKind, type PartKind } from "../storage/adapter.ts";
import type { EditorState } from "../store/editor-store.ts";
import { fitPreview } from "../shared/preview-widths.ts";
import { COLUMN_GAP_DEFAULT } from "../shared/site-tokens.ts";
import { afterRender } from "./act.ts";
import { openBlockMenu } from "./BlockMenu.tsx";
import { canvasUi } from "./canvas-ui.ts";
import "./canvas.css";
import { Clamp, FRAME_MOVED } from "./Clamp.tsx";
import { useCoarsePointer, useLayoutMode } from "./layout-mode.ts";
import { withBlockPreview, withPalettePreview } from "./color-preview.ts";
import { useEditor, useEnv, useUi } from "./context.tsx";
import { deviceOf, ownValue, shownValue, type OverrideDevice } from "./device-style.ts";
import { giveWayTo } from "./Drawer.tsx";
import { collisionPriority, SELECTION_SENSORS, SELECTION_SOURCE, useDraggable, useDropTarget } from "./drag/dnd.ts";
import { isGhostId, withGhost } from "./drag/ghost.ts";
import { containerMark, dragMarkOf, draggedOf, type DragMark } from "./drag/marks.ts";
import { PAGE_TARGET, roleOf } from "./drag/place.ts";
import { Icon } from "./icons.tsx";
import { insertTarget, useInsert } from "./insert.ts";
import { placeBeside, placeKey, placeWords } from "./insert-place.ts";
import { closeInserter, InsertPicker, openInserter, PICKER_ID } from "./InsertPicker.tsx";
import { entry, entryKeysText } from "./keymap.ts";
import { collectionResolver, templateEntry } from "./collections/content.ts";
import { mediaResolver } from "./media.ts";
import { ImagePicker } from "./pickers.tsx";
import { PRESET_PICTURES } from "./preset-pictures.tsx";
import { PRESET_LABELS, presetSection, type Preset } from "./presets.ts";
import { LinkField } from "./rich/FormatBar.tsx";
import { forgetLeftText, preloadTextEditor, startEditing, TextEditorHost, type TextTools } from "./rich/tools.ts";
import { HeadingEditor } from "./HeadingEditor.tsx";
import { headingLevel } from "../widgets/heading/render.tsx";
import { placeSeamTip } from "./seam-tip.ts";
import { PART_NAMES, partOf, useOpenKind, useOptionalSession } from "./session.tsx";
import { pushes, type PartsShown, type Preview } from "./ui-store.ts";

// How a block stands to the selection, for the marks it draws.
type Relation =
  | "selected"
  // The section the selection is in.
  | "around"
  // The column that holds the selected widget.
  | "parent"
  // Another column of the section the selection is in.
  | "column"
  // Nothing is selected and this is the first block: the canvas's one Tab stop.
  | "entry"
  | null;

export function relationOf(doc: PageDocument, selection: string | null, id: string | null): Relation {
  if (id === null) return null;
  if (selection === null) return doc.sections[0]?.id === id ? "entry" : null;
  if (selection === id) return "selected";
  const selected = locate(doc, selection);
  const here = locate(doc, id);
  if (!selected || !here) return null;
  if (selected.path.length < 2) return null;
  const sectionId = doc.sections[selected.path[0] ?? -1]?.id;
  if (here.block.type === "section") return here.block.id === sectionId ? "around" : null;
  if (here.block.type === "column" && here.parentId === sectionId) return selected.parentId === id ? "parent" : "column";
  return null;
}

// The canvas's one Tab stop: the selected block, or, when the device
// previewed does not draw it (it or a block around it hidden there), the
// nearest block around it that is drawn; with nothing selected, or nothing
// around the selection drawn, the first section drawn. Null for a page
// with no section drawn.
export function tabStopOf(doc: PageDocument, selection: string | null, preview: Preview): string | null {
  const device = deviceOf(preview);
  const hidden = (block: { style?: unknown }) => shownValue(block.style, device, "visibility") === "hidden";
  const path = selection === null ? null : (locate(doc, selection)?.path ?? null);
  let stop: string | null = null;
  let blocks: readonly { id: string; style?: unknown; children: readonly unknown[] }[] = doc.sections;
  for (const index of path ?? []) {
    const block = blocks[index];
    if (!block || hidden(block)) break;
    stop = block.id;
    blocks = block.children as typeof blocks;
  }
  return stop ?? doc.sections.find((section) => !hidden(section))?.id ?? null;
}

// The canvas's name for a block (the navigator's): "Hero", "Column 1", "Heading".
function nameOf(doc: PageDocument, id: string | null): string {
  if (id === null) return "";
  const block = locate(doc, id)?.block;
  if (!block) return "";
  return blockName(doc, id);
}

// ------------------------------------------------------------ decoration

// The drag source's element, given to the block it is: the selection, or
// the block being dragged wherever the preview puts it.
const SourceRef = createContext<((element: Element | null) => void) | null>(null);

// Whether a block may take part in the drag at all, for the library: a
// place beside its siblings, or a container for the dragged block.
function useAccept(id: string | null): () => boolean {
  const { store } = useEnv();
  return useCallback(() => {
    const session = store.getState().drag;
    if (!session || id === null) return false;
    const dragged = draggedOf(session);
    return id === dragged.id || roleOf(session.base, dragged, id) !== null;
  }, [store, id]);
}

// The library's priority for a block while something is dragged: a
// container the dragged block would go into ranks below its children,
// unless it has none; a block it would stand beside keeps the default.
function priorityOf(state: EditorState, id: string | null): ReturnType<typeof collisionPriority> {
  const session = state.drag;
  if (!session || id === null) return undefined;
  const dragged = draggedOf(session);
  if (id === dragged.id) return undefined;
  const role = roleOf(session.base, dragged, id);
  if (role?.kind !== "container") return undefined;
  const children = (locate(session.preview, id)?.block.children ?? []).filter((b) => b.id !== dragged.id).length;
  return collisionPriority(children);
}

// The entry the open template is drawn with, for the note a Field block
// or an Add to cart block with nothing to draw shows on the canvas; null
// on any other page; and the shop's settings.
const EntryShown = createContext<{ entry: ShownEntry | null; template: boolean; shop: ShopSettings | null }>({ entry: null, template: false, shop: null });

// What a Field block with nothing to draw says on the canvas, where its
// root, hidden on the page, is drawn faintly so it can be selected and
// moved: the field it names, so that two such blocks one under the other
// are told apart; a toggle that is off draws nothing by design, and says
// so. Null for one that draws its value. An Add to cart block says why it
// draws nothing (cartNote).
export function fieldNote(block: RawBlock, entry: ShownEntry | null, template: boolean, shop: ShopSettings | null = null): string | null {
  if (block.type === "addToCart") return cartCanvasNote(block, entry, template, shop);
  if (block.type !== "field") return null;
  const props = block.props && typeof block.props === "object" ? (block.props as Record<string, unknown>) : {};
  if (fieldDrawing(props, entry, shop) !== null) return null;
  if (!template) return "A field draws an entry’s value: only a template has one";
  if (entry === null) return "No value yet";
  const key = props.field;
  if (key === TITLE) return "No title in this entry";
  const field = fieldOf(entry.fields, key);
  if (!field) return `No field “${typeof key === "string" ? key : ""}” in this collection`;
  if (field.type === "toggle") return `“${field.label}” is off in this entry`;
  return `No “${field.label}” in this entry`;
}

// What an Add to cart block with nothing to draw says on the canvas: why
// it is no product's. Null for one that draws its form, or says where its
// button goes that the product is out of stock or has no price.
export function cartCanvasNote(block: RawBlock, entry: ShownEntry | null, template: boolean, shop: ShopSettings | null): string | null {
  const props = block.props && typeof block.props === "object" ? (block.props as Record<string, unknown>) : {};
  if (cartDrawing(props, entry, shop) !== null) return null;
  if (!template) return "Add to cart puts an entry in the cart: only a template has one";
  if (shop === null || !shop.enabled) return "Add to cart: the shop is off, so it draws nothing";
  if (entry === null || entry.collectionId !== shop.productsCollectionId) return "Add to cart: the shop sells from another collection";
  return "Add to cart: drawn for an entry of this collection, and it has none yet";
}

// The copy of a widget left where it stood while it is dragged (./drag/
// ghost.ts): dimmed, inert, out of every lookup, and with the "Moving" chip.
const GHOST: Decoration = {
  attributes: { inert: true, "aria-hidden": "true", "data-moving-ghost": "" },
  after: <span className="moving-chip" aria-hidden="true">Moving</span>,
};

function useDecoration(block: RawBlock): Decoration | undefined {
  const { store, ui } = useEnv();
  const anonymous = useId();
  const named = typeof block.id === "string" ? block.id : null;
  // Not a block of the page: nothing below answers for it.
  const ghost = isGhostId(named);
  const id = ghost ? null : named;
  const relation = useStore(store, (s) => (s.drag ? null : relationOf(s.document, s.selection, id)));
  const live = useStore(ui, (u) => u.dragLive);
  const hovered = useStore(ui, (u) => id !== null && u.hover === id);
  const name = useStore(store, (s) => nameOf(s.drag?.preview ?? s.document, id));
  const mark = useStore(store, useShallow((s): DragMark => (s.drag && id !== null ? dragMarkOf(s.drag, s.drag.preview, id) : null)));
  const isSource = useStore(store, (s) => id !== null && (s.drag ? draggedOf(s.drag).id === id : s.selection === id));
  const priority = useStore(store, (s) => priorityOf(s, id));
  const device = useStore(ui, (u) => u.preview);
  // The one Tab stop; while a drag lasts, the block dragged.
  const tabStop = useStore(store, (s) => id !== null && (s.drag ? draggedOf(s.drag).id === id : tabStopOf(s.document, s.selection, device) === id));
  const dimension = useStore(store, useShallow((s) => (s.drag || id === null || s.selection !== id ? null : dimensionOf(s.document, id, device))));
  const sourceRef = useContext(SourceRef);
  const accept = useAccept(id);
  const { ref: dropRef } = useDropTarget({ id: id ?? anonymous, disabled: id === null, accept }, priority);
  const ref = useCallback((element: HTMLElement | null) => {
    dropRef(element);
    if (isSource) sourceRef?.(element);
  }, [dropRef, isSource, sourceRef]);
  // A text block: its editor while it is edited, and the editor's chunk
  // fetched as soon as it is selected. A heading: its line, written where
  // it stands, while it is edited.
  const isText = block.type === "text";
  const isHeading = block.type === "heading";
  const editing = useStore(ui, (u) => (isText || isHeading) && id !== null && u.editingText?.id === id);
  const tools = useStore(ui, (u) => (id !== null && u.textTools?.id === id ? u.textTools : null));
  const textLabel = useStore(store, (s) => ((isText || isHeading) && id !== null ? blockWithPlace(s.document, id) : ""));
  useEffect(() => {
    if (isText && relation === "selected") preloadTextEditor();
  }, [isText, relation]);
  const pluses = usePluses(block, id, relation);
  const shown = useContext(EntryShown);
  const note = fieldNote(block, shown.entry, shown.template, shown.shop);

  if (ghost) return GHOST;
  if (id === null) return undefined;
  const kind = block.type === "section" ? "section" : block.type === "column" ? "column" : "widget";
  const empty = block.type === "column" && Array.isArray(block.children) && block.children.length === 0;
  const slot = mark?.kind === "slot" && !live ? mark : null;
  const moving = mark?.kind === "slot" && live ? mark : null;
  return {
    ref,
    attributes: {
      role: "group",
      "aria-roledescription": kind,
      "aria-label": name,
      tabIndex: tabStop ? 0 : -1,
      "data-editor-selected": relation === "selected" ? "true" : undefined,
      "data-drag-slot": slot ? slot.mode : undefined,
      "data-drag-row": slot?.row ? "true" : undefined,
      "data-drag-live": moving ? "" : undefined,
    },
    after: slot
      ? <DropIndicator mode={slot.mode} label={slot.label} />
      : moving
        ? <MovingFrame label={moving.label} />
        : (
          <>
            {note !== null && <span className="field-none chrome">{note}</span>}
            <Marks id={id} kind={kind} type={block.type as BlockType} name={name} relation={relation} hovered={hovered && mark === null} empty={empty} mark={mark} hug={block.type === "button"} dimension={dimension} tools={relation === "selected" ? tools : null} pluses={pluses} />
          </>
        ),
    // While a drag lasts nothing is selected (relation null), so the
    // editor gives way to the page's drawing of the text.
    ...(editing && relation === "selected"
      ? isHeading
        ? { editing: () => <HeadingEditor blockId={id} level={headingLevel(block.props && typeof block.props === "object" ? (block.props as Record<string, unknown>) : {})} label={textLabel} /> }
        : { editing: (drawn: ReactNode) => <Suspense fallback={drawn}><TextEditorHost blockId={id} label={textLabel} /></Suspense> }
      : {}),
  };
}

// The spacing the selected block's dimension line measures, by the step
// the sidebar's Spacing names (design/shots/editor.png, the "L" under the
// hero's heading): for a widget, the gap below it to the next widget, its
// column's Space between; for a column, the space inside it, at its top.
// The step is the one the previewed device shows (./device-style.ts): its
// own, else the base; a phone never takes the tablet's. A step that is the
// device's own carries the device's glyph (design/shots/style.png, the "L"
// and the tablet on the hero's column). None for the last widget of a
// column, and for no space at all.
export interface Dimension {
  kind: "gap" | "pad";
  label: string;
  // The device whose own value the step is.
  device: OverrideDevice | null;
}

export function dimensionOf(doc: PageDocument, id: string, preview: Preview): Dimension | null {
  const found = locate(doc, id);
  if (!found) return null;
  const device = deviceOf(preview);
  const ownOn = (style: unknown, key: "spaceInside" | "spaceBetween") => (device !== "base" && ownValue(style, device, key) !== null ? device : null);
  const { block } = found;
  if (block.type === "column") {
    const value = shownValue(block.style, device, "spaceInside");
    return value && value !== "none" ? { kind: "pad", label: tokenName(value), device: ownOn(block.style, "spaceInside") } : null;
  }
  if (block.type === "section" || found.parentId === null) return null;
  const column = locate(doc, found.parentId)?.block;
  if (!column || found.index >= column.children.length - 1) return null;
  const value = shownValue(column.style, device, "spaceBetween") ?? COLUMN_GAP_DEFAULT;
  return value !== "none" ? { kind: "gap", label: tokenName(value), device: ownOn(column.style, "spaceBetween") } : null;
}

// Draws the dimension line from the block's own layout: the gap to the
// next block, or the padding at its top (offsets and computed sizes,
// which a scaled canvas leaves alone), placed again as the block changes.
function measureDimension(kind: Dimension["kind"]) {
  return (mark: HTMLElement | null): (() => void) | undefined => {
    const root = mark?.parentElement;
    if (!mark || !root) return undefined;
    const place = () => {
      let size = 0;
      if (kind === "pad") size = parseFloat(getComputedStyle(root).paddingTop) || 0;
      else {
        let next = root.nextElementSibling;
        while (next && !(next instanceof HTMLElement && next.dataset.blockId !== undefined)) next = next.nextElementSibling;
        if (next instanceof HTMLElement) size = next.offsetTop - (root.offsetTop + root.offsetHeight);
      }
      mark.style.height = `${Math.max(0, size)}px`;
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(root);
    if (root.parentElement) observer.observe(root.parentElement);
    return () => observer.disconnect();
  };
}

const measureGap = measureDimension("gap");
const measurePad = measureDimension("pad");

function DimensionLine({ dimension }: { dimension: Dimension }) {
  return (
    <div className={`ov ${dimension.kind === "gap" ? "ov-dim-v" : "ov-pad ov-pad-top"}`} ref={dimension.kind === "gap" ? measureGap : measurePad} aria-hidden="true" data-device={dimension.device ?? undefined}>
      <span>{dimension.label}{dimension.device && <Icon name={dimension.device} />}</span>
    </div>
  );
}

// A button is drawn as a pill inside a root as wide as its column, as on
// the published page; its hover outline and selection frame hug the pill
// (design/shots/editor.png), placed from the pill's box in the root's own
// layout (offset*, which neither scrolling nor a scaled canvas changes).
// They are placed again whenever either box changes size, and whenever
// the pill may move with neither changing: an alignment, the button's own
// or the one it takes on from its column (text-align), comes as a class
// on the root or on a block around it, up to the page root. Each time,
// `then` follows (the hover outline places its name).
function hug(mark: HTMLElement | null, then?: () => void): (() => void) | undefined {
  const root = mark?.parentElement;
  const pill = root?.querySelector<HTMLElement>(":scope > .sw-btn");
  if (!mark || !root || !pill) return undefined;
  const place = () => {
    mark.style.setProperty("--hug-x", `${pill.offsetLeft}px`);
    mark.style.setProperty("--hug-y", `${pill.offsetTop}px`);
    mark.style.setProperty("--hug-w", `${pill.offsetWidth}px`);
    mark.style.setProperty("--hug-h", `${pill.offsetHeight}px`);
    then?.();
  };
  place();
  const resized = new ResizeObserver(place);
  resized.observe(root);
  resized.observe(pill);
  const restyled = new MutationObserver(place);
  for (let element: Element | null = root; element; element = element.parentElement) {
    restyled.observe(element, { attributes: true, attributeFilter: ["class", "style"] });
    if (element.classList.contains("site")) break;
  }
  return () => {
    resized.disconnect();
    restyled.disconnect();
  };
}

// The selection's frame on a button: placed on its pill, the toolbar told
// each time, as nothing it watches changes size (./Clamp.tsx).
const selectionHug = (frame: HTMLElement | null): (() => void) | undefined => hug(frame, () => frame?.dispatchEvent(new Event(FRAME_MOVED, { bubbles: true })));

// A hovered block's name stands above its outline, at its top left, where
// the selection's toolbar names a block, unless the canvas cuts it there:
// past the canvas's top (a block at the canvas's top), it stands inside
// the outline's corner; past its right edge (a block that starts near the
// edge, the name longer than the room), at the outline's right end
// (editor.css, data-label-side). The side is chosen from where the name
// is drawn by default, before the browser paints, and chosen again when
// the outline or the canvas changes size, the canvas scrolls, a button's
// outline moves with its pill, and when the page is drawn at a new scale:
// a window that changes size changes the canvas's first, and the scale
// only once React draws it, which no size the observer sees changes.
function labelSide(mark: HTMLElement): void {
  const label = mark.querySelector<HTMLElement>(":scope > .ov-label");
  const canvas = mark.closest<HTMLElement>(".canvas");
  if (!label || !canvas) return;
  delete mark.dataset.labelSide;
  const bench = canvas.getBoundingClientRect();
  const box = label.getBoundingClientRect();
  if (box.top < bench.top + canvas.clientTop + 2) mark.dataset.labelSide = "inside";
  else if (box.right > bench.left + canvas.clientLeft + canvas.clientWidth - 2) mark.dataset.labelSide = "end";
}

// The hover outline's ref: its name's side, after a button's outline is
// placed on its pill.
function hoverMark(hugs: boolean) {
  return (mark: HTMLElement | null): (() => void) | undefined => {
    if (!mark) return undefined;
    const place = () => labelSide(mark);
    const unhug = hugs ? hug(mark, place) : undefined;
    place();
    const resized = new ResizeObserver(place);
    resized.observe(mark);
    const canvas = mark.closest(".canvas");
    if (canvas) resized.observe(canvas, { box: "border-box" });
    const rescaled = new MutationObserver(place);
    const frame = mark.closest(".frame");
    if (frame) rescaled.observe(frame, { attributes: true, attributeFilter: ["style", "data-scale"] });
    canvas?.addEventListener("scroll", place, { passive: true });
    return () => {
      unhug?.();
      resized.disconnect();
      rescaled.disconnect();
      canvas?.removeEventListener("scroll", place);
    };
  };
}

const hoverPlain = hoverMark(false);
const hoverHug = hoverMark(true);

// The drop indicator, one for the mouse and the keyboard: a line with the
// block's name where it will land, or, alone in its container, the frame
// of that container. The dragged block itself is drawn as it.
export function DropIndicator({ mode, label }: { mode: "line" | "frame"; label: string }) {
  return (
    <span className="drop-ui drop-slot" data-mode={mode} aria-hidden="true">
      {mode === "line" && <span className="drop-line" />}
      <span className="drop-label">{label}</span>
    </span>
  );
}

// A block moved from the Outline, drawn as itself where it would land: the
// selection's yellow frame around it, and its name.
function MovingFrame({ label }: { label: string }) {
  return (
    <span className="drop-ui drop-live" aria-hidden="true">
      <span className="drop-label">{label}</span>
    </span>
  );
}

// The "+" a block draws (design/layout/NOTES.md, section 2, the rule for
// when each shows), each block answering for its own:
// - the selected widget's, on its bottom edge: hidden while its text is
//   written, while the Insert drawer is open (its yellow line marks the
//   spot instead) and while a picker is open;
// - a section's seams: the one below the section that holds the
//   selection, and any seam the pointer is over, the top of the first
//   section and the foot of the last among them; with nothing selected,
//   only the one under the pointer;
// - the yellow line and the yellow "+" of a picker open at the block's
//   place, and the Insert drawer's line in the column where a click in it
//   lands;
// - the large "+" of an empty column, always (./Marks draws it).
type SeamState = "shown" | "hover" | "open" | null;

interface Pluses {
  after: boolean;
  // The seam above the first section, and the one below this section.
  above: SeamState;
  below: SeamState;
  // The index of the section, for its seams.
  section: number;
  // In a column: where a picker's line is open, and where the Insert
  // drawer's line stands.
  slot: number | null;
  point: number | null;
  // A picker is open: the selected block's dimension line waits, as the
  // gap it measures may be where the picker's yellow line opens (the
  // layout draws none there, design/layout/shots/add.png).
  picking: boolean;
}

// The section the selection is in (the section itself when it is one).
function sectionOf(doc: PageDocument, selection: string | null): string | null {
  if (selection === null) return null;
  const found = locate(doc, selection);
  return found ? (doc.sections[found.path[0] ?? -1]?.id ?? null) : null;
}

function usePluses(block: RawBlock, id: string | null, relation: Relation): Pluses {
  const { store, ui } = useEnv();
  const canvas = canvasUi(ui);
  const type = block.type;
  const writing = useStore(ui, (u) => id !== null && (u.editingText?.id === id || u.textTools?.id === id));
  const insertOpen = useStore(ui, (u) => u.drawer === "insert");
  const picking = useStore(canvas, (s) => s.inserting !== null);
  const section = useStore(store, (s) => (type === "section" && id !== null && !s.drag ? s.document.sections.findIndex((x) => x.id === id) : -1));
  const holds = useStore(store, (s) => type === "section" && id !== null && !s.drag && sectionOf(s.document, s.selection) === id);
  const seam = (at: number) => (s: { inserting: ReturnType<typeof canvas.getState>["inserting"]; seam: number | null }): SeamState => {
    if (section < 0) return null;
    if (s.inserting?.kind === "section" && s.inserting.index === at) return "open";
    if (s.seam === at) return "hover";
    return null;
  };
  const below = useStore(canvas, seam(section + 1));
  const above = useStore(canvas, section === 0 ? seam(0) : () => null);
  // While one of the picker's keys is dragged, its line gives way to the
  // drop indicator (the picker itself too, ./InsertPicker.tsx).
  const dragging = useStore(store, (s) => s.drag !== null);
  const opened = useStore(canvas, (s) => (s.inserting?.kind === "block" && s.inserting.parentId === id ? s.inserting.index : null));
  const slot = dragging ? null : opened;
  const point = useStore(store, (s) => {
    if (!insertOpen || type !== "column" || id === null || s.drag) return null;
    const at = insertTarget(s.document, "heading", s.selection);
    return at?.parentId === id ? at.index : null;
  });
  return {
    after: relation === "selected" && type !== "section" && type !== "column" && !writing && !insertOpen && !picking,
    above,
    below: below ?? (holds && !picking ? "shown" : null),
    section,
    slot,
    point: picking ? null : point,
    picking,
  };
}

interface MarksProps {
  id: string;
  kind: "section" | "column" | "widget";
  type: BlockType;
  name: string;
  relation: Relation;
  hovered: boolean;
  empty: boolean;
  mark: DragMark;
  // The outline and frame hug what the block draws (a button's pill).
  hug: boolean;
  // The selected block's dimension line, if it has one.
  dimension: Dimension | null;
  // A text being edited: its formatting buttons and link field.
  tools: TextTools | null;
  pluses: Pluses;
}

const ADD_KEY = entryKeysText(entry("addHere"));

// The note on a shaded section ("Widgets go inside a column."): at the
// section's left, except under Insert where it floats over the page (a
// tablet's window; on a desktop every drawer pushes the page aside). A key
// dragged out of Insert there is over a page whose left part the drawer
// covers, and the note at the section's left was under it: it starts
// instead at the drawer's right edge, in the part of the band that is
// seen. --note-from is that edge in the section's own pixels (the page may
// be drawn smaller than its size).
function VeilNote({ note }: { note: string }) {
  const span = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const element = span.current;
    const veil = element?.offsetParent;
    if (!element || !(veil instanceof HTMLElement)) return undefined;
    const place = () => {
      const drawer = document.querySelector(".drawer-float");
      const box = veil.getBoundingClientRect();
      if (!drawer || box.width === 0 || veil.offsetWidth === 0) {
        element.style.removeProperty("--note-from");
        return;
      }
      const scale = box.width / veil.offsetWidth;
      element.style.setProperty("--note-from", `${(drawer.getBoundingClientRect().right + 12 - box.left) / scale}px`);
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, []);
  return <span ref={span} className="veil-note"><Icon name="block" className="i i-xs" />{note}</span>;
}

function Marks({ id, kind, type, name, relation, hovered, empty, mark, hug: hugs, dimension, tools, pluses }: MarksProps) {
  const env = useEnv();
  const dragging = useEditor((s) => s.drag !== null);
  const after = pluses.after ? placeBeside(env.store.getState().document, id, "after") : null;
  return (
    <>
      {empty && pluses.slot === null && <EmptyPlus id={id} name={name} />}
      {pluses.slot !== null && <InsertSlot index={pluses.slot} />}
      {pluses.point !== null && <InsertPoint index={pluses.point} />}
      {mark?.kind === "target" && <div className="ov ov-drop ov-drop-target" aria-hidden="true"><span className="ov-label">{mark.label}</span></div>}
      {mark?.kind === "open" && kind === "column" && <div className="ov ov-drop" aria-hidden="true" />}
      {mark?.kind === "shut" && (
        <div className="ov ov-veil" aria-hidden="true">
          {kind === "section" && <VeilNote note={mark.note} />}
        </div>
      )}
      {relation === "selected" && dimension && !pluses.picking && <DimensionLine dimension={dimension} />}
      {relation === "selected" && (
        <div className={`ov ov-sel${hugs ? " ov-hug" : ""}`} ref={hugs ? selectionHug : undefined} data-writing={tools ? "true" : undefined}>
          {after && (
            <button
              className="ins ins-after"
              type="button"
              tabIndex={-1}
              data-plus={placeKey(after)}
              aria-label={`Add a block after ${name}`}
              title={`Add a block after ${name} (${ADD_KEY})`}
              onClick={(event) => openInserter(env, after, event.currentTarget)}
            >
              <Icon name="plus" className="li" />
            </button>
          )}
          {tools?.linkOpen && <LinkField tools={tools} />}
        </div>
      )}
      {relation === "selected" && !dragging && <Clamp id={id} kind={kind} type={type} name={name} tools={tools} />}
      {kind === "section" && pluses.above && <Seam at={0} state={pluses.above} edge="top" />}
      {kind === "section" && pluses.below && <Seam at={pluses.section + 1} state={pluses.below} edge="bottom" />}
      {relation !== "selected" && hovered && (
        <div className={`ov ov-hover${hugs ? " ov-hug" : ""}`} ref={hugs ? hoverHug : hoverPlain} aria-hidden="true"><span className="ov-label">{name}</span></div>
      )}
    </>
  );
}

// The large "+" inside an empty column: it adds a block there.
function EmptyPlus({ id, name }: { id: string; name: string }) {
  const env = useEnv();
  const place = { kind: "block", parentId: id, index: 0 } as const;
  return (
    <button className="ins-empty" type="button" tabIndex={-1} data-plus={placeKey(place)} aria-label={`Add a block to ${name}`} onClick={(event) => openInserter(env, place, event.currentTarget)}>
      <span className="ins ins-big" aria-hidden="true"><Icon name="plus" className="li" /></span>
      <span className="ins-empty-name">Add a block to {name}</span>
      <small>Or drag one here from Insert</small>
    </button>
  );
}

// The picker's place in a column: a gap of the column's own, between the
// blocks around it, with the yellow line and its "+", which closes the
// picker. The column is a flex column: the gap is put in its place by
// order, the blocks after it drawn after it, and the page's blocks keep
// their elements.
function InsertSlot({ index }: { index: number }) {
  const env = useEnv();
  const ref = useRef<HTMLDivElement>(null);
  const title = useEditor((s) => {
    const place = canvasUi(env.ui).getState().inserting;
    return place ? placeWords(s.document, place).title : "";
  });
  useLayoutEffect(() => {
    const slot = ref.current;
    const column = slot?.parentElement;
    if (!slot || !column) return undefined;
    const blocks = [...column.children].filter((e): e is HTMLElement => e instanceof HTMLElement && e.dataset.blockId !== undefined);
    blocks.forEach((element, at) => {
      element.style.order = at >= index ? "2" : "";
    });
    slot.style.order = "1";
    return () => blocks.forEach((element) => {
      element.style.order = "";
    });
  }, [index]);
  return (
    <div ref={ref} className="ins-slot-wrap">
      <div className="ins-slot" aria-hidden="true"><span className="ins-slot-line" /><span className="ins-slot-label">New block</span></div>
      <button className="ins is-open" type="button" tabIndex={-1} aria-label={title} aria-expanded="true" aria-controls={PICKER_ID} onClick={() => closeInserter(env, true)}><Icon name="plus" className="li" /></button>
    </div>
  );
}

// How far under the selected block, the last of its column, the line
// stands: its words (10 above it) and the dots at its ends clear of the
// selection's frame and of the "+" on its foot, as the layout draws it
// (insert-drawer-1280).
const POINT_CLEAR = 26;

// Where a click in the Insert drawer lands (its drawer-where sentence
// says it in words): the yellow line between the blocks around the place,
// its words at its right end where the drawer, floating over the canvas (a
// tablet's window), covers its left end; beside the page, on a desktop, it
// covers none of it. Under the selection, the last block of its column, it
// keeps off the selection's frame; between two blocks it stays in the
// middle of their gap, off the next block's words.
function InsertPoint({ index }: { index: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const touch = useCoarsePointer();
  useLayoutEffect(() => {
    const point = ref.current;
    const column = point?.parentElement;
    if (!point || !column) return undefined;
    const place = () => {
      const blocks = [...column.children].filter((e): e is HTMLElement => e instanceof HTMLElement && e.dataset.blockId !== undefined);
      const gap = parseFloat(getComputedStyle(column).rowGap) || 0;
      const before = blocks[index - 1];
      const after = blocks[index];
      const under = before?.dataset.editorSelected === "true" ? POINT_CLEAR : 0;
      const y = before && after ? (before.offsetTop + before.offsetHeight + after.offsetTop) / 2
        : before ? before.offsetTop + before.offsetHeight + Math.max(gap / 2, under)
          : after ? after.offsetTop - gap / 2
            : column.clientHeight / 2;
      point.style.top = `${y}px`;
      const line = point.getBoundingClientRect();
      const covered = [...document.querySelectorAll(".drawer-float")].some((drawer) => drawer.getBoundingClientRect().right > line.left + line.width / 2 - 120);
      if (covered) point.dataset.label = "right";
      else delete point.dataset.label;
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(column);
    return () => observer.disconnect();
  }, [index]);
  return (
    <div ref={ref} className="ins-point" aria-hidden="true">
      <span className="ins-line" />
      <span className="ins-label"><Icon name="plus" className="li li-label" />A {touch ? "tap" : "click"} in Insert lands here</span>
    </div>
  );
}

// A seam between two sections (or above the first, below the last): its
// "+", the hairline and the tip naming the place while the pointer is
// over it, the yellow line while its picker is open.
function Seam({ at, state, edge }: { at: number; state: Exclude<SeamState, null>; edge: "top" | "bottom" }) {
  const env = useEnv();
  const doc = useEditor((s) => s.document);
  const above = doc.sections[at - 1];
  const below = doc.sections[at];
  const label = state === "hover" && above && below
    ? `Add a section between ${blockName(doc, above.id)} and ${blockName(doc, below.id)}`
    : above ? `Add a section after ${blockName(doc, above.id)}` : below ? `Add a section before ${blockName(doc, below.id)}` : "Add a section";
  const place = { kind: "section", index: at } as const;
  const plusRef = useRef<HTMLButtonElement>(null);
  const tipRef = useRef<HTMLSpanElement>(null);
  useSeamTip(tipRef, plusRef, state === "hover", label);
  return (
    <>
      {state === "hover" && <div className="seam-hover" data-edge={edge} aria-hidden="true"><span className="seam-hair" /></div>}
      {state === "open" && <div className="seam" data-edge={edge} aria-hidden="true"><span className="seam-line" /><span className="seam-label">New section</span></div>}
      <button
        ref={plusRef}
        className={`ins ins-sec${state === "open" ? " is-open" : ""}${state === "hover" ? " is-hover" : ""}`}
        type="button"
        tabIndex={-1}
        data-edge={edge}
        data-plus={placeKey(place)}
        aria-label={label}
        aria-expanded={state === "open"}
        aria-controls={state === "open" ? PICKER_ID : undefined}
        title={label}
        onClick={(event) => (state === "open" ? closeInserter(env, true) : openInserter(env, place, event.currentTarget))}
      >
        <Icon name="plus" className="li" />
      </button>
      {state === "hover" && <span ref={tipRef} className="seam-tip" data-edge={edge} aria-hidden="true">{label}</span>}
    </>
  );
}

// Lays a seam's tip where it is whole and clear of the clamp and of the
// Insert drawer where it floats over the canvas (./seam-tip.ts), in its
// section's own pixels (the page may be drawn smaller: the tip is drawn
// back up to its size, canvas.css); and again, while it shows, whenever its
// "+" moves along the seam, the canvas scrolls or changes size, the page is
// drawn at a new scale or a drawer opens or closes.
function useSeamTip(tipRef: { current: HTMLSpanElement | null }, plusRef: { current: HTMLButtonElement | null }, shown: boolean, label: string): void {
  const { ui } = useEnv();
  useLayoutEffect(() => {
    const tip = tipRef.current;
    const plus = plusRef.current;
    const host = tip?.parentElement;
    const canvas = tip?.closest<HTMLElement>(".canvas");
    const frame = tip?.closest<HTMLElement>(".frame");
    if (!shown || !tip || !plus || !host || !canvas || !frame) return undefined;
    let soon = 0;
    const place = () => {
      const scale = Number(frame.dataset.scale ?? "1") || 1;
      const bench = canvas.getBoundingClientRect();
      const left = bench.left + canvas.clientLeft;
      const top = bench.top + canvas.clientTop;
      const view = { left, top, right: left + canvas.clientWidth, bottom: top + canvas.clientHeight };
      const obstacles = [...canvas.querySelectorAll(".clamp"), ...document.querySelectorAll(".drawer-float")].map((element) => element.getBoundingClientRect());
      const size = tip.getBoundingClientRect();
      const where = placeSeamTip({ plus: plus.getBoundingClientRect(), width: size.width, height: size.height, view, obstacles });
      const origin = host.getBoundingClientRect();
      const x = `${(where.x - origin.left) / scale - host.clientLeft}px`;
      const y = `${(where.y - origin.top) / scale - host.clientTop}px`;
      if (tip.style.left !== x) tip.style.left = x;
      if (tip.style.top !== y) tip.style.top = y;
      if (tip.dataset.side !== where.side) tip.dataset.side = where.side;
    };
    const later = () => {
      if (soon) return;
      soon = requestAnimationFrame(() => {
        soon = 0;
        place();
      });
    };
    place();
    const resized = new ResizeObserver(later);
    resized.observe(canvas);
    resized.observe(host);
    // The "+" moved along its seam (--seam-shift on the section), the page
    // drawn at another scale.
    const moved = new MutationObserver(later);
    moved.observe(host, { attributes: true, attributeFilter: ["style"] });
    moved.observe(frame, { attributes: true, attributeFilter: ["style", "data-scale"] });
    canvas.addEventListener("scroll", later, { passive: true });
    const unsubscribe = ui.subscribe((state, before) => {
      if (state.drawer !== before.drawer) afterRender(place);
    });
    return () => {
      if (soon) cancelAnimationFrame(soon);
      resized.disconnect();
      moved.disconnect();
      canvas.removeEventListener("scroll", later);
      unsubscribe();
    };
  }, [tipRef, plusRef, shown, label, ui]);
}

// ------------------------------------------------------------- the canvas

// The canvas: the page being edited, where every class of the site's own
// carries the canvas's prefix (OwnClassPrefix) and its custom CSS is
// renamed to match, so the editor's stylesheets never reach a block named
// like one of their classes (btn, menu).
export function Canvas() {
  return (
    <OwnClassPrefix.Provider value={CANVAS_CLASS_PREFIX}>
      <CanvasView />
    </OwnClassPrefix.Provider>
  );
}

function CanvasView() {
  const env = useEnv();
  const { store, ui } = env;
  const document = useEditor((s) => s.drag?.preview ?? s.document);
  // What is drawn while a widget is dragged: the preview, and a dimmed copy
  // of the widget where it stood (./drag/ghost.ts).
  const session = useEditor((s) => s.drag);
  // Moved from the Outline, the block goes as itself: no copy where it
  // stood (./drag/ghost.ts), the page closing up behind it.
  const live = useUi((u) => u.dragLive);
  const drawn = useMemo(() => (session ? (live ? session.preview : withGhost(session)) : document), [session, document, live]);
  const dragType = useEditor((s) => s.drag?.type ?? null);
  const pageMark = useEditor(useShallow((s): DragMark => (s.drag ? containerMark(s.drag, s.drag.preview, PAGE_TARGET) : null)));
  const sections = useEditor((s) => (s.drag?.preview ?? s.document).sections.length);
  const selection = useEditor((s) => s.selection);
  const preview = useUi((u) => u.preview);
  const media = useUi((u) => u.media);
  // A colour being picked (./color-preview.ts) is drawn before it is kept:
  // a slot of the site style's, or a block's own.
  const colorPreview = useUi((u) => u.colorPreview);
  const kept = useUi((u) => u.siteStyle);
  const siteStyle = useMemo(() => withPalettePreview(kept, colorPreview), [kept, colorPreview]);
  const shown = useMemo(() => withBlockPreview(drawn, colorPreview), [drawn, colorPreview]);
  // What is edited: a page, with the parts drawn around it; or a part,
  // with the page opened last around it.
  const opened = useOptionalSession();
  const kind = opened?.current?.kind ?? "page";
  const parts = useUi((u) => u.parts);
  const around = useUi((u) => u.aroundPart);
  // The part, or the page around a part, the pointer is over: it is
  // outlined, and says what a click does there.
  const [lockedHover, setLockedHover] = useState<LockedPlace | null>(null);
  // The bottom line's Block edges: every block's edges drawn (editor.css).
  const edges = useUi((u) => u.blockEdges);
  const frame = useRef<HTMLDivElement>(null);
  const bench = useRef<HTMLElement>(null);
  const fit = useRef<HTMLDivElement>(null);
  const [measured, setMeasured] = useState(0);
  const [room, setRoom] = useState(0);

  // The selected block, the drag's source: its element is given to it by
  // the block itself (SourceRef).
  const source = useDraggable({ id: SELECTION_SOURCE, data: { kind: "selection" }, sensors: SELECTION_SENSORS, disabled: selection === null });
  // The page itself, for a section dropped below the last one.
  const acceptPage = useAccept(PAGE_TARGET);
  const page = useDropTarget({ id: PAGE_TARGET, accept: acceptPage }, collisionPriority(sections));
  const frameRef = useCallback((element: HTMLDivElement | null) => {
    frame.current = element;
    page.ref(element);
  }, [page]);

  // What the page's lists and a template's fields draw from: the
  // storage's collections, and for a template the entry its Page tab
  // picks, its draft, or values made up when its collection has none
  // (./collections/content.ts); and the shop's settings, by which a price
  // is money and Add to cart draws.
  const siteEntries = useUi((u) => u.siteEntries);
  const siteShop = useUi((u) => u.siteShop);
  const previewEntry = useUi((u) => u.previewEntry);
  const templateId = kind === "template" ? (opened?.current?.collection?.id ?? null) : null;
  const entry = useMemo(
    () => (templateId === null ? null : templateEntry(siteEntries, templateId, previewEntry?.collectionId === templateId ? previewEntry.choice : null, new Date(env.clock.now()))),
    [siteEntries, templateId, previewEntry, env.clock],
  );
  // The context's hook must stay the same function: the library's lookup,
  // the collections, the entry and the shop are the parts that change, and
  // only when they do.
  const ctx = useMemo<RenderContext>(() => ({ media: mediaResolver(media), collections: collectionResolver(siteEntries), entry, shop: siteShop, useDecoration }), [media, siteEntries, entry, siteShop]);
  const entryShown = useMemo(() => ({ entry, template: kind === "template", shop: siteShop }), [entry, kind, siteShop]);
  const layout = useLayoutMode();
  const { width, scale } = fitPreview(preview, room, layout === "narrow");

  // The room the canvas has for the page: its width inside its scrollbar's
  // gutter (kept whether or not the page scrolls, editor.css .canvas), less
  // the page's margins (12 on the left beside a pushed drawer, none on a
  // phone's window, where the page is the whole width), so the page is as
  // wide as the window allows and a page scaled to fit never makes the
  // canvas scroll sideways.
  const pushed = useUi((u) => pushes(u.drawer, layout)) && layout === "wide";
  useLayoutEffect(() => {
    const element = bench.current;
    if (!element) return undefined;
    const margins = layout === "narrow" ? 0 : (pushed ? FRAME_MARGIN_PUSHED : FRAME_MARGIN) + FRAME_MARGIN;
    const measure = () => setRoom(element.clientWidth - margins);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [pushed, layout]);

  // The page's own width, as the bottom line names it, when it fills the
  // canvas: its layout width, which a scale would not change.
  useLayoutEffect(() => {
    const element = frame.current;
    if (!element) return undefined;
    setMeasured(element.offsetWidth);
    const observer = new ResizeObserver(() => setMeasured(element.offsetWidth));
    observer.observe(element);
    return () => observer.disconnect();
  }, [preview]);

  // The bottom line says the page's width and its scale (./StatusBar.tsx).
  const shownWidth = width ?? measured;
  useEffect(() => {
    ui.getState().setPageView({ width: shownWidth, scale });
  }, [ui, shownWidth, scale]);
  useEffect(() => () => ui.getState().setPageView(null), [ui]);

  // A page scaled to fit takes the room of its scaled size: the box around
  // it is as tall as the page drawn smaller, kept so as the page grows
  // (here, once the next frame is laid out; FitNow, in the commit that
  // changes the page).
  useLayoutEffect(() => {
    const outer = fit.current;
    const inner = frame.current;
    if (!outer || !inner) return undefined;
    if (scale === 1) {
      outer.style.height = "";
      return undefined;
    }
    const place = () => fitBox(inner, scale);
    place();
    const observer = new ResizeObserver(place);
    observer.observe(inner);
    return () => observer.disconnect();
  }, [scale]);

  // A text left before its editor came is no longer waited for.
  useEffect(() => forgetLeftText(env), [env]);

  // The page's links, buttons and disclosures take no focus on the canvas:
  // Tab goes from block to block's tab stop, not through the page's links.
  // The text being edited is its editor's to draw, links and all, and the
  // clamp keeps its own Tab stop.
  useEffect(() => {
    frame.current?.querySelectorAll<HTMLElement>(".site a[href], .site summary, .site button, .site input, .site textarea, .site select, .site iframe").forEach((element) => {
      if (!element.closest(".ov, .rte, .clamp, .ins, .ins-empty")) element.tabIndex = -1;
    });
  }, [document]);

  // A picker open at a place, or a drag: no seam answers the pointer.
  const picking = useStore(canvasUi(ui), (s) => s.inserting !== null);
  useEffect(() => {
    if (picking || dragType !== null) canvasUi(ui).getState().setSeam(null);
  }, [ui, picking, dragType]);

  // A provider's player never loads on the canvas. Its lazy frame waits in
  // a closed disclosure, but a frame put back into the page loads at once,
  // and React puts a block back when a block dragged past it lands before
  // it in the drag's preview: the canvas keeps no address in the frame,
  // taken out as soon as React draws it. React writes it again only for a
  // new address, which this takes out again.
  useLayoutEffect(() => {
    frame.current?.querySelectorAll<HTMLIFrameElement>(".site iframe[src]").forEach((player) => player.removeAttribute("src"));
  }, [document]);

  // The container a block is dragged out of keeps the height it has once
  // the block is drawn as the indicator: when the indicator goes to a
  // column further down, nothing between them moves up from under the
  // pointer, which would put the pointer past where it was aiming and the
  // indicator back where it came from, and so on.
  const origin = useEditor((s) => (s.drag?.source.kind === "block" ? (locate(s.drag.base, s.drag.source.id)?.parentId ?? null) : null));
  useLayoutEffect(() => {
    if (origin === null) return undefined;
    const element = frame.current?.querySelector<HTMLElement>(`[data-block-id="${origin}"]`);
    if (!element) return undefined;
    // Its layout height, which a page scaled to fit does not change.
    element.style.minHeight = `${element.offsetHeight}px`;
    return () => {
      element.style.minHeight = "";
    };
  }, [origin]);

  // So does every empty column, its large "+" given way to the dragged
  // block once it would land there: a column drawn shorter under the
  // pointer would put the pointer past it, and the block back out.
  const dragging = dragType !== null;
  useLayoutEffect(() => {
    if (!dragging) return undefined;
    const columns = [...(frame.current?.querySelectorAll<HTMLElement>(".ins-empty") ?? [])].map((plus) => plus.parentElement).filter((column): column is HTMLElement => column !== null);
    for (const column of columns) column.style.minHeight = `${column.offsetHeight}px`;
    return () => {
      for (const column of columns) column.style.minHeight = "";
    };
  }, [dragging]);

  // With the keyboard, or from the Outline, the place the block would land
  // stays in view.
  const followedTarget = useEditor((s) => (s.drag && (ui.getState().dragMode === "keyboard" || ui.getState().dragLive) ? `${s.drag.target?.parentId ?? ""} ${s.drag.target?.index ?? ""}` : null));
  useEffect(() => {
    if (followedTarget === null) return;
    frame.current?.querySelector<HTMLElement>("[data-drag-slot], [data-drag-live]")?.scrollIntoView?.({ block: "nearest" });
  }, [followedTarget]);

  const pick = (target: EventTarget | null) => {
    const element = target instanceof Element ? target : null;
    if (!element || element.closest(EDITOR_CONTROLS)) return;
    const root = element.closest<HTMLElement>("[data-block-id]");
    const id = root?.dataset.blockId ?? null;
    store.getState().select(id);
    ui.setState({ tray: "edit", notice: null });
  };
  // The selection when the pointer went down, before the press focused
  // (and so selected) the block under it: a click on the text block that
  // was already selected edits it.
  const selectedAtPress = useRef<string | null>(null);

  const dragClass = dragType === null ? "" : ` canvas-drag canvas-drag-${dragType === "section" || dragType === "column" ? dragType : "widget"}`;
  // A page drawn smaller also says by how much to draw the editor's own
  // controls and words on it back up to their size (editor.css).
  const frameStyle: CSSProperties | undefined = width === undefined
    ? undefined
    : { width: `${width}px`, ...(scale < 1 ? ({ transform: `scale(${scale})`, transformOrigin: "0 0", "--canvas-unscale": String(1 / scale) } as CSSProperties) : {}) };
  return (
    <main
      ref={bench}
      className={`canvas${dragClass}${edges ? " canvas-edges" : ""}`}
      aria-label="Page canvas"
      aria-describedby="canvas_keys"
      tabIndex={-1}
      onClick={(event) => {
        if (event.target === event.currentTarget) pick(null);
      }}
    >
      {/* The editor's own ids hold an underscore, which no section anchor
          can (the schema's pattern): the page drawn here gives its
          sections their anchors as ids, and an ARIA reference takes the
          first element with its id. */}
      <p id="canvas_keys" hidden>Arrow keys select the next or previous block. Space picks the selected block up to move it. Question mark lists every shortcut.</p>
      <EntryShown.Provider value={entryShown}>
      <SourceRef.Provider value={source.ref}>
        <div ref={fit} className={`frame-fit${width !== undefined ? " frame-fixed" : ""}`} style={width === undefined ? undefined : { width: `${width * scale}px` }}>
          <div
            ref={frameRef}
            className={`frame${pageMark?.kind === "shut" ? " frame-shut" : ""}`}
            style={frameStyle}
            data-scale={scale < 1 ? scale.toFixed(4) : undefined}
            onPointerDownCapture={() => {
              selectedAtPress.current = store.getState().selection;
            }}
            onClickCapture={(event) => {
              const element = event.target instanceof Element ? event.target : null;
              // The editor's own controls, the text being edited and its link
              // field take their own clicks.
              if (element?.closest(`${EDITOR_CONTROLS}, .invite, .ov-link, .rte`)) return;
              // A link or a disclosure of the page does nothing on the canvas.
              event.preventDefault();
              // The site's header and footer around a page, and the page
              // around a part, are inert, so a click on them reaches the
              // frame: it opens the part, or goes back to the page.
              const locked = lockedAt(event.currentTarget, event.clientX, event.clientY);
              if (locked && opened) {
                const id = locked === "page" ? around?.id : partOf(opened, locked)?.id;
                if (id !== undefined) {
                  void opened.openPage(id).then((why) => {
                    if (why) ui.getState().say(why);
                  });
                }
                return;
              }
              pick(event.target);
              const root = element?.closest<HTMLElement>("[data-block-id]");
              const id = root?.dataset.blockId;
              // A text or a heading clicked once more opens for writing, the
              // caret where the click was.
              if (id && (root.dataset.blockType === "text" || root.dataset.blockType === "heading") && selectedAtPress.current === id) startEditing(env, id, { x: event.clientX, y: event.clientY });
            }}
            onContextMenu={(event) => {
              // In the text being edited, the browser's own menu (spelling,
              // paste) rather than the block's.
              if (event.target instanceof Element && event.target.closest(".rte, .ov-link")) return;
              const element = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-block-id]") : null;
              const id = element?.dataset.blockId;
              if (!id || store.getState().drag) return;
              openBlockMenu(env, event, id, "canvas");
            }}
            onFocus={(event) => {
              const element = event.target;
              if (!(element instanceof HTMLElement) || element.dataset.blockId === undefined || store.getState().drag) return;
              if (store.getState().selection !== element.dataset.blockId) store.getState().select(element.dataset.blockId);
              // A block wholly under Insert, floating over the canvas, is not
              // seen: Insert gives way.
              giveWayTo(env, element);
            }}
            onPointerOver={(event) => {
              if (store.getState().drag) return;
              // Over a "+" or a seam, no block is outlined.
              const plus = event.target instanceof Element && event.target.closest(".ins, .ins-empty, .seam-tip") !== null;
              const element = !plus && event.target instanceof Element ? event.target.closest<HTMLElement>("[data-block-id]") : null;
              const id = canvasUi(ui).getState().seam === null ? (element?.dataset.blockId ?? null) : null;
              if (ui.getState().hover !== id) ui.getState().setHover(id);
            }}
            onPointerMove={(event) => {
              const locked = store.getState().drag ? null : lockedAt(event.currentTarget, event.clientX, event.clientY);
              if (locked !== lockedHover) setLockedHover(locked);
              if (store.getState().drag || canvasUi(ui).getState().inserting) return;
              const seam = seamAt(event.currentTarget, event.clientX, event.clientY);
              canvasUi(ui).getState().setSeam(seam);
              if (seam !== null && ui.getState().hover !== null) ui.getState().setHover(null);
            }}
            onPointerLeave={() => {
              ui.getState().setHover(null);
              canvasUi(ui).getState().setSeam(null);
              setLockedHover(null);
            }}
            data-locked-hover={lockedHover ?? undefined}
          >
            {isPartKind(kind)
              ? <PartRoot kind={kind} document={shown} ctx={ctx} siteStyle={siteStyle} parts={parts} around={around?.document ?? null} aroundTitle={around?.title ?? null} width={width} />
              : document.sections.length === 0 ? (
                <>
                  <ThemeAround siteStyle={siteStyle} documents={[parts.header]}><SitePart kind="header" document={parts.header} ctx={ctx} locked /></ThemeAround>
                  <Invite />
                  <ThemeAround siteStyle={siteStyle} documents={[parts.footer]}><SitePart kind="footer" document={parts.footer} ctx={ctx} locked /></ThemeAround>
                </>
              ) : <PageRoot document={shown} ctx={ctx} siteStyle={siteStyle} landmark={false} parts={parts} lockedParts editorControls={IN_PAGE_CONTROLS} {...(width === undefined ? {} : { width })} />}
          </div>
          <FitNow frame={frame} scale={scale} />
        </div>
      </SourceRef.Provider>
      </EntryShown.Provider>
      {/* Outside the page, which may be drawn smaller: at the editor's own
          size, and scrolling with the page. */}
      <InsertPicker />
    </main>
  );
}

// The editor's own controls on the page, whose clicks are their own.
const EDITOR_CONTROLS = ".clamp, .ins, .ins-empty, .ins-slot-wrap, .seam, .seam-tip";

// Everything of the editor's drawn inside the page root: the site's custom
// CSS stops at them (@scope's lower boundary), so a rule of its own for
// button, a or span never restyles the editor's keys on the canvas, nor
// the drop line and its label while a block is dragged.
const IN_PAGE_CONTROLS = ".clamp, .drop-ui, .ins, .ins-big, .ins-empty, .ins-point, .ins-sec, .ins-slot-wrap, .ov, .ov-link, .seam, .seam-hover, .seam-tip, .chrome";

// How near a seam between two sections the pointer must be for it to
// answer, in the window's pixels.
const SEAM_REACH = 12;

// The seam the pointer is over: 0 above the first section, n below the
// n-th; none away from them, or beside the page.
function seamAt(frame: Element, x: number, y: number): number | null {
  const sections = [...frame.querySelectorAll<HTMLElement>(".sw-main > [data-block-type=section]")];
  if (sections.length === 0) return null;
  const first = sections[0]!.getBoundingClientRect();
  if (x < first.left || x > first.right) return null;
  const edges = [first.top, ...sections.map((section) => section.getBoundingClientRect().bottom)];
  const at = edges.findIndex((edge) => Math.abs(y - edge) <= SEAM_REACH);
  return at < 0 ? null : at;
}

// A page root around the site's header or footer alone, with the site's
// style, for the empty page: the invitation to add a section sits between
// them, outside the page's stylesheets' reach. The documents are those it
// draws, for their free colours and their free type.
function ThemeAround({ siteStyle, documents, children }: { siteStyle: SiteStyleChoice | null; documents: readonly unknown[]; children: ReactNode }) {
  return (
    <div className="site" {...siteStyleAttributes(siteStyle)}>
      <FreeColorsStyle palette={siteStyle?.palette} documents={documents} />
      <FreeTypeStyle documents={documents} />
      <CustomCssStyle css={siteStyle?.customCss} leave={IN_PAGE_CONTROLS} />
      <div className="sw">{children}</div>
    </div>
  );
}

// What locked thing of the canvas a point falls on: the site's header or
// footer around a page, which a click opens, or the page around a part,
// which a click goes back to.
type LockedPlace = PartKind | "page";

const holds = (element: Element, x: number, y: number) => {
  const box = element.getBoundingClientRect();
  return box.width > 0 && x >= box.left && x <= box.right && y >= box.top && y <= box.bottom;
};

function lockedAt(frame: Element, x: number, y: number): LockedPlace | null {
  for (const element of frame.querySelectorAll<HTMLElement>("[data-theme-part], [data-around-page]")) {
    if (!holds(element, x, y)) continue;
    if (element.dataset.aroundPage !== undefined) return "page";
    return element.dataset.themePart === "footer" ? "footer" : "header";
  }
  return null;
}

// A part being edited: its sections, editable, in the element the
// published page draws it in, header or footer, so the part looks as it
// will; the page opened last around it, dimmed and locked, and the other
// part locked, as a visitor sees them together. An empty part takes the
// invitation to add a section in its place, outside the page's
// stylesheets' reach.
function PartRoot({ kind, document, ctx, siteStyle, parts, around, aroundTitle, width }: {
  kind: PartKind;
  document: PageDocument;
  ctx: RenderContext;
  siteStyle: SiteStyleChoice | null;
  parts: PartsShown;
  around: PageDocument | null;
  aroundTitle: string | null;
  width: number | undefined;
}) {
  // The page around and the other part are drawn with nothing of the
  // editor's: no selection, no "+", no drop target.
  const quiet = useMemo<RenderContext>(() => partContext(ctx, false), [ctx]);
  const sized = width === undefined ? undefined : { width: `${width}px` };
  const Element = kind;
  const editing = document.sections.length === 0
    ? null
    : <Element className={`sw-${kind} sw-editing`} data-editing-part={kind} data-sticky={stickyHeader(kind, document) ?? undefined}><div className="sw-main"><PageSections document={document} ctx={ctx} /></div></Element>;
  const page = (
    <div className="sw-around" inert data-around-page="" aria-label={aroundTitle ? `${aroundTitle}, the page around the ${kind}` : undefined}>
      {around && around.sections.length > 0 ? <PageSections document={around} ctx={quiet} /> : <p className="around-none chrome">The page goes here.</p>}
    </div>
  );
  const otherDocument = kind === "header" ? parts.footer : parts.header;
  const other = <SitePart kind={kind === "header" ? "footer" : "header"} document={otherDocument} ctx={quiet} locked />;
  if (!editing) {
    return (
      <>
        {kind === "footer" && <ThemeAround siteStyle={siteStyle} documents={[otherDocument, around]}>{other}{page}</ThemeAround>}
        <Invite part={kind} />
        {kind === "header" && <ThemeAround siteStyle={siteStyle} documents={[around, otherDocument]}>{page}{other}</ThemeAround>}
      </>
    );
  }
  return (
    <div className="site" {...siteStyleAttributes(siteStyle)} style={sized}>
      <FreeColorsStyle palette={siteStyle?.palette} documents={[document, around, otherDocument]} />
      <FreeTypeStyle documents={[document, around, otherDocument]} />
      <CustomCssStyle css={siteStyle?.customCss} leave={IN_PAGE_CONTROLS} />
      <div className="sw">
        {kind === "header" ? editing : other}
        {page}
        {kind === "footer" ? editing : other}
      </div>
    </div>
  );
}

// The page's margin on each side of the canvas (editor.css, .frame-fit):
// with a thin scrollbar showing, the page is 1088 wide in a 1440 window
// and gets its desktop layout in a 1280 one (design/layout/NOTES.md,
// section 4.8). Beside a pushed drawer (any, on a desktop) the left margin
// is 12: the page is then 807 wide at 1440, still the desktop layout.
const FRAME_MARGIN = 19;
const FRAME_MARGIN_PUSHED = 12;

// The box around a page drawn smaller (.frame-fit, its parent) made as
// tall as the page drawn smaller: a transform leaves the page's own
// height in the layout, and the canvas would scroll as far as that.
function fitBox(page: HTMLElement, scale: number): void {
  const box = page.parentElement;
  if (box) box.style.height = `${page.offsetHeight * scale}px`;
}

// The same, in the commit that changes the page, where the Canvas's
// observer does it only once the next frame is laid out: a window that
// stands beside a place on the page (./place-dialog.ts) is placed by a
// layout effect of the picker, in that commit, and reads how far the
// canvas scrolls. React runs a
// tree's layout effects in its order, and this comes before the picker.
// Without it, a key dropped near the end of a page drawn smaller (a canvas
// with less than the desktop page's 800 of room: a 1024 or 1100 window
// with Insert open) had its window placed against the box still as tall
// as the drag's preview, and the canvas, clamped a frame later, moved the
// line under it: by 152 px at 1024 by 768.
function FitNow({ frame, scale }: { frame: RefObject<HTMLDivElement | null>; scale: number }) {
  useLayoutEffect(() => {
    if (scale !== 1 && frame.current) fitBox(frame.current, scale);
  });
  return null;
}

// ------------------------------------------------------- the empty page

function Invite({ part }: { part?: PartKind }) {
  const { store, newId } = useEnv();
  const { insertMade } = useInsert();
  const [picking, setPicking] = useState(false);
  const canPublish = useOptionalSession()?.capabilities.publish ?? false;
  // A collection's template is built as a page is, and drawn on every
  // entry's own page; like a part, it may be published empty.
  const template = useOpenKind() === "template";
  const name = part ? PART_NAMES[part].toLowerCase() : template ? "template" : "page";
  const addPreset = (preset: Preset, image?: ImageRef) => {
    const doc = store.getState().document;
    return insertMade(makeInsert(doc, presetSection(doc, preset, newId, image), { parentId: null, index: doc.sections.length }));
  };
  return (
    <div className="invite chrome">
      <div className="invite-zone">
        {/* The page's first seam, open: the section picker laid out on the page. */}
        <div className="invite-title">
          <span className="ins ins-sec is-static" aria-hidden="true"><Icon name="plus" className="li" /></span>
          <h2>Start this {name} with a section</h2>
        </div>
        <p>{part ? `A section is a band across the ${name}, on every page. Pick its columns; you can change them later. Logo and Menu are in Insert, under Site.` : template ? "A section is a band across the template, on every entry’s page. Pick its columns; you can change them later. The entry’s own title and fields are in Insert, under This entry." : "A section is a band across the page. Pick its columns; you can change them later."}</p>
        {canPublish && !part && !template && <p className="invite-publish"><Icon name="info" className="i i-xs" />Publish turns on once the page has a section. An empty page has nothing to publish.</p>}
        {canPublish && part && <p className="invite-publish"><Icon name="info" className="i i-xs" />Published empty, the site has no {name}.</p>}
        <div className="invite-layouts" role="group" aria-label="Add a section">
          {[1, 2, 3, 4].map((n) => (
            <button key={n} type="button" className="layout-btn" onClick={() => insertMade(makeInsertSection(store.getState().document, n, 0, newId))}>
              <span className="layout-pic" style={{ "--n": n } as CSSProperties}>{Array.from({ length: n }, (_, i) => <i key={i} />)}</span>
              {n} {plural("column", n)}
            </button>
          ))}
        </div>
        <h3 className="invite-sub" id="invite_presets">Or start from a ready-made section</h3>
        <div className="invite-presets" role="group" aria-labelledby="invite_presets">
          {(Object.keys(PRESET_LABELS) as Preset[]).map((preset) => (
            <button
              key={preset}
              type="button"
              className="preset"
              aria-haspopup={preset === "picture" ? "dialog" : undefined}
              onClick={() => (preset === "picture" ? setPicking(true) : addPreset(preset))}
            >
              {PRESET_PICTURES[preset]}<span>{PRESET_LABELS[preset]}</span>
            </button>
          ))}
        </div>
        <p className="invite-alt"><Icon name="block" className="i i-xs" /><span>Blocks go inside a column, so the section comes first. Each empty column then shows a large <span className="ins-glyph" role="img" aria-label="plus"><Icon name="plus" className="li" /></span> that offers them.</span></p>
      </div>
      {picking && (
        <ImagePicker
          confirm="Add section"
          onClose={() => setPicking(false)}
          onPick={([image]) => {
            const refusal = image ? addPreset("picture", image) : null;
            if (refusal === null) setPicking(false);
            return refusal;
          }}
        />
      )}
    </div>
  );
}
