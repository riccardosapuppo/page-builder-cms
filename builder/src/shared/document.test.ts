// The types of document.ts against schema/block-document.schema.json: the
// compiler holds the tables in document.ts to the interfaces, and this test
// holds the same tables to the schema. A token, a key or a required key
// added to, removed from or renamed in the schema fails here until the
// types follow.
import { describe, expect, test } from "vitest";
import schemaJson from "../../../schema/block-document.schema.json";
import {
  ACCORDION_ITEM_KEYS, ALIGN_TOKENS, ASPECT_TOKENS, BACKGROUND_TOKENS, BLOCK_TYPES, COLUMN_WIDTHS_BY_COUNT,
  COLUMN_WIDTHS_TOKENS, DOCUMENT_KEYS, HEADING_LEVELS, ICON_NAMES, IMAGE_REF_KEYS, INLINE_NODE_TYPES, MARK_TYPES,
  ORDERED_LIST_STYLES, PALETTE_SLOTS, PROP_KEYS, RICH_TEXT_BLOCK_TYPES, SCHEMA_VERSION, SECTION_SPACE_TOKENS,
  SPACE_TOKENS, STYLE_KEYS_BY_TYPE, STYLE_TOKEN_KEYS, TYPE_STEPS, VERTICAL_ALIGN_TOKENS, VIDEO_PROVIDERS,
  VISIBILITY_TOKENS, WIDGET_TYPES, type BlockType,
} from "./document.ts";

// The schema is read as plain JSON; these helpers walk it.
type Node = Record<string, unknown>;
const schema = schemaJson as unknown as Node;
const defs = schema.$defs as Record<string, Node>;

function def(name: string): Node {
  const found = defs[name];
  if (!found) throw new Error(`the schema has no $defs/${name}`);
  return found;
}
function deref(node: Node): Node {
  const ref = node.$ref;
  return typeof ref === "string" ? def(ref.replace("#/$defs/", "")) : node;
}
function enumOf(node: Node): unknown[] {
  const values = deref(node).enum;
  if (!Array.isArray(values)) throw new Error(`no enum in ${JSON.stringify(node).slice(0, 80)}`);
  return values;
}
function properties(node: Node): Record<string, Node> {
  return (node.properties ?? {}) as Record<string, Node>;
}
// { key: "required" | "optional" } for an object schema.
function keyTable(node: Node): Record<string, string> {
  const required = new Set((node.required ?? []) as string[]);
  return Object.fromEntries(Object.keys(properties(node)).map((key) => [key, required.has(key) ? "required" : "optional"]));
}
const sorted = (o: Record<string, string>) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));
// The props, children and style schemas of one block type's branch.
function branch(type: BlockType): { props: Node; style: Node } {
  const parts = properties(def(`${type}Block`));
  return { props: deref(parts.props as Node), style: deref(parts.style as Node) };
}

describe("the document's types match the schema", () => {
  test("the block and widget types", () => {
    expect([...BLOCK_TYPES]).toEqual(enumOf(def("blockType")));
    expect([...WIDGET_TYPES]).toEqual(enumOf(def("widgetType")));
    // The dispatcher has one branch per type, so every type has a block definition.
    for (const type of BLOCK_TYPES) expect(defs[`${type}Block`], type).toBeDefined();
  });

  test("every token list", () => {
    const pairs: Array<[readonly unknown[], string]> = [
      [SPACE_TOKENS, "spaceToken"], [SECTION_SPACE_TOKENS, "sectionSpaceToken"],
      [COLUMN_WIDTHS_TOKENS, "columnWidthsToken"], [ASPECT_TOKENS, "aspectToken"],
      [PALETTE_SLOTS, "paletteSlot"], [BACKGROUND_TOKENS, "backgroundToken"], [TYPE_STEPS, "typeStep"],
      [ALIGN_TOKENS, "alignToken"], [VERTICAL_ALIGN_TOKENS, "verticalAlignToken"], [VISIBILITY_TOKENS, "visibilityToken"],
    ];
    for (const [ours, name] of pairs) expect([...ours], name).toEqual(enumOf(def(name)));
    expect([...ICON_NAMES]).toEqual(enumOf(properties(branch("iconbox").props).icon as Node));
    expect([...VIDEO_PROVIDERS]).toEqual(enumOf(properties(branch("video").props).provider as Node));
    const level = properties(branch("heading").props).level as Node;
    expect([...HEADING_LEVELS]).toEqual([1, 2, 3, 4].filter((n) => n >= (level.minimum as number) && n <= (level.maximum as number)));
    expect(HEADING_LEVELS.length).toBe((level.maximum as number) - (level.minimum as number) + 1);
  });

  test("the style settings, and which ones each block type takes", () => {
    expect([...STYLE_TOKEN_KEYS].sort()).toEqual(Object.keys(properties(def("styleTokens"))).sort());
    for (const type of BLOCK_TYPES) {
      const style = branch(type).style;
      // Each device of a type's style refers to the same list of keys.
      const devices = properties(style);
      expect(Object.keys(devices).sort(), type).toEqual(["base", "phone", "tablet"]);
      const keys = new Set(Object.values(devices).map((device) => JSON.stringify(Object.keys(properties(deref(device))).sort())));
      expect(keys.size, type).toBe(1);
      expect([...STYLE_KEYS_BY_TYPE[type]].sort(), type).toEqual(JSON.parse([...keys][0] ?? "[]"));
    }
  });

  test("the props of every block type, and which are required", () => {
    for (const type of BLOCK_TYPES) {
      if (type === "image") continue;
      expect(sorted(PROP_KEYS[type]), type).toEqual(sorted(keyTable(branch(type).props)));
    }
    const accordionItems = properties(branch("accordion").props).items as Node;
    expect(sorted(ACCORDION_ITEM_KEYS)).toEqual(sorted(keyTable(deref(accordionItems.items as Node))));
    expect(sorted(DOCUMENT_KEYS)).toEqual(sorted(keyTable(schema)));
    expect(properties(schema).schemaVersion?.const).toBe(SCHEMA_VERSION);
  });

  test("an image is an image reference, and so is each gallery item", () => {
    expect(branch("image").props).toBe(def("imageRef"));
    const galleryItems = properties(branch("gallery").props).items as Node;
    expect(deref(galleryItems.items as Node)).toBe(def("imageRef"));
    expect(Object.keys(properties(def("imageRef"))).sort()).toEqual([...IMAGE_REF_KEYS].sort());
    // Exactly one source and exactly one of alt and decorative: the two
    // if/then/else pairs ImageSource and ImageText spell out.
    const pairs = (def("imageRef").allOf as Node[]).map((rule) => [(rule.if as Node).required, (rule.else as Node).required]);
    expect(pairs).toEqual([[["mediaId"], ["url"]], [["decorative"], ["alt"]]]);
    expect(properties(def("imageRef")).decorative?.const).toBe(true);
  });

  test("the column-width presets each count of columns may name", () => {
    const branches = def("sectionBlock").allOf as Node[];
    const byCount: Record<number, unknown[]> = {};
    for (const rule of branches) {
      const children = properties(rule.if as Node).children as Node;
      const min = (children.minItems as number | undefined) ?? 1;
      const max = (children.maxItems as number | undefined) ?? 4;
      const widths = properties(properties(rule.then as Node).props as Node).columnWidths as Node | undefined;
      for (let count = min; count <= max; count++) byCount[count] = widths?.enum ? [...(widths.enum as unknown[])] : [];
    }
    expect(byCount).toEqual(Object.fromEntries(Object.entries(COLUMN_WIDTHS_BY_COUNT).map(([count, list]) => [count, [...list]])));
  });

  test("the rich-text nodes and marks", () => {
    expect([...RICH_TEXT_BLOCK_TYPES]).toEqual(enumOf(properties(def("pmBlockNode")).type as Node));
    expect([...INLINE_NODE_TYPES]).toEqual(enumOf(properties(def("pmInlineNode")).type as Node));
    expect([...MARK_TYPES]).toEqual(enumOf(properties(def("pmMark")).type as Node));
    const attrs = properties(properties(def("pmOrderedList")).attrs as Node);
    expect([...ORDERED_LIST_STYLES]).toEqual(enumOf(attrs.type as Node));
    expect(Object.keys(attrs).sort()).toEqual(["start", "type"]);
    const link = properties(properties(def("pmMarkLink")).attrs as Node);
    expect(Object.keys(link).sort()).toEqual(["class", "href", "rel", "target"]);
  });
});
