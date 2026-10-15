// The types of document.ts against schema/block-document.schema.json: the
// compiler holds the tables in document.ts to the interfaces, and this test
// holds the same tables to the schema. A token, a key or a required key
// added to, removed from or renamed in the schema fails here until the
// types follow.
import { FREE_COLOR_PATTERN } from "./free-colors.ts";
import { FONT_SIZE_PATTERN, FONT_WEIGHTS, FREE_NUMBER_RANGES, FREE_TYPE_BLOCKS, FREE_TYPE_KEYS } from "./free-type.ts";
import { describe, expect, test } from "vitest";
import schemaJson from "../../../schema/block-document.schema.json";
import {
  ACCORDION_ITEM_KEYS, ALIGN_TOKENS, ASPECT_TOKENS, BACKGROUND_TOKENS, BLOCK_TYPES, COLUMN_WIDTHS_BY_COUNT,
  COLUMN_WIDTHS_TOKENS, DOCUMENT_KEYS, EMAIL_MAX_LENGTH, FORM_FIELD_KEYS, FORM_FIELD_KINDS, FORM_TEXT_LIMITS, HEADING_LEVELS, ICON_NAMES, IMAGE_PROPS_KEYS, IMAGE_REF_KEYS, INLINE_NODE_TYPES, MARK_TYPES,
  MENU_LINK_KEYS, ORDERED_LIST_STYLES, PALETTE_SLOTS, PRICING_BUTTON_KEYS, PRICING_PLAN_KEYS, PROP_KEYS, RICH_TEXT_BLOCK_TYPES, SCHEMA_VERSION, SECTION_SPACE_TOKENS,
  SPACE_TOKENS, STACK_TOKENS, STATS_ITEM_KEYS, STEPS_ITEM_KEYS, STYLE_KEYS_BY_TYPE, STYLE_TOKEN_KEYS, STYLE_TOKENS, TYPE_STEPS, TYPEFACE_TOKENS, VERTICAL_ALIGN_TOKENS, VIDEO_PROVIDERS,
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
      [COLUMN_WIDTHS_TOKENS, "columnWidthsToken"], [STACK_TOKENS, "stackToken"], [ASPECT_TOKENS, "aspectToken"],
      [PALETTE_SLOTS, "paletteSlot"], [BACKGROUND_TOKENS, "backgroundToken"], [TYPE_STEPS, "typeStep"],
      [ALIGN_TOKENS, "alignToken"], [VERTICAL_ALIGN_TOKENS, "verticalAlignToken"], [VISIBILITY_TOKENS, "visibilityToken"],
      [TYPEFACE_TOKENS, "typefaceToken"],
    ];
    for (const [ours, name] of pairs) expect([...ours], name).toEqual(enumOf(def(name)));
    expect([...ICON_NAMES]).toEqual(enumOf(properties(branch("iconbox").props).icon as Node));
    expect([...VIDEO_PROVIDERS]).toEqual(enumOf(properties(branch("video").props).provider as Node));
    const level = properties(branch("heading").props).level as Node;
    expect([...HEADING_LEVELS]).toEqual([1, 2, 3, 4].filter((n) => n >= (level.minimum as number) && n <= (level.maximum as number)));
    expect(HEADING_LEVELS.length).toBe((level.maximum as number) - (level.minimum as number) + 1);
  });

  test("a form field's kinds, and the most characters each kind of text takes", () => {
    const field = def("formField");
    expect([...FORM_FIELD_KINDS]).toEqual(enumOf(properties(field).kind as Node));
    // The longer text's limit is the field's own maximum; the line's is
    // its kind's branch's, lower.
    expect(FORM_TEXT_LIMITS.textarea).toBe(properties(field).maxLength?.maximum);
    const branchOf = (kind: string) => (field.allOf as Node[]).find((rule) => (properties(rule.if as Node).kind as Node).const === kind)!;
    expect(FORM_TEXT_LIMITS.text).toBe((properties(branchOf("text").then as Node).maxLength as Node).maximum);
    for (const kind of ["textarea", "text"]) expect((branchOf(kind).then as Node).required, kind).toEqual(["maxLength"]);
    for (const kind of ["email", "checkbox"]) expect(((branchOf(kind).then as Node).not as Node).required, kind).toEqual(["maxLength"]);
    // The standard's longest address, which no field may change.
    expect(EMAIL_MAX_LENGTH).toBe(254);
  });

  test("the style settings, and which ones each block type takes", () => {
    expect([...STYLE_TOKEN_KEYS].sort()).toEqual(Object.keys(properties(def("styleTokens"))).sort());
    // Each setting's tokens are the enum its key refers to; a background and
    // a colour may name a free colour instead (freeColor). Free type takes
    // no token (below).
    const settings = properties(def("styleTokens"));
    expect(Object.keys(STYLE_TOKENS).sort()).toEqual(STYLE_TOKEN_KEYS.filter((key) => !(FREE_TYPE_KEYS as readonly string[]).includes(key)).sort());
    for (const key of Object.keys(STYLE_TOKENS) as Array<keyof typeof STYLE_TOKENS>) {
      const setting = settings[key] as Node;
      const either = setting.anyOf as Node[] | undefined;
      const tokens = either ? either.find((branch) => branch.$ref !== "#/$defs/freeColor")! : setting;
      expect([...STYLE_TOKENS[key]], key).toEqual(enumOf(tokens));
      expect(either?.some((branch) => branch.$ref === "#/$defs/freeColor") ?? false, key).toBe(key === "background" || key === "color");
    }
    expect(def("freeColor").pattern).toBe(FREE_COLOR_PATTERN);
    // Free type: each key its definition of the same name; the size's
    // pattern, the weights, and each number's range as the rules read it.
    for (const key of FREE_TYPE_KEYS) expect((settings[key] as Node).$ref, key).toBe(`#/$defs/${key}`);
    expect(def("fontSize").pattern).toBe(FONT_SIZE_PATTERN);
    expect(def("fontWeight").enum).toEqual([...FONT_WEIGHTS]);
    for (const [key, range] of Object.entries(FREE_NUMBER_RANGES)) {
      expect({ type: def(key).type, min: def(key).minimum, max: def(key).maximum }, key).toEqual({ type: "number", min: range.min, max: range.max });
    }
    // The block types that take it are those that take a typeface.
    expect(BLOCK_TYPES.filter((type) => (STYLE_KEYS_BY_TYPE[type] as readonly string[]).includes("fontSize"))).toEqual([...FREE_TYPE_BLOCKS]);
    expect(BLOCK_TYPES.filter((type) => (STYLE_KEYS_BY_TYPE[type] as readonly string[]).includes("typeface"))).toEqual([...FREE_TYPE_BLOCKS]);
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
    const statsItems = properties(branch("stats").props).items as Node;
    expect(sorted(STATS_ITEM_KEYS)).toEqual(sorted(keyTable(deref(statsItems.items as Node))));
    const stepsItems = properties(branch("steps").props).items as Node;
    expect(sorted(STEPS_ITEM_KEYS)).toEqual(sorted(keyTable(deref(stepsItems.items as Node))));
    const plans = properties(branch("pricing").props).plans as Node;
    const plan = deref(plans.items as Node);
    expect(sorted(PRICING_PLAN_KEYS)).toEqual(sorted(keyTable(plan)));
    expect(sorted(PRICING_BUTTON_KEYS)).toEqual(sorted(keyTable(properties(plan).button as Node)));
    const formItems = properties(branch("form").props).items as Node;
    expect(sorted(FORM_FIELD_KEYS)).toEqual(sorted(keyTable(deref(formItems.items as Node))));
    const menuItems = properties(branch("menu").props).items as Node;
    expect(sorted(MENU_LINK_KEYS)).toEqual(sorted(keyTable(deref(menuItems.items as Node))));
    expect(sorted(DOCUMENT_KEYS)).toEqual(sorted(keyTable(schema)));
    expect(properties(schema).schemaVersion?.const).toBe(SCHEMA_VERSION);
  });

  test("a pricing plan's button is a button block's words and link, by the same definitions; its period, text and badge are a line or a paragraph that may be empty", () => {
    const plan = properties(deref((properties(branch("pricing").props).plans as Node).items as Node));
    const own = properties(branch("button").props);
    expect(properties(plan.button as Node).label).toEqual(own.label);
    expect(properties(plan.button as Node).href).toEqual(own.href);
    expect([plan.period?.$ref, plan.text?.$ref, plan.badge?.$ref]).toEqual(["#/$defs/lineOrEmpty", "#/$defs/paragraphOrEmpty", "#/$defs/lineOrEmpty"]);
    // Each is its text's own definition with the empty string let in, and
    // nothing else changed.
    for (const [empty, text] of [["lineOrEmpty", "line"], ["paragraphOrEmpty", "paragraph"]] as const) {
      expect(def(empty).pattern, empty).toBe(`^$|${def(text).pattern as string}`);
      expect(def(empty).not, empty).toEqual(def(text).not);
    }
  });

  test("each gallery item is an image reference, and an image's props are one with the block's class and anchor", () => {
    const galleryItems = properties(branch("gallery").props).items as Node;
    expect(deref(galleryItems.items as Node)).toBe(def("imageRef"));
    expect(branch("image").props).toBe(def("imageProps"));
    expect(Object.keys(properties(def("imageRef"))).sort()).toEqual([...IMAGE_REF_KEYS].sort());
    expect(Object.keys(properties(def("imageProps"))).sort()).toEqual([...IMAGE_PROPS_KEYS].sort());
    // Exactly one source and exactly one of alt and decorative, for both:
    // the two if/then/else pairs ImageSource and ImageText spell out.
    for (const name of ["imageRef", "imageProps"]) expect(def(name).$ref, name).toBe("#/$defs/imageRules");
    const pairs = (def("imageRules").allOf as Node[]).map((rule) => [(rule.if as Node).required, (rule.else as Node).required]);
    expect(pairs).toEqual([[["mediaId"], ["url"]], [["decorative"], ["alt"]]]);
    expect(def("decorative").const).toBe(true);
  });

  test("every block type takes the same class and anchor, by the schema's two definitions", () => {
    for (const type of BLOCK_TYPES) {
      const own = properties(branch(type).props);
      expect(own.className?.$ref, type).toBe("#/$defs/className");
      expect(own.anchor?.$ref, type).toBe("#/$defs/anchor");
    }
    expect(properties(schema).sticky?.const).toBe(true);
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

  test("a section of one column names neither a preset nor where to stack, and only it", () => {
    const forbidden = (rule: Node): string[] => {
      const not = (properties(rule.then as Node).props as Node).not as Node | undefined;
      const entries = not ? ((not.anyOf as Node[] | undefined) ?? [not]) : [];
      return entries.flatMap((entry) => (entry.required ?? []) as string[]).sort();
    };
    const byCount: Record<number, string[]> = {};
    for (const rule of def("sectionBlock").allOf as Node[]) {
      const children = properties(rule.if as Node).children as Node;
      for (let count = (children.minItems as number | undefined) ?? 1; count <= ((children.maxItems as number | undefined) ?? 4); count++) byCount[count] = forbidden(rule);
    }
    expect(byCount).toEqual({ 1: ["columnWidths", "stack"], 2: [], 3: [], 4: ["columnWidths"] });
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
