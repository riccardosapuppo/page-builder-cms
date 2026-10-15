// Every change the editor makes to a page, as a command: a value that says
// what kind of change it is, how the history names it, which block it is
// about, and the steps (./ops.ts) that make it. A command is made from the
// page as it is and carries everything that is not deterministic from the
// moment it is made: the ids of a duplicate, a paste or a new section, the
// media id of an upload that has finished. Applying it (./reducer.ts) only
// replays its steps, so redoing it gives the same page every time, and its
// inverse is its steps read backwards.
//
// The makers check what they can see at once (the block exists, the type
// may go there, the preset fits the columns) and refuse with a sentence;
// the reducer checks what the schema says when the command is applied.
import {
  ACCORDION_ITEM_KEYS, COLUMN_WIDTHS_BY_COUNT, DEVICES, DOCUMENT_KEYS, FORM_FIELD_KEYS, IMAGE_PROPS_KEYS, IMAGE_REF_KEYS, itemsKey, MENU_LINK_KEYS, PRICING_PLAN_KEYS, PROP_KEYS, STATS_ITEM_KEYS,
  STEPS_ITEM_KEYS, STYLE_TOKEN_KEYS,
  type Block, type BlockType, type ColumnBlock, type ColumnWidthsToken, type Device, type PageDocument, type SectionBlock, type StackToken,
  type StyleTokens, type WidgetBlock,
} from "../shared/document.ts";
import { checkNesting, nestingMessage, refusal, type CommandError } from "./check.ts";
import { idDraw, reidentify, type NewId } from "./ids.ts";
import { copyJson, isObject, keyIndex, sameJson, withKey, withoutKey, type Json } from "./json.ts";
import {
  blockName, blockWithPlace, containerName, FIELD_NAMES, ITEM_NAMES, onDevice, placeOf, plural, STYLE_KEY_NAMES, tokenName, TYPE_NAMES,
} from "./labels.ts";
import { canContain } from "./nesting.ts";
import { invertOp, type Op, type Path } from "./ops.ts";
import { allBlocks, childrenOf, locate, typeOf, type AnyBlock, type ParentId, type Position } from "./tree.ts";

export type CommandKind =
  | "insert" | "delete" | "move" | "duplicate" | "paste"
  | "props" | "style" | "columnWidths" | "stack" | "columns" | "page" | "items";

// The block a command is about, and for a list command the item: where
// the editor puts the focus once it is applied (./reducer.ts).
export interface Subject {
  id: string;
  item?: number;
}

export interface Command {
  kind: CommandKind;
  // For the history, in en-US: "Deleted Divider in Hero".
  label: string;
  subject: Subject | null;
  ops: readonly Op[];
}

export type Made = { ok: true; command: Command } | { ok: false; error: CommandError };

// In an update, takes the key out: the key becomes absent, which is what an
// unset value is in a page document.
export const REMOVE: unique symbol = Symbol("remove");
export type Updates = Readonly<Record<string, Json | typeof REMOVE>>;

// The inverse: the same command, its steps undone in reverse order. The
// label and the subject stay, so the history can say what was undone.
export function invertCommand(command: Command): Command {
  return { ...command, ops: command.ops.toReversed().map(invertOp) };
}

const made = (kind: CommandKind, label: string, subject: Subject | null, ops: Op[]): Made =>
  ops.length === 0
    ? { ok: false, error: refusal("nothing", "That would change nothing.") }
    : { ok: true, command: { kind, label, subject, ops } };
const refuse = (error: CommandError): Made => ({ ok: false, error });
const unknown = (id: string): Made => refuse(refusal("unknown", `There is no block ${id} on the page.`));

// --------------------------------------------------------- key changes

// The order keys are written in, from the schema's own order, so a key the
// editor adds lands where a person reading the JSON expects it. A key that
// is already there keeps its place.
function propOrder(type: BlockType): readonly string[] {
  if (type === "image") return IMAGE_PROPS_KEYS;
  return Object.keys(PROP_KEYS[type]);
}

function canonicalAt(object: Record<string, unknown>, key: string, order: readonly string[]): number {
  const rank = (k: string): number => {
    const found = order.indexOf(k);
    return found === -1 ? order.length : found;
  };
  return Object.keys(object).filter((k) => rank(k) <= rank(key)).length;
}

// The set steps that turn `object` (at `path` in block `id`, or in the page
// for id null) into it with `updates` applied. A REMOVE of an absent key
// and a value equal to the present one make no step.
function keySteps(id: string | null, path: Path, object: Record<string, unknown>, updates: Updates, order: readonly string[]): {
  ops: Op[];
  result: Record<string, unknown>;
} {
  const ops: Op[] = [];
  let current = object;
  for (const [key, value] of Object.entries(updates)) {
    const has = Object.hasOwn(current, key);
    if (value === REMOVE) {
      if (!has) continue;
      ops.push({ op: "set", id, path, key, before: copyJson(current[key]) as Json, at: keyIndex(current, key) });
      current = withoutKey(current, key);
    } else if (has) {
      if (sameJson(current[key], value)) continue;
      ops.push({ op: "set", id, path, key, before: copyJson(current[key]) as Json, after: copyJson(value) });
      current = withKey(current, key, value);
    } else {
      const at = canonicalAt(current, key, order);
      ops.push({ op: "set", id, path, key, after: copyJson(value), at });
      current = withKey(current, key, value, at);
    }
  }
  return { ops, result: current };
}

// ------------------------------------------------------- column widths

// The widths preset names one part per column, so it cannot outlive a
// change in the number of columns: the step that takes it out goes with
// any insert, removal or move that changes the count. Where the columns
// stack means nothing to a section left with one column, which the schema
// refuses it for: given the count after the change, the step that takes it
// out goes too.
function clearWidths(doc: PageDocument, sectionId: string | null, countAfter?: number): Op[] {
  if (sectionId === null) return [];
  const section = locate(doc, sectionId)?.block;
  if (section?.type !== "section") return [];
  const ops: Op[] = [];
  let props = section.props as Record<string, unknown>;
  if (section.props.columnWidths !== undefined) {
    ops.push({ op: "set", id: sectionId, path: ["props"], key: "columnWidths", before: section.props.columnWidths, at: keyIndex(props, "columnWidths") });
    props = withoutKey(props, "columnWidths");
  }
  if (countAfter !== undefined && countAfter < 2 && section.props.stack !== undefined) {
    ops.push({ op: "set", id: sectionId, path: ["props"], key: "stack", before: section.props.stack, at: keyIndex(props, "stack") });
  }
  return ops;
}

// How many columns a section holds now.
function columnCount(doc: PageDocument, sectionId: string | null): number {
  if (sectionId === null) return 0;
  const section = locate(doc, sectionId)?.block;
  return section?.type === "section" ? section.children.length : 0;
}

// Moving a column inside its section moves its part of the preset with
// it: the wide column stays wide.
function permuteWidths(doc: PageDocument, sectionId: string, from: number, to: number): Op[] {
  const section = locate(doc, sectionId)?.block;
  if (section?.type !== "section" || section.props.columnWidths === undefined) return [];
  const parts = section.props.columnWidths.split(":");
  const [part] = parts.splice(from, 1);
  if (part === undefined) return [];
  parts.splice(to, 0, part);
  const after = parts.join(":");
  if (after === section.props.columnWidths) return [];
  const allowed: readonly string[] = COLUMN_WIDTHS_BY_COUNT[section.children.length as 1 | 2 | 3 | 4] ?? [];
  if (!allowed.includes(after)) return clearWidths(doc, sectionId);
  return [{ op: "set", id: sectionId, path: ["props"], key: "columnWidths", before: section.props.columnWidths, after }];
}

// -------------------------------------------------------- new blocks

export function newColumn(draw: () => string): ColumnBlock {
  return { id: draw(), type: "column", props: {}, children: [], style: { base: {} } };
}

// A section of `columns` empty columns, as the widget panel's Section tile
// and the empty page's "2 columns" make it.
export function newSection(columns: number, draw: () => string): SectionBlock {
  const id = draw();
  return { id, type: "section", props: {}, children: Array.from({ length: columns }, () => newColumn(draw)), style: { base: {} } };
}

// --------------------------------------------------------------- insert

function insertLabel(doc: PageDocument, verb: string, block: Block, at: Position): string {
  if (block.type === "section") {
    const columns = block.children.length;
    return block.props.label ? `${verb} section ${block.props.label}` : `${verb} a section with ${columns} ${plural("column", columns)}`;
  }
  const into = verb === "Pasted" ? "into" : "to";
  if (block.type === "column") return `${verb} a column ${into} ${containerName(doc, at.parentId)}`;
  return `${verb} ${TYPE_NAMES[block.type]} ${into} ${containerName(doc, at.parentId)}`;
}

function insertSteps(doc: PageDocument, block: Block, at: Position): Op[] | CommandError {
  const container = typeOf(doc, at.parentId);
  if (container === undefined) return refusal("unknown", `There is no block ${String(at.parentId)} on the page.`);
  const nesting = checkNesting(container, block.type);
  if (nesting) return nesting;
  const length = childrenOf(doc, at.parentId)?.length ?? 0;
  if (!Number.isInteger(at.index) || at.index < 0 || at.index > length) return refusal("noTarget", `There is no place ${at.index} in ${containerName(doc, at.parentId)}.`);
  return [...(block.type === "column" ? clearWidths(doc, at.parentId) : []), { op: "insert", at, block: copyJson(block) }];
}

// A block made elsewhere (the widget panel's template, with its ids drawn
// already) put at a place.
export function makeInsert(doc: PageDocument, block: Block, at: Position): Made {
  const ops = insertSteps(doc, block, at);
  if (!Array.isArray(ops)) return refuse(ops);
  return made("insert", insertLabel(doc, "Added", block, at), { id: block.id }, ops);
}

export function makeInsertSection(doc: PageDocument, columns: number, index: number, newId: NewId): Made {
  return makeInsert(doc, newSection(columns, idDraw(doc, newId)), { parentId: null, index });
}

// An image whose upload has finished: the command is made only then, with
// the media id the library gave, so nothing half uploaded is ever on the
// page and redoing it never uploads again. (The file on its way up is the
// storage adapter's Upload.)
export type UploadedImage = { mediaId: string; alt: string } | { mediaId: string; decorative: true };

export function makeInsertUploadedImage(doc: PageDocument, upload: UploadedImage, at: Position, newId: NewId): Made {
  const props = "decorative" in upload ? { mediaId: upload.mediaId, decorative: true as const } : { mediaId: upload.mediaId, alt: upload.alt };
  const image: WidgetBlock = { id: idDraw(doc, newId)(), type: "image", props, children: [], style: { base: {} } };
  return makeInsert(doc, image, at);
}

// --------------------------------------------------------------- delete

export function makeDelete(doc: PageDocument, id: string): Made {
  const found = locate(doc, id);
  if (!found) return unknown(id);
  const at = { parentId: found.parentId, index: found.index };
  const ops: Op[] = [...(found.block.type === "column" ? clearWidths(doc, found.parentId, columnCount(doc, found.parentId) - 1) : []), { op: "remove", at, block: copyJson(found.block) }];
  return made("delete", `Deleted ${blockWithPlace(doc, id)}`, { id }, ops);
}

// ----------------------------------------------------------------- move

// `to.index` counts the destination's children once the block has left
// its old place: moving the first of three to the end is index 2.
export function makeMove(doc: PageDocument, id: string, to: Position): Made {
  const found = locate(doc, id);
  if (!found) return unknown(id);
  const container = typeOf(doc, to.parentId);
  if (container === undefined) return refuse(refusal("unknown", `There is no block ${String(to.parentId)} on the page.`));
  const nesting = checkNesting(container, found.block.type);
  if (nesting) return refuse(nesting);
  const sameParent = to.parentId === found.parentId;
  if (sameParent && to.index === found.index) return refuse(refusal("nothing", `${blockName(doc, id)} is already there.`));
  // A block cannot go inside itself or a block of its own.
  for (let up: ParentId = to.parentId; up !== null; up = locate(doc, up)?.parentId ?? null) {
    if (up === id) return refuse(refusal("nesting", `${blockName(doc, id)} cannot go inside itself.`));
  }
  const length = (childrenOf(doc, to.parentId)?.length ?? 0) - (sameParent ? 1 : 0);
  if (!Number.isInteger(to.index) || to.index < 0 || to.index > length) return refuse(refusal("noTarget", `There is no place ${to.index} in ${containerName(doc, to.parentId)}.`));

  const ops: Op[] = [];
  if (found.block.type === "column" && found.parentId !== null && to.parentId !== null) {
    if (sameParent) ops.push(...permuteWidths(doc, found.parentId, found.index, to.index));
    else ops.push(...clearWidths(doc, found.parentId, columnCount(doc, found.parentId) - 1), ...clearWidths(doc, to.parentId));
  }
  ops.push({ op: "move", id, from: { parentId: found.parentId, index: found.index }, to });
  const label = sameParent
    ? `Moved ${blockWithPlace(doc, id)}`
    : `Moved ${blockName(doc, id)} to ${containerName(doc, to.parentId)}`;
  return made("move", label, { id }, ops);
}

// ------------------------------------------------- duplicate and paste

export function makeDuplicate(doc: PageDocument, id: string, newId: NewId): Made {
  const found = locate(doc, id);
  if (!found) return unknown(id);
  const copy = reidentify(found.block, idDraw(doc, newId));
  const ops = insertSteps(doc, withoutTakenAnchor(doc, copy), { parentId: found.parentId, index: found.index + 1 });
  if (!Array.isArray(ops)) return refuse(ops);
  return made("duplicate", `Duplicated ${blockWithPlace(doc, id)}`, { id: copy.id }, ops);
}

// Where a paste goes, from what is selected: after the selected block when
// its container may hold the pasted type; else inside the selected block,
// at the end, when it may; else after the nearest block above that can
// have it as a sibling. With nothing selected, at the end of the page.
export function pasteTarget(doc: PageDocument, type: BlockType, selection: string | null): Position | null {
  if (selection === null) return canContain("page", type) ? { parentId: null, index: doc.sections.length } : null;
  const selected = locate(doc, selection);
  if (!selected) return null;
  if (canContain(typeOf(doc, selected.parentId) ?? "page", type)) return { parentId: selected.parentId, index: selected.index + 1 };
  if (canContain(selected.block.type, type)) return { parentId: selection, index: selected.block.children.length };
  for (let up = selected.parentId; up !== null;) {
    const above = locate(doc, up);
    if (!above) return null;
    if (canContain(typeOf(doc, above.parentId) ?? "page", type)) return { parentId: above.parentId, index: above.index + 1 };
    up = above.parentId;
  }
  return null;
}

// A block from the clipboard (./clipboard.ts reads and checks it), with new
// ids for it and everything under it.
export function makePaste(doc: PageDocument, block: Block, selection: string | null, newId: NewId): Made {
  const at = pasteTarget(doc, block.type, selection);
  if (!at) {
    const where = selection === null ? "page" : (locate(doc, selection)?.block.type ?? "page");
    return refuse(refusal("noTarget", `Nowhere to paste ${TYPE_NAMES[block.type]} here. ${nestingMessage(block.type, where)}`));
  }
  const copy = reidentify(block, idDraw(doc, newId));
  const ops = insertSteps(doc, withoutTakenAnchor(doc, copy), at);
  if (!Array.isArray(ops)) return refuse(ops);
  return made("paste", insertLabel(doc, "Pasted", copy, at), { id: copy.id }, ops);
}

// A block's anchor is its address on the page, which no other block may
// have (the application rules refuse it), so a copy, and every block under
// it, keeps an anchor only where the page does not use it yet: a duplicate
// never does, a block pasted from another page may.
function withoutTakenAnchor(doc: PageDocument, copy: Block): Block {
  const taken = new Set<string>();
  for (const { block } of allBlocks(doc)) if (block.props.anchor !== undefined) taken.add(block.props.anchor);
  const strip = (block: AnyBlock): AnyBlock => {
    const { anchor, ...rest } = block.props;
    const props = typeof anchor === "string" && taken.has(anchor) ? rest : block.props;
    const children = block.children.map(strip);
    return props === block.props && children.every((child, k) => child === block.children[k]) ? block : { ...block, props, children };
  };
  return strip(copy as unknown as AnyBlock) as unknown as Block;
}

// ----------------------------------------------------------- properties

export function makeSetProps(doc: PageDocument, id: string, updates: Updates): Made {
  const found = locate(doc, id);
  if (!found) return unknown(id);
  const { block } = found;
  const { ops } = keySteps(id, ["props"], block.props as Record<string, unknown>, updates, propOrder(block.type));
  return made("props", propsLabel(doc, block, updates), { id }, ops);
}

// "Changed Button text in Join", "Changed Quote in Members' words",
// "Renamed section to Questions".
function propsLabel(doc: PageDocument, block: Block, updates: Updates): string {
  const keys = Object.keys(updates);
  const name = blockName(doc, block.id);
  if (block.type === "section" && keys.length === 1 && keys[0] === "label") {
    const label = updates.label;
    return typeof label === "string" ? `Renamed section to ${label}` : `Removed the label of ${name}`;
  }
  const fields = new Set(keys.map((key) => FIELD_NAMES[block.type]?.[key] ?? name));
  const [only] = fields;
  const what = fields.size === 1 && only !== undefined ? only : name;
  if (block.type === "section") return what === name ? `Changed ${name}` : `Changed ${what} of ${name}`;
  return `Changed ${what}${placeOf(doc, block.id)}`;
}

// ---------------------------------------------------------------- style

export type StyleUpdates = { readonly [K in keyof StyleTokens]?: NonNullable<StyleTokens[K]> | typeof REMOVE };

// One device's style of a block. Removing the last override of tablet or
// phone removes the override object too: the schema refuses an empty one,
// and an absent key is what "as on desktop" is.
export function makeSetStyle(doc: PageDocument, id: string, device: Device, updates: StyleUpdates): Made {
  const found = locate(doc, id);
  if (!found) return unknown(id);
  const style = found.block.style as unknown as Record<string, unknown>;
  const ops: Op[] = [];
  const existing = style[device];
  let part: Record<string, unknown> = isObject(existing) ? existing : {};
  const sets = Object.values(updates).some((value) => value !== REMOVE);
  if (!isObject(existing)) {
    if (!sets) return made("style", "", { id }, []);
    ops.push({ op: "set", id, path: ["style"], key: device, after: {}, at: canonicalAt(style, device, DEVICES) });
  }
  const steps = keySteps(id, ["style", device], part, updates as Updates, STYLE_TOKEN_KEYS);
  ops.push(...steps.ops);
  part = steps.result;
  if (device !== "base" && Object.keys(part).length === 0 && steps.ops.length > 0) {
    const index = isObject(existing) ? keyIndex(style, device) : canonicalAt(style, device, DEVICES);
    ops.push({ op: "set", id, path: ["style"], key: device, before: {}, at: index });
  }
  if (steps.ops.length === 0) return made("style", "", { id }, []);
  return made("style", styleLabel(doc, id, device, updates), { id }, ops);
}

function styleLabel(doc: PageDocument, id: string, device: Device, updates: StyleUpdates): string {
  const entries = Object.entries(updates) as Array<[keyof StyleTokens, string | typeof REMOVE]>;
  const where = blockWithPlace(doc, id);
  const [first] = entries;
  if (entries.length === 1 && first) {
    const [key, value] = first;
    return value === REMOVE
      ? `Cleared ${STYLE_KEY_NAMES[key]}${onDevice(device)}, ${where}`
      : `Set ${STYLE_KEY_NAMES[key]} to ${tokenName(value)}${onDevice(device)}, ${where}`;
  }
  return `Changed the style${onDevice(device)} of ${where}`;
}

// -------------------------------------------------------- column widths

// A section's widths preset, or "equal" for none. The preset must have one
// part per column: two columns take 3:2, 2:3, 2:1, 1:2, fit:1 or 1:fit;
// three take 2:1:1, 1:2:1, 1:1:2 or fit:1:fit; one and four take none. A
// fit part is a column as wide as what it holds.
export function makeSetColumnWidths(doc: PageDocument, sectionId: string, preset: ColumnWidthsToken | "equal"): Made {
  const found = locate(doc, sectionId);
  if (found?.block.type !== "section") return unknown(sectionId);
  const section = found.block;
  const count = section.children.length;
  const allowed: readonly string[] = COLUMN_WIDTHS_BY_COUNT[count as 1 | 2 | 3 | 4] ?? [];
  const name = blockName(doc, sectionId);
  if (preset !== "equal" && !allowed.includes(preset)) {
    const choices = allowed.length === 0 ? "only equal widths" : `${allowed.slice(0, -1).join(", ")} or ${allowed.at(-1) ?? ""}`;
    return refuse(refusal("invalid", `${name} has ${count} ${plural("column", count)}: its widths can be ${choices}.`));
  }
  const { ops } = keySteps(sectionId, ["props"], section.props as Record<string, unknown>, { columnWidths: preset === "equal" ? REMOVE : preset }, propOrder("section"));
  return made("columnWidths", preset === "equal" ? `Set equal column widths in ${name}` : `Set the column widths of ${name} to ${preset}`, { id: sectionId }, ops);
}

// Where a section's columns go one under the other: "tablet" (tablets and
// phones, the setting's absence), "phone" (phones only) or "never". A
// section of one column has nothing to stack.
export const STACK_WORDS: Readonly<Record<StackToken | "tablet", string>> = {
  tablet: "on tablets and phones",
  phone: "on phones only",
  never: "never",
};

export function makeSetStack(doc: PageDocument, sectionId: string, stack: StackToken | "tablet"): Made {
  const found = locate(doc, sectionId);
  if (found?.block.type !== "section") return unknown(sectionId);
  const section = found.block;
  const name = blockName(doc, sectionId);
  if (stack !== "tablet" && section.children.length < 2) return refuse(refusal("invalid", `${name} has 1 column: there is nothing to stack.`));
  const { ops } = keySteps(sectionId, ["props"], section.props as Record<string, unknown>, { stack: stack === "tablet" ? REMOVE : stack }, propOrder("section"));
  const label = stack === "never" ? `Set the columns of ${name} to never stack` : `Set the columns of ${name} to stack ${STACK_WORDS[stack]}`;
  return made("stack", label, { id: sectionId }, ops);
}

// A section's number of columns. New columns are empty and go at the end.
// Fewer columns keep their widgets: those of the columns that go are moved,
// in order, to the end of the last column that stays, so nothing on the
// page is lost by a change of layout.
export function makeSetColumnCount(doc: PageDocument, sectionId: string, count: number, newId: NewId): Made {
  const found = locate(doc, sectionId);
  if (found?.block.type !== "section") return unknown(sectionId);
  const section = found.block;
  const current = section.children.length;
  if (!Number.isInteger(count) || count < 1) return refuse(refusal("empty", `${blockName(doc, sectionId)} must keep at least 1 column.`));
  const ops: Op[] = [...clearWidths(doc, sectionId, count)];
  if (count > current) {
    const draw = idDraw(doc, newId);
    for (let index = current; index < count; index++) ops.push({ op: "insert", at: { parentId: sectionId, index }, block: newColumn(draw) });
  } else if (count < current) {
    const keeper = section.children[count - 1];
    if (!keeper) return unknown(sectionId);
    let length = keeper.children.length;
    for (const column of section.children.slice(count)) {
      for (const widget of column.children) {
        ops.push({ op: "move", id: widget.id, from: { parentId: column.id, index: 0 }, to: { parentId: keeper.id, index: length } });
        length += 1;
      }
      ops.push({ op: "remove", at: { parentId: sectionId, index: count }, block: copyJson({ ...column, children: [] }) });
    }
  }
  return made("columns", `Changed ${blockName(doc, sectionId)} to ${count} ${plural("column", count)}`, { id: sectionId }, ops);
}

// ----------------------------------------------------------------- page

// The page's own keys: its title and description, or, for the site's
// header, whether it stays at the top of the window.
export function makeSetPage(doc: PageDocument, updates: { title?: string; description?: string | typeof REMOVE; sticky?: true | typeof REMOVE }): Made {
  const { ops } = keySteps(null, [], doc as unknown as Record<string, unknown>, updates, Object.keys(DOCUMENT_KEYS));
  const keys = Object.keys(updates);
  const label = keys.length === 1 && keys[0] === "sticky"
    ? (updates.sticky === REMOVE ? "Let the header scroll with the page" : "Made the header stay at the top")
    : keys.length === 1 && keys[0] === "description" && updates.description === REMOVE
      ? "Removed the page description"
      : keys.length === 1 ? `Changed the page ${keys[0] === "title" ? "title" : "description"}` : "Changed the page title and description";
  return made("page", label, null, ops);
}

// The whole page given way to another one, as a reload after a conflict
// takes the server's: every section out, every section of the other page
// in, its title and description. One command, so its inverse puts this
// page back as it was and undo can bring it back. `label` says where the
// other page came from.
export function makeReplacePage(doc: PageDocument, next: PageDocument, label: string): Made {
  if (sameJson(doc, next)) return refuse(refusal("nothing", "The page is the same already."));
  const ops: Op[] = [];
  for (let index = doc.sections.length - 1; index >= 0; index -= 1) {
    ops.push({ op: "remove", at: { parentId: null, index }, block: copyJson(doc.sections[index]!) as Block });
  }
  next.sections.forEach((section, index) => ops.push({ op: "insert", at: { parentId: null, index }, block: copyJson(section) as Block }));
  const updates: Updates = { title: next.title, description: next.description ?? REMOVE, sticky: next.sticky ?? REMOVE };
  ops.push(...keySteps(null, [], doc as unknown as Record<string, unknown>, updates, Object.keys(DOCUMENT_KEYS)).ops);
  return made("page", label, null, ops);
}

// ---------------------------------------------------------------- items

// The lists of a widget's props whose items have commands of their own: a
// gallery's images, an accordion's questions, a stats block's figures, a
// steps block's steps, a pricing block's plans, a form's fields; with the
// path to the list, its props' items, or a pricing block's plans.
function itemList(doc: PageDocument, id: string): { block: Block; path: Path; items: readonly Json[]; one: string; many: string; order: readonly string[] } | null {
  const block = locate(doc, id)?.block;
  if (!block) return null;
  const names = ITEM_NAMES[block.type];
  const key = itemsKey(block.type);
  const items = (block.props as Record<string, unknown>)[key];
  if (!names || !Array.isArray(items)) return null;
  const order = block.type === "accordion" ? Object.keys(ACCORDION_ITEM_KEYS)
    : block.type === "stats" ? Object.keys(STATS_ITEM_KEYS)
    : block.type === "steps" ? Object.keys(STEPS_ITEM_KEYS)
    : block.type === "pricing" ? Object.keys(PRICING_PLAN_KEYS)
    : block.type === "form" ? Object.keys(FORM_FIELD_KEYS)
    : block.type === "menu" ? Object.keys(MENU_LINK_KEYS)
    : IMAGE_REF_KEYS;
  return { block, path: ["props", key], items: items as Json[], ...names, order };
}

// Items put at `index`, in order: images whose uploads have finished, each
// with its media id, or new questions.
export function makeInsertItems(doc: PageDocument, id: string, index: number, items: readonly Json[]): Made {
  const list = itemList(doc, id);
  if (!list) return unknown(id);
  if (!Number.isInteger(index) || index < 0 || index > list.items.length) return refuse(refusal("noTarget", `There is no place ${index} in ${blockWithPlace(doc, id)}.`));
  const ops: Op[] = items.map((item, k) => ({ op: "insertItem", id, path: list.path, index: index + k, item: copyJson(item) }));
  const what = items.length === 1 ? (list.one === "image" ? "an image" : `a ${list.one}`) : `${items.length} ${list.many}`;
  return made("items", `Added ${what} to ${blockWithPlace(doc, id)}`, { id, item: index }, ops);
}

export function makeRemoveItem(doc: PageDocument, id: string, index: number): Made {
  const list = itemList(doc, id);
  if (!list) return unknown(id);
  const item = list.items[index];
  if (item === undefined) return refuse(refusal("unknown", `${blockWithPlace(doc, id)} has no ${list.one} ${index + 1}.`));
  return made("items", `Removed ${list.one} ${index + 1} from ${blockWithPlace(doc, id)}`, { id, item: index }, [
    { op: "removeItem", id, path: list.path, index, item: copyJson(item) },
  ]);
}

// `to` counts the items once the moved one has left its place.
export function makeMoveItem(doc: PageDocument, id: string, from: number, to: number): Made {
  const list = itemList(doc, id);
  if (!list) return unknown(id);
  if (list.items[from] === undefined) return refuse(refusal("unknown", `${blockWithPlace(doc, id)} has no ${list.one} ${from + 1}.`));
  if (!Number.isInteger(to) || to < 0 || to > list.items.length - 1) return refuse(refusal("noTarget", `There is no place ${to + 1} in ${blockWithPlace(doc, id)}.`));
  if (from === to) return refuse(refusal("nothing", `That ${list.one} is already there.`));
  return made("items", `Moved ${list.one} ${from + 1} in ${blockWithPlace(doc, id)}`, { id, item: to }, [
    { op: "moveItem", id, path: list.path, from, to },
  ]);
}

export function makeSetItem(doc: PageDocument, id: string, index: number, updates: Updates): Made {
  const list = itemList(doc, id);
  if (!list) return unknown(id);
  const item = list.items[index];
  if (!isObject(item)) return refuse(refusal("unknown", `${blockWithPlace(doc, id)} has no ${list.one} ${index + 1}.`));
  const { ops } = keySteps(id, [...list.path, index], item, updates, list.order);
  const keys = Object.keys(updates);
  const altOnly = list.one === "image" && keys.every((key) => key === "alt" || key === "decorative");
  return made("items", `Changed ${altOnly ? "the alt text of " : ""}${list.one} ${index + 1} in ${blockWithPlace(doc, id)}`, { id, item: index }, ops);
}
