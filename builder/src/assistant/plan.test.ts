// The plan's schema (./plan.ts) walked for the rules both providers hold a
// model's answer to: the root an object; every object closed and every key
// it has required; no keyword but those both take (no counts, lengths,
// patterns, formats or references); enums of strings or integers, and a
// block's kind an enum of one value; and no object deeper than the plan's
// were before pricing came. Then what a model sends, read as the schema
// says: an answer of every kind comes back whole, and what does not fit
// stats, steps or pricing is left out. With pictures made for the page,
// a section's picture and an image may be made, held to the same rules.
import { expect, test } from "vitest";
import { FOCUS_TOKENS, ICON_NAMES, MOTION_TOKENS } from "../shared/document.ts";
import { PLAN_SCHEMA, PLAN_SCHEMA_MADE, PLAN_SHAPES, PLAN_STRENGTHS, PLAN_VEILS, planSchema, readBlock, readPicture, readSection } from "./plan.ts";

type Schema = Record<string, unknown>;

const KEYWORDS = ["type", "description", "enum", "properties", "required", "additionalProperties", "items", "anyOf"];

// Every schema in the plan's, where it is and how many objects deep.
function* walk(schema: Schema, at = "", depth = 0): Generator<{ schema: Schema; at: string; depth: number }> {
  const deep = schema.type === "object" ? depth + 1 : depth;
  yield { schema, at, depth: deep };
  for (const [key, inner] of Object.entries((schema.properties ?? {}) as Record<string, Schema>)) yield* walk(inner, `${at}/properties/${key}`, deep);
  if (schema.items) yield* walk(schema.items as Schema, `${at}/items`, deep);
  for (const [index, inner] of ((schema.anyOf ?? []) as Schema[]).entries()) yield* walk(inner, `${at}/anyOf/${index}`, deep);
}

const ALL = [...walk(PLAN_SCHEMA)];
// Where the plan's blocks are: a choice of objects, one for each kind.
const BLOCK_AT = "/properties/sections/items/properties/columns/items/properties/blocks/items";
const BLOCKS = ALL.find((found) => found.at === BLOCK_AT)!.schema.anyOf as Schema[];
// Where a section's picture is: a choice of objects, one for each source.
const PICTURE_AT = "/properties/sections/items/properties/picture";
const SECTION = ALL.find((found) => found.at === "/properties/sections/items")!.schema;
const kindOf = (block: Schema): unknown => ((block.properties as Record<string, Schema>).kind!.enum as unknown[])[0];

// A value for a schema as a model would write it: the first of an enum,
// one item of a list.
function example(schema: Schema): unknown {
  if (Array.isArray(schema.enum)) return schema.enum[0];
  if (schema.type === "object") return Object.fromEntries(Object.entries(schema.properties as Record<string, Schema>).map(([key, inner]) => [key, example(inner)]));
  if (schema.type === "array") return [example(schema.items as Schema)];
  return schema.type === "boolean" ? true : "Words";
}

test("every object is closed and requires every key it has, the root an object of its own", () => {
  expect(PLAN_SCHEMA.type).toBe("object");
  const objects = ALL.filter((found) => found.schema.type === "object");
  expect(objects.length).toBeGreaterThan(20);
  for (const { schema, at } of objects) {
    expect(schema.additionalProperties, at).toBe(false);
    expect(schema.required, at).toEqual(Object.keys(schema.properties as Schema));
    expect((schema.required as string[]).length, at).toBeGreaterThan(0);
  }
});

test("only the keywords both providers take: no counts, lengths, patterns, formats or references; enums of strings or integers", () => {
  for (const { schema, at } of ALL) {
    for (const key of Object.keys(schema)) expect(KEYWORDS, `${at} ${key}`).toContain(key);
    if (schema.enum) expect((schema.enum as unknown[]).every((value) => typeof value === "string" || Number.isInteger(value)), at).toBe(true);
    // Each is a type, or a choice of objects.
    expect(schema.type !== undefined || Array.isArray(schema.anyOf), at).toBe(true);
  }
  expect(ALL.filter((found) => found.schema.anyOf).map((found) => found.at)).toEqual([PICTURE_AT, BLOCK_AT]);
});

test("a section names its picture by where it comes from, none or the library, with a veil words read through, and its motion; an icon box any icon of the site's", () => {
  const properties = SECTION.properties as Record<string, Schema>;
  expect(Object.keys(properties)).toEqual(["label", "anchor", "background", "picture", "motion", "widths", "columns"]);
  const sources = (properties.picture!.anyOf as Schema[]).map((choice) => ({
    source: ((choice.properties as Record<string, Schema>).source!.enum as unknown[])[0],
    keys: Object.keys(choice.properties as Schema),
  }));
  expect(sources).toEqual([{ source: "none", keys: ["source"] }, { source: "library", keys: ["source", "mediaId", "veil", "strength", "focus"] }]);
  const library = (properties.picture!.anyOf as Schema[])[1]!.properties as Record<string, Schema>;
  // No veil and no light one: a plan's picture keeps its words readable.
  expect(library.veil!.enum).toEqual([...PLAN_VEILS]);
  expect(PLAN_VEILS).toEqual(["dark", "light", "text"]);
  expect(library.strength!.enum).toEqual([...PLAN_STRENGTHS]);
  expect(PLAN_STRENGTHS).toEqual(["medium", "strong"]);
  expect(library.focus!.enum).toEqual([...FOCUS_TOKENS]);
  expect(properties.motion!.enum).toEqual([...MOTION_TOKENS]);
  const iconbox = BLOCKS.find((block) => kindOf(block) === "iconbox")!;
  expect((iconbox.properties as Record<string, Schema>).icon!.enum).toEqual([...ICON_NAMES]);
});

test("a section's picture and motion read without trust: none for what is not the library's or made, the plan's veil, strength and focus or its own", () => {
  expect(readPicture({ source: "library", mediaId: "m1", veil: "light", strength: "strong", focus: "top-left" })).toEqual({ source: "library", mediaId: "m1", veil: "light", strength: "strong", focus: "top-left" });
  expect(readPicture({ source: "library", mediaId: 7, veil: "none", strength: "light", focus: "20% 30%" })).toEqual({ source: "library", mediaId: "", veil: "dark", strength: "medium", focus: "center" });
  // Made for the page: what it shows, its alt text and its shape, a shape it has not being landscape.
  expect(readPicture({ source: "made", prompt: "A gym at dawn", alt: "The gym", shape: "portrait", veil: "text", strength: "strong", focus: "top", mediaId: "m1" })).toEqual({ source: "made", prompt: "A gym at dawn", alt: "The gym", shape: "portrait", veil: "text", strength: "strong", focus: "top" });
  expect(readPicture({ source: "made", prompt: "A gym" })).toEqual({ source: "made", prompt: "A gym", alt: "", shape: "landscape", veil: "dark", strength: "medium", focus: "center" });
  expect(readPicture({ source: "made", prompt: ["no"], alt: 3, shape: "wide" })).toMatchObject({ prompt: "", alt: "", shape: "landscape" });
  for (const other of [undefined, null, "m1", [], { source: "drawn", prompt: "A gym" }, { mediaId: "m1" }]) expect(readPicture(other), JSON.stringify(other)).toEqual({ source: "none" });
  const read = (more: Record<string, unknown>) => readSection({ label: "S", anchor: "", background: "none", widths: "equal", columns: [{ align: "left", blocks: [] }], ...more });
  expect(read({ motion: "zoom" })).toMatchObject({ motion: "zoom", picture: { source: "none" } });
  expect(read({ motion: "spin" })).toMatchObject({ motion: "none" });
  expect(read({})).toMatchObject({ motion: "none", picture: { source: "none" } });
});

test("a block's kind is an enum of one value; the kinds are the plan's, stats, steps and pricing among them", () => {
  for (const block of BLOCKS) expect((block.properties as Record<string, Schema>).kind).toEqual({ type: "string", enum: [kindOf(block)] });
  expect(BLOCKS.map(kindOf)).toEqual(["heading", "text", "list", "button", "image", "iconbox", "quote", "questions", "stats", "steps", "pricing", "form", "divider"]);
});

// Held to the depth the plan had before pricing came, a form's field five
// objects down (the plan, a section, a column, a block, a field), and not
// to a provider's documented limit: neither provider's rule can be checked
// here, and a schema refused would fail every call. A plan's button is two
// of its keys for this.
test("no object nests deeper than a form's field, five down, as before pricing came: a plan of a pricing block is no deeper", () => {
  const deepest = Math.max(...ALL.map((found) => found.depth));
  expect(deepest).toBe(5);
  expect(ALL.filter((found) => found.depth === deepest && found.schema.type === "object").map((found) => found.at)).toEqual([
    `${BLOCK_AT}/anyOf/7/properties/items/items`,
    `${BLOCK_AT}/anyOf/8/properties/figures/items`,
    `${BLOCK_AT}/anyOf/9/properties/steps/items`,
    `${BLOCK_AT}/anyOf/10/properties/plans/items`,
    `${BLOCK_AT}/anyOf/11/properties/fields/items`,
  ]);
});

test("an answer of every kind, as the schema has it, is read back whole", () => {
  for (const block of BLOCKS) {
    const written = example(block);
    expect(readBlock(written), String(kindOf(block))).toEqual(written);
  }
});

// The plan where the person's provider can make pictures and the person
// wants them: a section's picture and an image may be made for the page.
const MADE_ALL = [...walk(PLAN_SCHEMA_MADE)];
const MADE_BLOCKS = MADE_ALL.find((found) => found.at === BLOCK_AT)!.schema.anyOf as Schema[];
const MADE_SECTION = MADE_ALL.find((found) => found.at === "/properties/sections/items")!.schema;
const keysOf = (schema: Schema): string[] => Object.keys(schema.properties as Schema);
const sourceOf = (schema: Schema): unknown => ((schema.properties as Record<string, Schema>).source!.enum as unknown[])[0];

test("with pictures made for the page, a section's picture and an image may be made: what it shows, its alt text and its shape, the same rules held", () => {
  const pictures = (MADE_SECTION.properties as Record<string, Schema>).picture!.anyOf as Schema[];
  expect(pictures.map((choice) => [sourceOf(choice), keysOf(choice)])).toEqual([
    ["none", ["source"]],
    ["library", ["source", "mediaId", "veil", "strength", "focus"]],
    ["made", ["source", "prompt", "alt", "shape", "veil", "strength", "focus"]],
  ]);
  const made = pictures[2]!.properties as Record<string, Schema>;
  expect(made.shape!.enum).toEqual([...PLAN_SHAPES]);
  expect(PLAN_SHAPES).toEqual(["landscape", "square", "portrait"]);
  expect(made.veil!.enum).toEqual([...PLAN_VEILS]);
  // No text in it, and no one real: the schema says so where the prompt is written.
  expect(made.prompt!.description).toContain("No text, letters, numbers, signs or logos in it; any people generic and unnamed, never a real person or a brand.");
  const images = MADE_BLOCKS.filter((block) => kindOf(block) === "image");
  expect(images.map((block) => [sourceOf(block), keysOf(block)])).toEqual([["library", ["kind", "source", "mediaId", "alt"]], ["made", ["kind", "source", "prompt", "alt", "shape"]]]);
  // Closed and required throughout, no keyword but the shared ones, and no deeper.
  for (const { schema, at } of MADE_ALL.filter((found) => found.schema.type === "object")) {
    expect(schema.additionalProperties, at).toBe(false);
    expect(schema.required, at).toEqual(Object.keys(schema.properties as Schema));
  }
  for (const { schema, at } of MADE_ALL) for (const key of Object.keys(schema)) expect(KEYWORDS, `${at} ${key}`).toContain(key);
  expect(Math.max(...MADE_ALL.map((found) => found.depth))).toBe(5);
  // Each made picture as the schema has it is read back whole.
  for (const block of images) expect(readBlock(example(block))).toEqual(example(block));
  expect(readPicture(example(pictures[2]!))).toEqual(example(pictures[2]!));
  // Without pictures made, neither is offered.
  expect(((SECTION.properties as Record<string, Schema>).picture!.anyOf as Schema[]).map(sourceOf)).toEqual(["none", "library"]);
  expect(BLOCKS.filter((block) => kindOf(block) === "image").map(sourceOf)).toEqual(["library"]);
  expect(planSchema(false)).toEqual(PLAN_SCHEMA);
  expect(planSchema(true)).toEqual(PLAN_SCHEMA_MADE);
});

test("an image reads as the library's when it says no source, as a plan written before pictures were made does", () => {
  expect(readBlock({ kind: "image", mediaId: "m1", alt: "The pier" })).toEqual({ kind: "image", source: "library", mediaId: "m1", alt: "The pier" });
  expect(readBlock({ kind: "image", source: "made", prompt: "Rowers at dawn", alt: "", shape: "square", mediaId: "m1" })).toEqual({ kind: "image", source: "made", prompt: "Rowers at dawn", alt: "", shape: "square" });
});

test("stats, steps and pricing read without trust: what is not an object goes, and a word that is not text is none", () => {
  expect(readBlock({ kind: "stats", figures: [{ value: "98%", label: "Who come back" }, "12", { value: 12 }], extra: true })).toEqual({
    kind: "stats", figures: [{ value: "98%", label: "Who come back" }, { value: "", label: "" }],
  });
  expect(readBlock({ kind: "steps", steps: { title: "Not a list" } })).toEqual({ kind: "steps", steps: [] });
  expect(readBlock({ kind: "steps", steps: [null, { title: "Book", text: ["no"] }] })).toEqual({ kind: "steps", steps: [{ title: "Book", text: "" }] });
  expect(readBlock({ kind: "pricing", plans: [[], { name: "Plus", price: "€19", features: ["Help", 7, null], buttonLabel: ["Join"], featured: "yes" }] })).toEqual({
    kind: "pricing",
    plans: [{ name: "Plus", price: "€19", period: "", text: "", features: ["Help"], buttonLabel: "", buttonTarget: "", featured: false, badge: "" }],
  });
});
