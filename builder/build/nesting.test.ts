// The nesting rule the editor imports is the schema's, read when the editor
// is built: it must say what the schema says today, follow the schema when
// the schema changes, and stop the build when it cannot read the schema
// rather than hand the editor an empty rule.
import { describe, expect, test } from "vitest";
import { CHILD_TYPES } from "virtual:block-document-nesting";
import { BLOCK_TYPES, WIDGET_TYPES } from "../src/shared/document.ts";
import { nestingFromSchema, nestingSource, PAGE } from "./nesting.ts";
import { readSchema } from "./validator.ts";

type Node = Record<string, unknown>;
const copy = (): Node => structuredClone(readSchema()) as Node;
const defs = (schema: Node) => schema.$defs as Record<string, Node>;
const childrenItemsType = (schema: Node, def: string) =>
  ((((defs(schema)[def] as Node).properties as Node).children as Node).items as Node).properties as Node;

describe("the nesting rule, read from the schema", () => {
  test("page > section > column > widget, and widgets hold nothing", () => {
    const expected: Record<string, string[]> = { [PAGE]: ["section"], section: ["column"], column: [...WIDGET_TYPES] };
    for (const type of WIDGET_TYPES) expected[type] = [];
    expect(nestingFromSchema(readSchema())).toEqual(expected);
    expect(Object.keys(expected).sort()).toEqual([PAGE, ...BLOCK_TYPES].sort());
  });

  test("the module the editor imports is that table", () => {
    expect(CHILD_TYPES).toEqual(nestingFromSchema(readSchema()));
    expect(nestingSource(readSchema())).toContain("export const CHILD_TYPES = ");
  });

  test("a schema that lets a column hold a section gives a rule that does", () => {
    const schema = copy();
    const type = childrenItemsType(schema, "columnBlock").type as Node;
    delete type.$ref;
    type.enum = ["section", "heading"];
    const table = nestingFromSchema(schema);
    expect(table.column).toEqual(["section", "heading"]);
    expect(table.section).toEqual(["column"]);
  });

  test("a widget whose children are opened up holds what the schema names", () => {
    const schema = copy();
    const quote = defs(schema).quoteBlock as Node;
    (quote.properties as Node).children = { type: "array", items: { $ref: "#/$defs/block", properties: { type: { const: "text" } } } };
    expect(nestingFromSchema(schema).quote).toEqual(["text"]);
  });

  test("what it cannot read stops the build", () => {
    const noBranch = copy();
    const block = defs(noBranch).block as Node;
    block.allOf = (block.allOf as Node[]).filter((b) => ((b.if as Node).properties as Node).type !== undefined
      && (((b.if as Node).properties as Node).type as Node).const !== "map");
    expect(() => nestingFromSchema(noBranch)).toThrow(/0 branches of \$defs\/block for map/);

    const unknownType = copy();
    (childrenItemsType(unknownType, "sectionBlock").type as Node).const = "row";
    expect(() => nestingFromSchema(unknownType)).toThrow(/names row, which is not a block type/);

    const noSections = copy();
    delete (noSections.properties as Node).sections;
    expect(() => nestingFromSchema(noSections)).toThrow(/the page has no sections/);
  });
});
