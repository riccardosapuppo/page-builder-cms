// A collection and an entry of it as TypeScript types, written from
// schema/collection.schema.json, the one schema of a collection the editor
// and the server validate with. The schema decides; these types follow it,
// and collection.test.ts reads the schema and fails when a type, a key or
// a list here no longer matches it.
//
// The types describe what passed the checks (./validate.ts,
// validateCollection and validateEntry). What they cannot say, the checks
// still do: the keys of a collection's fields unique, a choice's options
// too, a sort by a date or number field, each value of an entry of its
// field's type, every required field with one.
import type { ImageText, RichTextDoc } from "./document.ts";
import { FIELD_TYPES, type FieldType } from "../../../schema/tools/collection-rules.ts";

// The types of field, and what an order may follow besides a field, from
// the collection rules themselves (schema/tools/collection-rules.ts); and
// what a day and a number of an entry are held to there, which the page's
// renderer reads values by too (../render/entry-words.ts).
export { dayExists, FIELD_TYPES, NUMBER_LIMIT, SORT_BUILT_INS, SORTABLE_TYPES, VALUE_DEFS, type FieldType } from "../../../schema/tools/collection-rules.ts";
export { hundredthsText, twoDecimals } from "../../../schema/tools/rules.ts";

export const SORT_DIRECTIONS = ["asc", "desc"] as const;
export type SortDirection = (typeof SORT_DIRECTIONS)[number];

// The keys a collection's fields never take: the built-in fields of every
// entry.
export const BUILT_IN_KEYS = ["title", "slug"] as const;

// One field. A number may have a lowest and a highest value, a choice has
// its options; no other type has either.
interface FieldOf<T extends FieldType> {
  // The key its value is kept under in every entry.
  key: string;
  label: string;
  type: T;
  required: boolean;
}
export type NumberField = FieldOf<"number"> & { min?: number; max?: number; options?: never };
export type ChoiceField = FieldOf<"choice"> & { options: string[]; min?: never; max?: never };
export type PlainField = FieldOf<Exclude<FieldType, "number" | "choice">> & { min?: never; max?: never; options?: never };
export type Field = PlainField | NumberField | ChoiceField;

// The order a collection's entries are listed in by default: by title, by
// when they last changed or went live, or by a date or number field's key.
export interface CollectionSort {
  by: string;
  direction: SortDirection;
}

// A collection's definition, as it is sent and kept.
export interface CollectionDefinition {
  name: string;
  // The first part of every entry's address: /<prefix>/<entry slug>.
  prefix: string;
  fields: Field[];
  sort: CollectionSort;
}

// The value of each type of field. An image is a library image (never one
// from another site) with its alt text, or decorative; a link is a
// button's words and address.
export type ImageValue = { mediaId: string; url?: never } & ImageText;
export interface LinkValue {
  label: string;
  href: string;
}
export interface FieldValueOf {
  text: string;
  paragraph: string;
  richText: RichTextDoc;
  number: number;
  date: string;
  image: ImageValue;
  link: LinkValue;
  toggle: boolean;
  choice: string;
}
export type FieldValue = FieldValueOf[FieldType];

// An entry's values, by field key. A value read back may be one kept from
// a field since deleted, until the entry's next save leaves it out: what
// reads one goes by the collection's fields, not by the keys found here.
export type EntryValues = Record<string, FieldValue>;

// An entry as the editor saves it: its title, its slug (the next address,
// /<prefix>/<slug>) and its values.
export interface EntryContent {
  title: string;
  slug: string;
  values: EntryValues;
}

// ------------------------------------------- the keys, for the schema test

type RequiredKeys<T> = { [K in keyof T]-?: object extends Pick<T, K> ? never : K }[keyof T];
type KeyTable<T> = { readonly [K in keyof T]-?: K extends RequiredKeys<T> ? "required" : "optional" };

export const COLLECTION_KEYS = { name: "required", prefix: "required", fields: "required", sort: "required" } as const satisfies KeyTable<CollectionDefinition>;
// A field's keys whatever its type: min, max and options are optional here,
// and the schema says for which types each is there.
export const FIELD_KEYS = {
  key: "required", label: "required", type: "required", required: "required", min: "optional", max: "optional", options: "optional",
} as const satisfies KeyTable<FieldOf<FieldType> & { min?: number; max?: number; options?: string[] }>;
export const SORT_KEYS = { by: "required", direction: "required" } as const satisfies KeyTable<CollectionSort>;
export const ENTRY_KEYS = { title: "required", slug: "required", values: "required" } as const satisfies KeyTable<EntryContent>;
export const LINK_VALUE_KEYS = { label: "required", href: "required" } as const satisfies KeyTable<LinkValue>;

// Whether a type of field is one of the closed list.
export function isFieldType(type: unknown): type is FieldType {
  return (FIELD_TYPES as readonly unknown[]).includes(type);
}
