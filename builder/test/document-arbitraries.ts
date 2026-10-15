// Random page documents and random editing sessions for the property tests
// of ../src/document (property.test.ts), and the properties themselves.
//
// The documents are valid by construction, from values the schema accepts
// for every widget, every style key with every token, and every
// column-width preset; each one is also validated before use, so a
// generator that drifts from the schema fails loudly instead of testing
// less. The sessions are lists of intents ("delete the 7th block", "move
// the 3rd block into the 5th container"), turned into commands against the
// page as it is at that step, through the same makers the editor uses.
// Some intents are refused on purpose (a widget dropped on the page, a
// fifth column, a section left without columns): the properties then check
// the refusal changed nothing.
//
// The properties take the implementation as a parameter, so mutants.test.ts
// can run them against a copy of ../src/document with a fault planted in it.
import fc from "fast-check";
import { isDeepStrictEqual } from "node:util";
import {
  COLUMN_WIDTHS_BY_COUNT, COLUMN_WIDTHS_TOKENS, DEVICES, FORM_FIELD_KINDS, FORM_TEXT_LIMITS, ICON_NAMES, ORDERED_LIST_STYLES, SCHEMA_VERSION, SPACE_TOKENS, STACK_TOKENS, STYLE_KEYS_BY_TYPE, STYLE_TOKENS,
  WIDGET_TYPES, type BlockType, type Device, type PageDocument, type StyleTokens, type WidgetType,
} from "../src/shared/document.ts";
import { validateDocument } from "../src/shared/validate.ts";
import { wholeNumberFromEnv } from "./env.ts";
import type * as Clipboard from "../src/document/clipboard.ts";
import type * as Commands from "../src/document/commands.ts";
import type { Json } from "../src/document/json.ts";
import type * as Reducer from "../src/document/reducer.ts";
import type * as RichText from "../src/document/rich-text.ts";
import type * as Tree from "../src/document/tree.ts";
import type * as Store from "../src/store/editor-store.ts";

// The modules under test: the real ones, or a mutated copy.
export interface Implementation {
  commands: typeof Commands;
  reducer: typeof Reducer;
  richText: typeof RichText;
  clipboard: typeof Clipboard;
  tree: typeof Tree;
  store: typeof Store;
}

type AnyObject = Record<string, unknown>;

// ------------------------------------------------------------ values

const LINES = ["Winter series", "Short, cold swims", "Café on the jetty", "Tide tables 2026", "日本語 🎉 swims", "Slack water"] as const;
const PARAGRAPHS = [...LINES, "Meet at the slipway.\nBring a cap."] as const;
const HREFS = ["https://swims.example.org/join", "/pricing", "#join", "mailto:club@example.org", "tel:+44-20-7946-0958", "?season=winter"] as const;
// A stats block's values: text written as it is shown.
const FIGURES = ["12", "300+", "98%", "-2 °C", "1/2", "日本 3"] as const;
const IMAGE_URLS = ["https://images.example.org/swim.jpg", "/media/pier.png"] as const;
const MEDIA_IDS = ["m1", "m2", "abc_DEF-9"] as const;

const line = fc.constantFrom(...LINES);
const paragraph = fc.constantFrom(...PARAGRAPHS);
const href = fc.constantFrom(...HREFS);

// An object without the keys whose value is undefined: an absent key is
// how the document says "not set".
function compact<T extends AnyObject>(object: T): T {
  return Object.fromEntries(Object.entries(object).filter(([, v]) => v !== undefined)) as T;
}

const imageRef = fc.record({
  source: fc.oneof(fc.constantFrom(...MEDIA_IDS).map((mediaId) => ({ mediaId })), fc.constantFrom(...IMAGE_URLS).map((url) => ({ url }))),
  text: fc.oneof({ weight: 4, arbitrary: line.map((alt) => ({ alt })) }, { weight: 1, arbitrary: fc.constant({ decorative: true as const }) }),
}).map(({ source, text }) => ({ ...source, ...text }));

// Rich text as a page may store it: every form the schema takes, not only
// the one the editor writes (marks in any order, a link with the nulls the
// schema allows, a numbered list starting at 1 or with no attributes, a
// line break with marks), so a text command's undo is held to the stored
// form, whatever it is.
const storedLink = fc.constantFrom(...HREFS).chain((href) => fc.constantFrom<AnyObject>(
  { type: "link", attrs: { href } },
  { type: "link", attrs: { href, target: null, rel: null, class: null } },
  { type: "link", attrs: { href, target: "_blank", rel: "noopener noreferrer nofollow" } },
));
const marks = storedLink.chain((link) => fc.shuffledSubarray([{ type: "bold" }, { type: "italic" }, link] as AnyObject[], { minLength: 0, maxLength: 3 }));
const inline = fc.oneof(
  { weight: 5, arbitrary: fc.record({ text: line, marks }).map(({ text, marks: m }) => compact({ type: "text", text, marks: m.length > 0 ? m : undefined })) },
  { weight: 1, arbitrary: fc.constantFrom<AnyObject>({ type: "hardBreak" }, { type: "hardBreak", marks: [{ type: "italic" }] }) },
);
const richParagraph = fc.array(inline, { maxLength: 3 }).map((content) => (content.length > 0 ? { type: "paragraph", content } : { type: "paragraph" }));
const orderedAttrs = fc.option(fc.record({ start: fc.integer({ min: 1, max: 9 }), type: fc.option(fc.constantFrom(...ORDERED_LIST_STYLES), { nil: undefined }) }).map(compact), { nil: undefined });
// A list two deep at most: an item's paragraph, then maybe a list of its own.
const flatList = (item: fc.Arbitrary<AnyObject>) => fc.oneof(
  fc.array(item, { minLength: 1, maxLength: 3 }).map((content) => ({ type: "bulletList", content })),
  fc.record({ attrs: orderedAttrs, content: fc.array(item, { minLength: 1, maxLength: 3 }) }).map(({ attrs, content }) => compact({ type: "orderedList", attrs, content })),
);
const leafItem = richParagraph.map((p) => ({ type: "listItem", content: [p] }));
const listItem = fc.record({ p: richParagraph, inner: fc.option(flatList(leafItem), { nil: undefined, freq: 3 }) })
  .map(({ p, inner }) => ({ type: "listItem", content: inner ? [p, inner] : [p] }));
const richBlock = fc.oneof({ weight: 4, arbitrary: richParagraph }, { weight: 2, arbitrary: flatList(listItem) });
const richDoc = fc.array(richBlock, { minLength: 1, maxLength: 3 }).map((content) => ({ type: "doc", content }));

// Rich text as the canvas's text editor hands it over (TipTap's getJSON()):
// a link with every attribute TipTap has, title included; a numbered list
// with start and type always written, and whatever a paste brought (start
// 0, a type of "disc"); marks in its ranking; tabs and control characters
// pasted as text; a run longer than the schema's longest; an empty doc.
// The text command must turn each into a text the schema takes.
const EDITOR_TEXTS = [...LINES, "Tab\tafter", "Bell\u0007and\u0085next", "w".repeat(10003)] as const;
const editorLink = fc.constantFrom(...HREFS).map((href) => ({ type: "link", attrs: { href, target: "_blank", rel: "noopener noreferrer nofollow", class: null, title: null } }));
const editorMarks = editorLink.chain((link) => fc.shuffledSubarray([link, { type: "bold" }, { type: "italic" }] as AnyObject[], { minLength: 0, maxLength: 3 }));
const editorInline = fc.oneof(
  { weight: 6, arbitrary: fc.record({ text: fc.constantFrom(...EDITOR_TEXTS), marks: editorMarks }).map(({ text, marks: m }) => compact({ type: "text", text, marks: m.length > 0 ? m : undefined })) },
  { weight: 1, arbitrary: editorMarks.map((m) => compact({ type: "hardBreak", marks: m.length > 0 ? m : undefined })) },
);
const editorParagraph = fc.array(editorInline, { maxLength: 4 }).map((content) => (content.length > 0 ? { type: "paragraph", content } : { type: "paragraph" }));
const editorList = (item: fc.Arbitrary<AnyObject>) => fc.oneof(
  fc.array(item, { minLength: 1, maxLength: 3 }).map((content) => ({ type: "bulletList", content })),
  fc.record({
    start: fc.oneof(fc.constant(1), fc.integer({ min: -2, max: 12 }), fc.constant(250000)),
    type: fc.constantFrom(null, "1", "a", "A", "i", "I", "disc"),
    content: fc.array(item, { minLength: 1, maxLength: 3 }),
  }).map(({ start, type, content }) => ({ type: "orderedList", attrs: { start, type }, content })),
);
const editorLeafItem = editorParagraph.map((p) => ({ type: "listItem", content: [p] }));
const editorItem = fc.record({ p: editorParagraph, inner: fc.option(editorList(editorLeafItem), { nil: undefined, freq: 3 }) })
  .map(({ p, inner }) => ({ type: "listItem", content: inner ? [p, inner] : [p] }));
export const editorText: fc.Arbitrary<AnyObject> = fc.oneof(
  { weight: 12, arbitrary: fc.array(fc.oneof({ weight: 3, arbitrary: editorParagraph }, { weight: 1, arbitrary: editorList(editorItem) }), { minLength: 1, maxLength: 4 }).map((content) => ({ type: "doc", content })) },
  { weight: 1, arbitrary: fc.constant({ type: "doc", content: [] }) },
);

// A form's field: a limit only on the two kinds of text, within the
// line's; names unique in their form (fc.uniqueArray, below).
const formField = fc.record({
  name: fc.constantFrom("name", "email", "notes", "field-4", "a"),
  kind: fc.constantFrom(...FORM_FIELD_KINDS),
  label: line,
  required: fc.boolean(),
  maxLength: fc.integer({ min: 1, max: 300 }),
}).map(({ maxLength, ...field }): AnyObject => (field.kind === "email" || field.kind === "checkbox" ? field : { ...field, maxLength }));

// Valid props for each widget type.
export const PROPS: Readonly<Record<WidgetType, fc.Arbitrary<AnyObject>>> = {
  heading: fc.record({ level: fc.integer({ min: 1, max: 4 }), text: line, href: fc.option(href, { nil: undefined }) }).map(compact),
  text: richDoc.map((doc) => ({ doc })),
  image: imageRef,
  button: fc.record({ label: line, href }),
  divider: fc.constant({}),
  spacer: fc.constantFrom(...SPACE_TOKENS).map((size) => ({ size })),
  gallery: fc.array(imageRef, { minLength: 1, maxLength: 4 }).map((items) => ({ items })),
  video: fc.oneof(
    fc.record({ provider: fc.constant("youtube"), videoId: fc.constantFrom("AbCdEfGhIj0", "zz_-0123456"), title: line }),
    fc.record({ provider: fc.constant("vimeo"), videoId: fc.constantFrom("76979871", "1"), title: line }),
  ),
  map: fc.record({
    latitude: fc.integer({ min: -90000, max: 90000 }).map((n) => n / 1000),
    longitude: fc.integer({ min: -180000, max: 180000 }).map((n) => n / 1000),
    zoom: fc.integer({ min: 1, max: 19 }),
    label: line,
  }),
  iconbox: fc.record({ icon: fc.constantFrom(...ICON_NAMES), title: line, text: paragraph }),
  quote: fc.record({ text: paragraph, attribution: fc.option(line, { nil: undefined }) }).map(compact),
  accordion: fc.array(fc.record({ question: line, answer: paragraph }), { minLength: 1, maxLength: 3 }).map((items) => ({ items })),
  stats: fc.array(fc.record({ value: fc.constantFrom(...FIGURES), label: line }), { minLength: 1, maxLength: 3 }).map((items) => ({ items })),
  steps: fc.array(fc.record({ title: line, text: paragraph }), { minLength: 2, maxLength: 4 }).map((items) => ({ items })),
  form: fc.record({
    items: fc.uniqueArray(formField, { minLength: 1, maxLength: 4, selector: (field) => field.name }),
    submitLabel: line,
    confirmation: paragraph,
  }),
  logo: fc.option(line, { nil: undefined }).map((name) => compact({ name })),
  menu: fc.record({ label: line, items: fc.array(fc.record({ label: line, href }), { minLength: 1, maxLength: 4 }) }),
};

// The tokens each style key takes.
const TOKENS: Readonly<Record<keyof StyleTokens, readonly string[]>> = STYLE_TOKENS;

function stylePart(type: BlockType, minKeys: number): fc.Arbitrary<AnyObject> {
  const keys = STYLE_KEYS_BY_TYPE[type] as readonly (keyof StyleTokens)[];
  return fc.subarray([...keys], { minLength: Math.min(minKeys, keys.length), maxLength: Math.min(3, keys.length) })
    .chain((chosen) => fc.tuple(...chosen.map((key) => fc.constantFrom(...TOKENS[key]).map((token) => [key, token] as const))))
    .map((pairs) => Object.fromEntries(pairs));
}

function style(type: BlockType): fc.Arbitrary<AnyObject> {
  return fc.record({
    base: stylePart(type, 0),
    tablet: fc.option(stylePart(type, 1), { nil: undefined }),
    phone: fc.option(stylePart(type, 1), { nil: undefined }),
  }).map(compact);
}

// Blocks with the id left empty: document() gives every block an id once
// the tree is built, so ids are unique by construction.
export const widget: fc.Arbitrary<AnyObject> = fc.constantFrom(...WIDGET_TYPES).chain((type) =>
  fc.record({ props: PROPS[type], style: style(type) }).map(({ props, style: s }) => ({ id: "", type, props, children: [], style: s })));

const column = fc.record({ widgets: fc.array(widget, { maxLength: 4 }), style: style("column") })
  .map(({ widgets, style: s }) => ({ id: "", type: "column", props: {}, children: widgets, style: s }));

const section = fc.integer({ min: 1, max: 4 }).chain((count) => fc.record({
  columns: fc.array(column, { minLength: count, maxLength: count }),
  label: fc.option(fc.constantFrom("Hero", "Join", "Members’ words"), { nil: undefined }),
  anchor: fc.option(fc.constantFrom("join", "faq", "winter-2026"), { nil: undefined }),
  widths: fc.option(fc.constantFrom(...(COLUMN_WIDTHS_BY_COUNT[count as 1 | 2 | 3 | 4] as readonly string[]), "equal"), { nil: undefined }),
  // A section of one column has nothing to stack, and names no stacking.
  stack: fc.option(fc.constantFrom(...STACK_TOKENS), { nil: undefined }).map((stack) => (count > 1 ? stack : undefined)),
  style: style("section"),
}).map(({ columns, label, anchor, widths, stack, style: s }) => ({
  id: "",
  type: "section",
  props: compact({ label, anchor, columnWidths: widths === "equal" ? undefined : widths, stack }),
  children: columns,
  style: s,
})));

function numberIds(sections: AnyObject[]): void {
  let n = 0;
  const visit = (block: AnyObject): void => {
    n += 1;
    block.id = `b${n}`;
    (block.children as AnyObject[]).forEach(visit);
  };
  sections.forEach(visit);
}

export const pageDocument: fc.Arbitrary<PageDocument> = fc.record({
  title: line,
  description: fc.option(line, { nil: undefined }),
  sections: fc.array(section, { maxLength: 4 }),
}).map(({ title, description, sections }) => {
  const copy = structuredClone(sections);
  numberIds(copy);
  // Anchors are unique on a page (the application rules): a repeat drawn
  // here is dropped, so the pages hold anchors, and sections without one.
  const anchors = new Set<unknown>();
  for (const s of copy) {
    if (s.props.anchor === undefined) continue;
    if (anchors.has(s.props.anchor)) delete (s.props as AnyObject).anchor;
    else anchors.add(s.props.anchor);
  }
  const doc = compact({ schemaVersion: SCHEMA_VERSION, title, description, sections: copy });
  const checked = validateDocument(doc);
  if (!checked.valid) throw new Error(`the generator made an invalid page: ${JSON.stringify(checked.errors.slice(0, 3))}`);
  return checked.document;
});

// ------------------------------------------------------------ intents

export type Intent =
  | { kind: "insertWidget"; container: number; index: number; widget: AnyObject }
  | { kind: "insertSection"; columns: number; index: number }
  | { kind: "upload"; container: number; index: number; mediaId: string; decorative: boolean }
  | { kind: "delete"; pick: number }
  | { kind: "move"; pick: number; container: number; index: number }
  | { kind: "duplicate"; pick: number }
  | { kind: "paste"; pick: number; selection: number }
  | { kind: "props"; pick: number; variant: number; value: number }
  | { kind: "style"; pick: number; device: Device; key: number; token: number; remove: boolean }
  | { kind: "widths"; pick: number; preset: number }
  | { kind: "stack"; pick: number; stack: number }
  | { kind: "count"; pick: number; count: number }
  | { kind: "page"; variant: number; value: number }
  | { kind: "items"; pick: number; action: "insert" | "remove" | "move" | "set"; index: number; other: number; item: number }
  // One edit of a form: one of its fields (its label, whether it must be
  // filled in, its type, its longest answer), or its button text, or its
  // message.
  | { kind: "form"; pick: number; index: number; variant: number; value: number }
  // The canvas's text editor handing a text over, as TipTap writes it.
  | { kind: "text"; pick: number; doc: AnyObject };

const n = fc.nat({ max: 1000 });

export const intent: fc.Arbitrary<Intent> = fc.oneof(
  { weight: 3, arbitrary: fc.record({ kind: fc.constant("insertWidget" as const), container: n, index: n, widget }) },
  { weight: 1, arbitrary: fc.record({ kind: fc.constant("insertSection" as const), columns: fc.integer({ min: 1, max: 5 }), index: n }) },
  { weight: 1, arbitrary: fc.record({ kind: fc.constant("upload" as const), container: n, index: n, mediaId: fc.constantFrom(...MEDIA_IDS), decorative: fc.boolean() }) },
  { weight: 3, arbitrary: fc.record({ kind: fc.constant("delete" as const), pick: n }) },
  { weight: 3, arbitrary: fc.record({ kind: fc.constant("move" as const), pick: n, container: n, index: n }) },
  { weight: 2, arbitrary: fc.record({ kind: fc.constant("duplicate" as const), pick: n }) },
  { weight: 2, arbitrary: fc.record({ kind: fc.constant("paste" as const), pick: n, selection: n }) },
  { weight: 4, arbitrary: fc.record({ kind: fc.constant("props" as const), pick: n, variant: n, value: n }) },
  { weight: 4, arbitrary: fc.record({ kind: fc.constant("style" as const), pick: n, device: fc.constantFrom(...DEVICES), key: n, token: n, remove: fc.boolean() }) },
  { weight: 1, arbitrary: fc.record({ kind: fc.constant("widths" as const), pick: n, preset: n }) },
  { weight: 1, arbitrary: fc.record({ kind: fc.constant("stack" as const), pick: n, stack: n }) },
  { weight: 1, arbitrary: fc.record({ kind: fc.constant("count" as const), pick: n, count: fc.integer({ min: 1, max: 5 }) }) },
  { weight: 1, arbitrary: fc.record({ kind: fc.constant("page" as const), variant: n, value: n }) },
  { weight: 3, arbitrary: fc.record({ kind: fc.constant("items" as const), pick: n, action: fc.constantFrom("insert" as const, "remove" as const, "move" as const, "set" as const), index: n, other: n, item: n }) },
  // Weighted so that a run meets each edit of a form often, though a page
  // has a form in one widget of twelve: each of its six edits is a sixth of
  // these.
  { weight: 6, arbitrary: fc.record({ kind: fc.constant("form" as const), pick: n, index: n, variant: n, value: n }) },
  { weight: 3, arbitrary: fc.record({ kind: fc.constant("text" as const), pick: n, doc: editorText }) },
);

const at = <T>(list: readonly T[], k: number): T | undefined => (list.length === 0 ? undefined : list[k % list.length]);

// A command for the intent on this page, and whether the page must take it:
// an intent that is valid whatever the page holds (a style token on a key
// its block has, a widget into a column with room) must be accepted.
export function commandFor(impl: Implementation, doc: PageDocument, wish: Intent, newId: () => string): { made: Commands.Made; mustAccept: boolean } | null {
  const { commands: c, tree, clipboard } = impl;
  const blocks = [...tree.allBlocks(doc)];
  const containers: Array<string | null> = [null, ...blocks.map((b) => b.block.id)];
  const columnHasRoom = (parentId: string | null): boolean => {
    const found = parentId === null ? undefined : tree.locate(doc, parentId);
    return found?.block.type === "column" && found.block.children.length < 50;
  };
  const sectionHasRoom = (parentId: string | null): boolean => {
    const found = parentId === null ? undefined : tree.locate(doc, parentId);
    return found?.block.type === "section" && found.block.children.length < 4;
  };
  const indexIn = (parentId: string | null, k: number, leaving = 0): number => k % ((tree.childrenOf(doc, parentId)?.length ?? 0) + 1 - leaving);

  switch (wish.kind) {
    case "insertWidget": {
      const parentId = at(containers, wish.container) ?? null;
      const block = { ...wish.widget, id: newId() } as unknown as Parameters<typeof c.makeInsert>[1];
      return { made: c.makeInsert(doc, block, { parentId, index: indexIn(parentId, wish.index) }), mustAccept: columnHasRoom(parentId) };
    }
    case "insertSection":
      return { made: c.makeInsertSection(doc, wish.columns, wish.index % (doc.sections.length + 1), newId), mustAccept: wish.columns <= 4 && doc.sections.length < 100 };
    case "upload": {
      const parentId = at(containers, wish.container) ?? null;
      const upload = wish.decorative ? { mediaId: wish.mediaId, decorative: true as const } : { mediaId: wish.mediaId, alt: "Uploaded picture" };
      return { made: c.makeInsertUploadedImage(doc, upload, { parentId, index: indexIn(parentId, wish.index) }, newId), mustAccept: columnHasRoom(parentId) };
    }
    case "delete": {
      const picked = at(blocks, wish.pick);
      if (!picked) return null;
      const lastColumn = picked.block.type === "column" && (tree.childrenOf(doc, picked.parentId)?.length ?? 0) === 1;
      return { made: c.makeDelete(doc, picked.block.id), mustAccept: !lastColumn };
    }
    case "move": {
      const picked = at(blocks, wish.pick);
      if (!picked) return null;
      const parentId = at(containers, wish.container) ?? null;
      const same = parentId === picked.parentId;
      const index = indexIn(parentId, wish.index, same ? 1 : 0);
      const mustAccept = picked.block.type !== "section" && picked.block.type !== "column" && columnHasRoom(parentId) && !(same && index === picked.index);
      return { made: c.makeMove(doc, picked.block.id, { parentId, index }), mustAccept };
    }
    case "duplicate": {
      const picked = at(blocks, wish.pick);
      if (!picked) return null;
      const room = picked.block.type === "section" ? doc.sections.length < 100
        : picked.block.type === "column" ? sectionHasRoom(picked.parentId) : columnHasRoom(picked.parentId);
      return { made: c.makeDuplicate(doc, picked.block.id, newId), mustAccept: room };
    }
    case "paste": {
      const picked = at(blocks, wish.pick);
      if (!picked) return null;
      const copied = clipboard.copyBlock(doc, picked.block.id);
      if (!copied) return null;
      const read = clipboard.readClipboard(clipboard.clipboardText(copied));
      if (!read.ok) throw new Error(`a block copied from a valid page did not read back: ${read.error.message}`);
      const selection = at(containers, wish.selection) ?? null;
      return { made: c.makePaste(doc, read.block, selection, newId), mustAccept: false };
    }
    case "props": {
      const picked = at(blocks, wish.pick);
      if (!picked) return null;
      const updates = propUpdates(c.REMOVE, picked.block.type, picked.block.props as AnyObject, wish.variant, wish.value);
      if (!updates) return null;
      // An anchor another section has is refused (the application rules),
      // so that change is tried without being required.
      const anchor = updates.anchor;
      const taken = typeof anchor === "string" && doc.sections.some((s) => s.id !== picked.block.id && s.props.anchor === anchor);
      return { made: c.makeSetProps(doc, picked.block.id, updates), mustAccept: !taken };
    }
    case "style": {
      const picked = at(blocks, wish.pick);
      if (!picked) return null;
      const keys = STYLE_KEYS_BY_TYPE[picked.block.type] as readonly (keyof StyleTokens)[];
      const key = at(keys, wish.key);
      if (!key) return null;
      const value = wish.remove ? c.REMOVE : (at(TOKENS[key], wish.token) as string);
      return { made: c.makeSetStyle(doc, picked.block.id, wish.device, { [key]: value } as Commands.StyleUpdates), mustAccept: true };
    }
    case "widths": {
      const sections = blocks.filter((b) => b.block.type === "section");
      const picked = at(sections, wish.pick);
      if (!picked) return null;
      const preset = at([...COLUMN_WIDTHS_TOKENS, "equal" as const], wish.preset) ?? "equal";
      const fits = preset === "equal" || (COLUMN_WIDTHS_BY_COUNT[picked.block.children.length as 1 | 2 | 3 | 4] as readonly string[]).includes(preset);
      return { made: c.makeSetColumnWidths(doc, picked.block.id, preset), mustAccept: fits };
    }
    case "stack": {
      // On tablets and phones, the setting's absence, fits any section; the
      // others, a section of two columns or more.
      const sections = blocks.filter((b) => b.block.type === "section");
      const picked = at(sections, wish.pick);
      if (!picked) return null;
      const stack = at([...STACK_TOKENS, "tablet" as const], wish.stack) ?? "tablet";
      return { made: c.makeSetStack(doc, picked.block.id, stack), mustAccept: stack === "tablet" || picked.block.children.length > 1 };
    }
    case "count": {
      const sections = blocks.filter((b) => b.block.type === "section");
      const picked = at(sections, wish.pick);
      if (!picked) return null;
      const kept = picked.block.children.slice(0, wish.count);
      const widgets = picked.block.children.slice(wish.count - 1).reduce((sum, col) => sum + col.children.length, 0);
      return { made: c.makeSetColumnCount(doc, picked.block.id, wish.count, newId), mustAccept: wish.count <= 4 && (kept.length < wish.count || widgets <= 50) };
    }
    case "page": {
      const variant = wish.variant % 3;
      const updates: Parameters<typeof c.makeSetPage>[1] = variant === 0 ? { title: at(LINES, wish.value) as string }
        : variant === 1 ? { description: at(LINES, wish.value) as string } : { description: c.REMOVE };
      return { made: c.makeSetPage(doc, updates), mustAccept: true };
    }
    case "form": {
      const forms = blocks.filter((b) => b.block.type === "form");
      const picked = at(forms, wish.pick);
      if (!picked) return null;
      const edit = wish.variant % 6;
      if (edit >= 4) {
        const updates = edit === 4 ? { submitLabel: at(LINES, wish.value) as string } : { confirmation: at(PARAGRAPHS, wish.value) as string };
        return { made: c.makeSetProps(doc, picked.block.id, updates), mustAccept: true };
      }
      const items = (picked.block.props as { items: AnyObject[] }).items;
      const index = wish.index % items.length;
      return { made: c.makeSetItem(doc, picked.block.id, index, formFieldUpdates(c.REMOVE, items[index] as AnyObject, edit, wish.value)), mustAccept: true };
    }
    case "items": {
      const lists = blocks.filter((b) => b.block.type === "gallery" || b.block.type === "accordion" || b.block.type === "stats" || b.block.type === "steps" || b.block.type === "form" || b.block.type === "menu");
      const picked = at(lists, wish.pick);
      if (!picked) return null;
      const items = (picked.block.props as { items: AnyObject[] }).items;
      const gallery = picked.block.type === "gallery";
      const form = picked.block.type === "form";
      const menu = picked.block.type === "menu";
      const stats = picked.block.type === "stats";
      const steps = picked.block.type === "steps";
      // A form's new field may take a name the form has: the page must
      // refuse it then, by the rule on a form's field names.
      const fieldName = at(["name", "email", "notes", "field-4", "a", "added"], wish.item) as string;
      const newItem = gallery ? { mediaId: at(MEDIA_IDS, wish.item) as string, alt: "Added picture" }
        : form ? { name: fieldName, kind: "checkbox", label: "Added box", required: false }
          : menu ? { label: at(LINES, wish.item) as string, href: at(HREFS, wish.item) as string }
            : stats ? { value: at(FIGURES, wish.item) as string, label: "Added figure" }
              : steps ? { title: at(LINES, wish.item) as string, text: at(PARAGRAPHS, wish.item) as string }
                : { question: "Cold?", answer: at(PARAGRAPHS, wish.item) as string };
      const max = gallery ? 24 : form ? 20 : menu ? 12 : stats ? 8 : steps ? 10 : 30;
      // A steps block keeps two steps at least; every other list, one.
      const min = steps ? 2 : 1;
      const free = !form || !items.some((item) => item.name === fieldName);
      switch (wish.action) {
        case "insert":
          return { made: c.makeInsertItems(doc, picked.block.id, wish.index % (items.length + 1), [newItem as unknown as Json]), mustAccept: items.length < max && free };
        case "remove":
          return { made: c.makeRemoveItem(doc, picked.block.id, wish.index % items.length), mustAccept: items.length > min };
        case "move":
          return { made: c.makeMoveItem(doc, picked.block.id, wish.index % items.length, wish.other % items.length), mustAccept: true };
        case "set": {
          const updates: Commands.Updates = gallery
            ? (wish.other % 2 === 0 ? { alt: at(LINES, wish.item) as string, decorative: c.REMOVE } : { decorative: true, alt: c.REMOVE })
            : form ? formFieldUpdates(c.REMOVE, items[wish.index % items.length] as AnyObject, wish.other, wish.item)
              : menu ? (wish.other % 2 === 0 ? { label: at(LINES, wish.item) as string } : { href: at(HREFS, wish.item) as string })
                : stats ? (wish.other % 2 === 0 ? { value: at(FIGURES, wish.item) as string } : { label: at(LINES, wish.item) as string })
                  : steps ? (wish.other % 2 === 0 ? { title: at(LINES, wish.item) as string } : { text: at(PARAGRAPHS, wish.item) as string })
                    : { question: at(LINES, wish.item) as string };
          return { made: c.makeSetItem(doc, picked.block.id, wish.index % items.length, updates), mustAccept: true };
        }
      }
    }
    case "text": {
      // Whatever the editor writes, the text command makes a text the
      // schema takes: the page must take it.
      const texts = blocks.filter((b) => b.block.type === "text");
      const picked = at(texts, wish.pick);
      if (!picked) return null;
      return { made: impl.richText.makeTextEdit(doc, picked.block.id, wish.doc), mustAccept: true };
    }
  }
}

// Valid changes of one field of a form, picked by `variant`: its label,
// whether it must be filled in, its type, and its longest answer. A change
// of type is built as the form's panel builds it (kindUpdates in
// ../src/widgets/form/panel.tsx): the limit kept where the new type takes
// it, the new type's own where it does not, and taken out (REMOVE) for an
// email address or a checkbox, which have none. A change of the longest
// answer is only for the two types of text; another gets the change of
// type in its place, so that no turn of the wheel is wasted.
function formFieldUpdates(REMOVE: typeof Commands.REMOVE, field: AnyObject, variant: number, value: number): Commands.Updates {
  const kind = field.kind as (typeof FORM_FIELD_KINDS)[number];
  const holdsText = kind === "text" || kind === "textarea";
  const change = variant % 4 === 3 && !holdsText ? 2 : variant % 4;
  if (change === 0) return { label: at(LINES, value) as string };
  if (change === 1) return { required: value % 2 === 0 };
  if (change === 3) {
    const most = FORM_TEXT_LIMITS[kind as "text" | "textarea"];
    return { maxLength: Math.min(at([1, 40, 100, 300, 1000, most], value) as number, most) };
  }
  const next = at(FORM_FIELD_KINDS, value) as (typeof FORM_FIELD_KINDS)[number];
  if (next === "email" || next === "checkbox") return { kind: next, maxLength: REMOVE };
  const own = field.maxLength;
  const fitting = typeof own === "number" && own <= FORM_TEXT_LIMITS[next];
  return { kind: next, maxLength: fitting ? own : next === "text" ? 100 : 1000 };
}

// Valid changes of props for each type, picked by `variant`.
function propUpdates(REMOVE: typeof Commands.REMOVE, type: BlockType, props: AnyObject, variant: number, value: number): Commands.Updates | null {
  const pick = <T>(list: readonly T[]): T => list[value % list.length] as T;
  const choices: Commands.Updates[] = (() => {
    switch (type) {
      case "section":
        return [{ label: pick(["Hero", "Questions", "Join"]) }, { label: REMOVE }, { anchor: pick(["join", "faq"]) }, { anchor: REMOVE }];
      case "heading":
        return [{ text: pick(LINES) }, { href: pick(HREFS) }, { href: REMOVE }, { level: 1 + (value % 4) }];
      case "text":
        return [{ doc: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: pick(LINES) }] }] } }];
      case "image":
        return [
          "alt" in props ? { alt: pick(LINES) } : { decorative: REMOVE, alt: pick(LINES) },
          { alt: REMOVE, decorative: true },
          "url" in props ? { url: REMOVE, mediaId: pick(MEDIA_IDS) } : { mediaId: REMOVE, url: pick(IMAGE_URLS) },
        ];
      case "button":
        return [{ label: pick(LINES) }, { href: pick(HREFS) }];
      case "spacer":
        return [{ size: pick(SPACE_TOKENS) }];
      case "video":
        return [{ provider: "vimeo", videoId: "123456" }, { provider: "youtube", videoId: "AbCdEfGhIj0" }, { title: pick(LINES) }];
      case "map":
        return [{ zoom: 1 + (value % 19) }, { latitude: (value % 180) - 90, longitude: (value % 360) - 180 }, { label: pick(LINES) }];
      case "iconbox":
        return [{ icon: pick(ICON_NAMES) }, { title: pick(LINES) }, { text: pick(PARAGRAPHS) }];
      case "quote":
        return [{ text: pick(PARAGRAPHS) }, { attribution: pick(LINES) }, { attribution: REMOVE }];
      case "form":
        return [{ submitLabel: pick(LINES) }, { confirmation: pick(PARAGRAPHS) }];
      case "logo":
        return [{ name: pick(LINES) }, { name: REMOVE }];
      case "menu":
        return [{ label: pick(LINES) }];
      default:
        return [];
    }
  })();
  return choices.length === 0 ? null : (choices[variant % choices.length] ?? null);
}

// ------------------------------------------------------------ properties

export interface Tally {
  applied: Record<string, number>;
  refused: Record<string, number>;
  commands: number;
  // Texts the editor handed over that the page took.
  texts: number;
  // What the commands the page took did to a form, by what they changed:
  // its items (fields inserted, removed, moved or changed), its props,
  // and a field's type, a field's longest answer, the button's text, the
  // message. A fault only a form's own edit meets passes a run that made
  // none of them.
  forms: Record<string, number>;
}

export const newTally = (): Tally => ({ applied: {}, refused: {}, commands: 0, texts: 0, forms: {} });

// A command the page took, counted by what it changed in a form (none: it
// was not about a form). `before` is the page it was applied to.
function tallyForm(impl: Implementation, before: PageDocument, command: Commands.Command, tally: Tally): void {
  if (!command.subject || impl.tree.locate(before, command.subject.id)?.block.type !== "form") return;
  const keys = command.ops.flatMap((op) => (op.op === "set" ? [op.key] : []));
  const count = (what: string): void => {
    tally.forms[what] = (tally.forms[what] ?? 0) + 1;
  };
  if (command.kind === "items") count("items");
  if (command.kind === "props") count("props");
  if (keys.includes("kind")) count("field type");
  else if (keys.includes("maxLength")) count("longest answer");
  if (keys.includes("submitLabel")) count("button text");
  if (keys.includes("confirmation")) count("message");
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const inner of Object.values(value)) deepFreeze(inner);
  }
  return value;
}

const fail = (message: string): never => {
  throw new Error(message);
};

// One editing session: every command checked on its own, then the whole
// session undone and redone through the store.
export function session(impl: Implementation, start: PageDocument, wishes: readonly Intent[], tally: Tally): void {
  const { reducer, commands: c } = impl;
  let k = 0;
  const newId = (): string => `n${++k}`;
  let doc = deepFreeze(structuredClone(start));
  const first = doc;
  const accepted: Commands.Command[] = [];

  for (const wish of wishes) {
    const planned = commandFor(impl, doc, wish, newId);
    if (!planned) continue;
    const { made, mustAccept } = planned;
    tally.commands += 1;
    if (!made.ok) {
      tally.refused[made.error.reason] = (tally.refused[made.error.reason] ?? 0) + 1;
      if (mustAccept && made.error.reason !== "nothing") fail(`${wish.kind} must be possible here, and was refused: ${made.error.message}`);
      continue;
    }
    const command = deepFreeze(made.command);
    const before = JSON.stringify(doc);
    const applied = reducer.applyCommand(doc, command);
    if (!applied.ok) {
      tally.refused[applied.error.reason] = (tally.refused[applied.error.reason] ?? 0) + 1;
      if (mustAccept) fail(`${command.label} must be possible here, and was refused: ${applied.error.message}`);
      if (JSON.stringify(doc) !== before) fail(`refusing ${command.label} changed the page`);
      continue;
    }
    tally.applied[command.kind] = (tally.applied[command.kind] ?? 0) + 1;
    tallyForm(impl, doc, command, tally);
    if (wish.kind === "text") tally.texts += 1;
    const after = deepFreeze(applied.document);

    // Every result is a valid page, by the application rules and the schema.
    const valid = validateDocument(after);
    if (!valid.valid) fail(`${command.label} gave an invalid page: ${JSON.stringify(valid.errors.slice(0, 3))}`);
    // The command is data: JSON carries it whole, with no undefined and no
    // symbol in it.
    if (!isDeepStrictEqual(JSON.parse(JSON.stringify(command)), command)) fail(`${command.label} does not survive JSON`);
    // Its inverse gives back the same page: equal, with the same keys
    // absent, and the same bytes.
    const inverse = c.invertCommand(command);
    const undone = reducer.applyCommand(after, inverse);
    if (!undone.ok) fail(`undoing ${command.label} was refused: ${undone.error.message}`);
    else {
      if (!isDeepStrictEqual(undone.document, doc)) fail(`undoing ${command.label} did not give back the same page`);
      if (JSON.stringify(undone.document) !== before) fail(`undoing ${command.label} gave back the page with its keys in another order`);
      // Redoing repeats it exactly: the same ids, the same page.
      const redone = reducer.applyCommand(undone.document, command);
      if (!redone.ok) fail(`redoing ${command.label} was refused: ${redone.error.message}`);
      else if (!isDeepStrictEqual(redone.document, after)) fail(`redoing ${command.label} did not give the same page`);
    }
    if (!isDeepStrictEqual(c.invertCommand(inverse), command)) fail(`the inverse of the inverse of ${command.label} is not the command`);
    // A text the editor handed over is kept in the one form the text
    // command makes: made again from what was kept, it is the same.
    if (wish.kind === "text" && command.subject) {
      const kept = (impl.tree.locate(after, command.subject.id)?.block.props as { doc?: unknown } | undefined)?.doc;
      if (!isDeepStrictEqual(impl.richText.richTextFromEditor(kept), kept)) fail(`${command.label} kept a text in another form than the canonical one`);
    }
    // The focus is a block of the page.
    if (applied.focus && !impl.tree.hasBlock(after, applied.focus.id)) fail(`${command.label} focused ${applied.focus.id}, which is not on the page`);
    accepted.push(command);
    doc = after;
  }

  // The same session through the store: undo all, then redo all.
  const store = impl.store.createEditorStore({ document: first, now: () => 0 });
  for (const command of accepted) if (!store.getState().dispatch(command).ok) fail(`the store refused ${command.label}`);
  if (!isDeepStrictEqual(store.getState().document, doc)) fail("the store's page is not the reducer's");
  for (let i = 0; i < accepted.length; i++) if (!store.getState().undo().ok) fail(`the store could not undo step ${accepted.length - i}`);
  if (!isDeepStrictEqual(store.getState().document, first) || JSON.stringify(store.getState().document) !== JSON.stringify(first)) {
    fail("undoing the whole session did not give back the first page");
  }
  for (let i = 0; i < accepted.length; i++) if (!store.getState().redo().ok) fail(`the store could not redo step ${i + 1}`);
  if (!isDeepStrictEqual(store.getState().document, doc)) fail("redoing the whole session did not give the same page");
}

// The run's settings: a fixed seed by default, so a run can be repeated;
// DOC_PROPERTY_SEED, DOC_PROPERTY_RUNS and DOC_PROPERTY_PATH replay the
// failure fast-check reports.
export function runSettings(defaultRuns: number): { seed: number; numRuns: number; path?: string } {
  const seed = wholeNumberFromEnv("DOC_PROPERTY_SEED", 20261002);
  const numRuns = wholeNumberFromEnv("DOC_PROPERTY_RUNS", defaultRuns, 1);
  const path = process.env.DOC_PROPERTY_PATH;
  return path ? { seed, numRuns, path } : { seed, numRuns };
}

export function sessionProperty(impl: Implementation, tally: Tally): fc.IProperty<[PageDocument, Intent[]]> {
  return fc.property(pageDocument, fc.array(intent, { minLength: 1, maxLength: 25 }), (doc, wishes) => {
    session(impl, doc, wishes, tally);
  });
}
