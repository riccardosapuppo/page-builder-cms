// The plan's schema (./plan.ts) walked for the rules both providers hold a
// model's answer to: the root an object; every object closed and every key
// it has required; no keyword but those both take (no counts, lengths,
// patterns, formats or references); enums of strings or integers, and a
// block's kind an enum of one value; and no object deeper than the plan's
// were before pricing came. Then what a model sends, read as the schema
// says: an answer of every kind comes back whole, and what does not fit
// stats, steps or pricing is left out.
import { expect, test } from "vitest";
import { PLAN_SCHEMA, readBlock } from "./plan.ts";

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
const BLOCKS = ALL.find((found) => Array.isArray(found.schema.anyOf))!.schema.anyOf as Schema[];
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
  expect(ALL.filter((found) => found.schema.anyOf).map((found) => found.at)).toEqual([BLOCK_AT]);
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
