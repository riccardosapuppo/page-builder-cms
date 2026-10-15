// An entry's values as a page reads and writes them, for the two widgets
// that draw entries (../widgets/collectionList/, ../widgets/field/): a
// collection's field by its key, a value by its key, a day and a number in
// the site's words. The twin of EntryWords (cms/app/models/entry_words.rb),
// held to it by the render contract.
//
// Everything is read defensively, as a block is: what the storage gives
// was checked against its collection's fields when it was saved, but a
// field may have changed its type since, and a fixture of the contract
// holds what no check would let through.
import { isObject } from "../document/json.ts";
import { dayExists, FIELD_TYPES, hundredthsText, NUMBER_LIMIT, twoDecimals, type FieldType } from "../shared/collection.ts";

// A field as the renderers need it: its key, its label and its type.
export interface FieldShown {
  key: string;
  label: string;
  type: FieldType;
}

// The field of `fields` whose key is `key`, the first one with it; null
// when there is none, or when that one's type is none of the list.
export function fieldOf(fields: unknown, key: unknown): FieldShown | null {
  if (!Array.isArray(fields) || typeof key !== "string") return null;
  const field: unknown = fields.find((one: unknown) => isObject(one) && one.key === key);
  if (!isObject(field) || typeof field.type !== "string" || !(FIELD_TYPES as readonly string[]).includes(field.type)) return null;
  return { key, label: typeof field.label === "string" ? field.label : "", type: field.type as FieldType };
}

// An entry's value under a key; undefined for none, null for a null.
export function valueOf(values: unknown, key: string): unknown {
  return isObject(values) && Object.hasOwn(values, key) ? values[key] : undefined;
}

// A day as an entry keeps it, YYYY-MM-DD, when that day exists; null for
// any other value.
export function dayOf(value: unknown): string | null {
  return typeof value === "string" && dayExists(value) ? value : null;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

// A day as the site writes it, in the editor's words for one (its list of
// entries, ../editor/collections/words.ts): "Oct 15, 2026", the day itself
// whatever the reader's zone. Written from the table above rather than
// Intl, so the server writes the same words from its own.
export function dayWords(day: string): string {
  const [year, month, date] = day.split("-").map((part) => Number.parseInt(part, 10));
  return `${MONTHS[(month ?? 1) - 1] ?? ""} ${date ?? ""}, ${year ?? ""}`;
}

// A number as the site writes it, as the editor's list of entries does:
// "1,250.5", "-3", "0.05"; null for what no number field keeps (beyond a
// billion either way, more than two decimals), which is not drawn.
export function numberWords(value: unknown): string | null {
  if (typeof value !== "number" || !Number.isFinite(value) || Math.abs(value) > NUMBER_LIMIT || !twoDecimals(value)) return null;
  const text = hundredthsText(Math.round(value * 100));
  return text.replace(/^(-?)([0-9]+)/, (_, sign: string, whole: string) => `${sign}${whole.replace(/\B(?=(?:[0-9]{3})+$)/g, ",")}`);
}
