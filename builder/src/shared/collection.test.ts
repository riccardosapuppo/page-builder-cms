// The types of collection.ts against schema/collection.schema.json: the
// compiler holds the key tables of collection.ts to its interfaces, and
// this test holds the same tables and lists to the schema; and the
// editor's checks of a collection and an entry (validate.ts, the collection
// rules of schema/tools with the validators compiled when the editor is
// built) to the collection corpus, which the server's are held to too.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import schemaJson from "../../../schema/collection.schema.json";
import { parseJson } from "../../../schema/tools/rules.ts";
import {
  BUILT_IN_KEYS, COLLECTION_KEYS, ENTRY_KEYS, FIELD_KEYS, FIELD_TYPES, LINK_VALUE_KEYS, SORT_BUILT_INS, SORT_DIRECTIONS, SORT_KEYS, VALUE_DEFS, type CollectionDefinition,
} from "./collection.ts";
import { validateCollection, validateEntry } from "./validate.ts";

type Node = Record<string, unknown>;
const schema = schemaJson as unknown as Node;
const defs = schema.$defs as Record<string, Node>;

function def(name: string): Node {
  const found = defs[name];
  if (!found) throw new Error(`the collection schema has no $defs/${name}`);
  return found;
}
const deref = (node: Node): Node => (typeof node.$ref === "string" && node.$ref.startsWith("#/$defs/") ? def(node.$ref.slice("#/$defs/".length)) : node);
const properties = (node: Node): Record<string, Node> => (node.properties ?? {}) as Record<string, Node>;
function keyTable(node: Node): Record<string, string> {
  const required = new Set((node.required ?? []) as string[]);
  return Object.fromEntries(Object.keys(properties(node)).map((key) => [key, required.has(key) ? "required" : "optional"]));
}
const sorted = (o: Record<string, string>) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));

describe("the collection's types match the schema", () => {
  test("the types of field, each with the definition its value is held to", () => {
    expect([...FIELD_TYPES]).toEqual(def("fieldType").enum);
    for (const type of FIELD_TYPES) expect(defs[VALUE_DEFS[type]], type).toBeDefined();
  });

  test("the keys of a collection, a field, an order, an entry and a link", () => {
    expect(sorted(keyTable(schema))).toEqual(sorted(COLLECTION_KEYS));
    expect(sorted(keyTable(def("field")))).toEqual(sorted(FIELD_KEYS));
    expect(sorted(keyTable(def("sort")))).toEqual(sorted(SORT_KEYS));
    expect(sorted(keyTable(def("entry")))).toEqual(sorted(ENTRY_KEYS));
    expect(sorted(keyTable(def("linkValue")))).toEqual(sorted(LINK_VALUE_KEYS));
  });

  test("the orders, the directions and the keys a field never takes", () => {
    expect([...SORT_DIRECTIONS]).toEqual(deref(properties(def("sort")).direction!).enum);
    const by = new RegExp(properties(def("sort")).by!.pattern as string, "u");
    for (const key of SORT_BUILT_INS) expect(by.test(key), key).toBe(true);
    expect((def("fieldKey").not as Node).enum).toEqual([...BUILT_IN_KEYS]);
  });
});

// Each case of the collection corpus, as the editor's checks answer it.
const corpus = fileURLToPath(new URL("../../../schema/collection-corpus/", import.meta.url));
const manifest = JSON.parse(readFileSync(join(corpus, "manifest.json"), "utf8")) as Record<string, { pointer?: string; keyword?: string }>;

describe("the editor's checks of a collection and an entry", () => {
  test("answer every case of the collection corpus as its manifest says", () => {
    const files = ["valid", "invalid"].flatMap((folder) => readdirSync(join(corpus, folder)).filter((f) => f.endsWith(".json")).map((f) => `${folder}/${f}`));
    expect(files.sort()).toEqual(Object.keys(manifest).sort());
    let answered = 0;
    for (const file of files) {
      // The text's own rules (a byte-order mark, a member named twice) are
      // the request's in the editor: a value in memory has passed them.
      const read = parseJson(new Uint8Array(readFileSync(join(corpus, file))));
      if (read.errors.length > 0) continue;
      const found = read.document as { collection: unknown; entry?: unknown };
      const collection = validateCollection(found.collection);
      const result = collection.valid && "entry" in found ? validateEntry(collection.value as CollectionDefinition, found.entry) : collection;
      const prefix = collection.valid && "entry" in found ? "/entry" : "/collection";
      if (file.startsWith("valid/")) {
        expect(result.valid, `${file}: ${result.valid ? "" : JSON.stringify(result.errors)}`).toBe(true);
      } else {
        expect(result.valid, file).toBe(false);
        const reported = result.valid ? [] : result.errors.map((e) => `${prefix}${e.pointer} ${e.keyword}`);
        expect(reported, file).toContain(`${manifest[file]!.pointer} ${manifest[file]!.keyword}`);
      }
      answered += 1;
    }
    // 124 cases on 15 October 2026, of which the text's rules refuse 7.
    expect(answered).toBeGreaterThanOrEqual(110);
  });

  test("an entry's faults come together, each once, at the server's pointers", () => {
    const collection = validateCollection({
      name: "News", prefix: "news",
      fields: [{ key: "day", label: "Day", type: "date", required: true }, { key: "booking", label: "Booking", type: "link", required: false }],
      sort: { by: "day", direction: "desc" },
    });
    if (!collection.valid) throw new Error(JSON.stringify(collection.errors));
    const entry = validateEntry(collection.value, { title: "Dawn", slug: "dawn", values: { booking: { label: "Book", href: "/join", target: "_blank" } } });
    expect(entry.valid ? [] : entry.errors.map((e) => [e.pointer, e.keyword, e.layer])).toEqual([
      ["/values/day", "required", "rules"], ["/values/booking/target", "additionalProperties", "schema"],
    ]);
  });
});
