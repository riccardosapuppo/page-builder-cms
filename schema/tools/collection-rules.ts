// The rules of a collection and of its entries that the collection's
// schema (schema/collection.schema.json) cannot say, and the order the
// rules and the schema run in. cms/lib/collection_document/rules.rb is the
// same code in Ruby, rule for rule and pointer for pointer; the comparator
// in this folder runs both over the collection corpus
// (schema/collection-corpus) and fails if they ever answer differently.
//
// No dependency but ./rules.ts and no Node API, so the editor can import
// this file as is. The schema's engine is the caller's (ajv compiled ahead
// of time in the editor, at run time here), handed in as a SchemaCheck.
//
// The pipeline, the same on both sides, after parseJson or checkJson of
// ./rules.ts (the rules any JSON value is held to, then 2.0 made 2):
//   a collection: its own rules (field keys unique, "uniqueKey"; a
//     choice's options unique, "uniqueOption"; a number field's lowest and
//     highest values with two decimals at most, "decimals", and the lowest
//     not above the highest, "range"; a sort by a date or number field of
//     the collection, "sortField"), then the schema;
//   an entry, against a collection that passed: its own rules (a value
//     under a key no field has, "unknownField"; none for a required field,
//     "required"; and each value by its field: a number with two decimals
//     at most, "decimals", not below the field's lowest, "minimum", nor
//     above its highest, "maximum"; a day that exists, "dateExists"; a
//     choice among the field's options, "enum"), then the schema on the
//     entry and on each value, by its field's type.
// Every error of both is answered together. Unlike a page's rules, these
// do not stand in front of the schema: what they guard is what a value
// means, not the engines (the JSON rules have done that), and a person
// filling in an entry should see every fault at once. Each reads only a
// value of the shape it expects and leaves the rest to the schema.
import { escapePointer, twoDecimals } from "./rules.ts";

// The name ajv knows the collection schema by: the schema has no $id (its
// $comment says why), and this name, beside the page schema's $id, makes
// its references to the page schema resolve to that one.
export const COLLECTION_SCHEMA_KEY = "https://page-builder-cms.example/schema/collection.schema.json";

export const FIELD_TYPES =["text", "paragraph", "richText", "number", "date", "image", "link", "toggle", "choice"] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

// What a collection's entries may be ordered by besides a field: the
// title, when an entry last changed, when it went live.
export const SORT_BUILT_INS = ["title", "updatedAt", "publishedAt"] as const;
// The types of field an order may follow.
export const SORTABLE_TYPES: readonly FieldType[] = ["date", "number"];

// The definition of collection.schema.json a value of each type of field
// is checked against.
export const VALUE_DEFS: Readonly<Record<FieldType, string>> = {
  text: "textValue",
  paragraph: "paragraphValue",
  richText: "richTextValue",
  number: "numberValue",
  date: "dateValue",
  image: "imageValue",
  link: "linkValue",
  toggle: "toggleValue",
  choice: "choiceValue",
};

// The schema's own limits, which the rules read so that each looks only at
// a value the schema takes: a number from minus a billion to a billion
// (numberValue), a day as dateValue's pattern writes it, and a sort's key
// as its pattern does.
export const NUMBER_LIMIT = 1_000_000_000;
const DAY = /^([0-9]{4})-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/;
const SORT_KEY = /^(?:title|updatedAt|publishedAt|[a-z][a-z0-9-]{0,63})$/;

// The words of the rules, as the Ruby twin writes them
// (builder/src/storage/browser-rules.test.ts holds the two to each other).
export const COLLECTION_WORDS = {
  uniqueKey: (key: string) => `The key "${key}" is already another field's.`,
  uniqueOption: (option: string) => `The option "${option}" is already one of this field's.`,
  decimals: "Two decimals at most.",
  range: "The highest value is below the lowest.",
  sortField: (by: string) => `The collection has no date or number field "${by}".`,
  unknownField: (key: string) => `The collection has no field "${key}".`,
  required: "is required",
  minimum: (least: number) => `must be at least ${least}`,
  maximum: (most: number) => `must be at most ${most}`,
  dateExists: "is not a day that exists",
  enum: "must be one of the field's options",
} as const;

export type CollectionRuleKeyword = "uniqueKey" | "uniqueOption" | "decimals" | "range" | "sortField" | "unknownField" | "required" | "minimum" | "maximum" | "dateExists" | "enum";

// One fault, at a JSON pointer into the collection or the entry checked.
// property is the name ajv gives of a member missing or not allowed, which
// the comparator reads; layer says whether a rule found it or the schema.
export interface FoundError {
  pointer: string;
  keyword: string;
  message: string;
  property?: string;
}
export interface CheckError extends FoundError {
  layer: "rules" | "schema";
}

// What the schema finds in a value against one of its definitions:
// "collection" for the collection itself, else a name of its $defs
// ("entry", "textValue"...). Pointers from the value checked.
export type SchemaCheck = (definition: string, value: unknown) => FoundError[];

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

const isNumber = (value: unknown): value is number => typeof value === "number" && value >= -NUMBER_LIMIT && value <= NUMBER_LIMIT;

// Whether a day of the proleptic Gregorian calendar exists, as the
// pattern's year, month and day: 30 February does not, 29 February only in
// a leap year.
export function dayExists(text: string): boolean {
  const found = DAY.exec(text);
  if (!found) return false;
  const year = Number(found[1]);
  const month = Number(found[2]);
  const day = Number(found[3]);
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const days = month === 2 ? (leap ? 29 : 28) : [4, 6, 9, 11].includes(month) ? 30 : 31;
  return day <= days;
}

const rule = (pointer: string, keyword: CollectionRuleKeyword, message: string): CheckError => ({ pointer, keyword, message, layer: "rules" });
const found = (errors: readonly FoundError[], prefix: string): CheckError[] => errors.map((e) => ({ ...e, pointer: `${prefix}${e.pointer}`, layer: "schema" }));

// A collection's faults, its rules' and then its schema's, at pointers
// into the collection.
export function checkCollection(collection: unknown, schema: SchemaCheck): CheckError[] {
  const errors: CheckError[] = [];
  const fields = isObject(collection) && Array.isArray(collection.fields) ? collection.fields : [];
  const keys = new Set<string>();
  fields.forEach((field: unknown, k: number) => {
    if (!isObject(field)) return;
    const at = `/fields/${k}`;
    if (typeof field.key === "string") {
      if (keys.has(field.key)) errors.push(rule(`${at}/key`, "uniqueKey", COLLECTION_WORDS.uniqueKey(field.key)));
      else keys.add(field.key);
    }
    if (field.type === "choice" && Array.isArray(field.options)) {
      const options = new Set<string>();
      field.options.forEach((option: unknown, j: number) => {
        if (typeof option !== "string") return;
        if (options.has(option)) errors.push(rule(`${at}/options/${j}`, "uniqueOption", COLLECTION_WORDS.uniqueOption(option)));
        else options.add(option);
      });
    }
    if (field.type === "number") {
      for (const end of ["min", "max"] as const) {
        const value = field[end];
        if (isNumber(value) && !twoDecimals(value)) errors.push(rule(`${at}/${end}`, "decimals", COLLECTION_WORDS.decimals));
      }
      if (isNumber(field.min) && isNumber(field.max) && field.min > field.max) errors.push(rule(`${at}/max`, "range", COLLECTION_WORDS.range));
    }
  });
  const sort = isObject(collection) ? collection.sort : undefined;
  const by = isObject(sort) ? sort.by : undefined;
  if (typeof by === "string" && SORT_KEY.test(by) && !(SORT_BUILT_INS as readonly string[]).includes(by)) {
    const sortable = fields.some((field: unknown) => isObject(field) && field.key === by && (SORTABLE_TYPES as readonly unknown[]).includes(field.type));
    if (!sortable) errors.push(rule("/sort/by", "sortField", COLLECTION_WORDS.sortField(by)));
  }
  return [...errors, ...found(schema("collection", collection), "")];
}

// The fields of a collection that passed checkCollection, as the rules of
// an entry read them.
interface FieldOf {
  key: string;
  type: FieldType;
  required: boolean;
  min?: number;
  max?: number;
  options?: string[];
}

// An entry's faults against its collection, which passed checkCollection:
// the rules', then the schema's on the entry and on each value by its
// field's type, at pointers into the entry.
export function checkEntry(collection: unknown, entry: unknown, schema: SchemaCheck): CheckError[] {
  const fields = (isObject(collection) && Array.isArray(collection.fields) ? collection.fields : []) as FieldOf[];
  const values = isObject(entry) && isObject(entry.values) ? entry.values : null;
  const errors: CheckError[] = [];
  if (values !== null) {
    const known = new Set(fields.map((field) => field.key));
    for (const key of Object.keys(values)) {
      if (!known.has(key)) errors.push(rule(`/values/${escapePointer(key)}`, "unknownField", COLLECTION_WORDS.unknownField(key)));
    }
    for (const field of fields) {
      const at = `/values/${escapePointer(field.key)}`;
      if (!Object.hasOwn(values, field.key)) {
        if (field.required) errors.push(rule(at, "required", COLLECTION_WORDS.required));
        continue;
      }
      const value = values[field.key];
      if (field.type === "number" && isNumber(value)) {
        if (!twoDecimals(value)) errors.push(rule(at, "decimals", COLLECTION_WORDS.decimals));
        if (field.min !== undefined && value < field.min) errors.push(rule(at, "minimum", COLLECTION_WORDS.minimum(field.min)));
        if (field.max !== undefined && value > field.max) errors.push(rule(at, "maximum", COLLECTION_WORDS.maximum(field.max)));
      } else if (field.type === "date" && typeof value === "string" && DAY.test(value) && !dayExists(value)) {
        errors.push(rule(at, "dateExists", COLLECTION_WORDS.dateExists));
      } else if (field.type === "choice" && typeof value === "string" && !(field.options ?? []).includes(value)) {
        errors.push(rule(at, "enum", COLLECTION_WORDS.enum));
      }
    }
  }
  errors.push(...found(schema("entry", entry), ""));
  if (values !== null) {
    for (const field of fields) {
      if (Object.hasOwn(values, field.key)) errors.push(...found(schema(VALUE_DEFS[field.type], values[field.key]), `/values/${escapePointer(field.key)}`));
    }
  }
  return errors;
}
