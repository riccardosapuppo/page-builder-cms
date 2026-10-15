// An entry's values as its form holds them, and back. Pure: no React.
//
// The form holds one value per field of the collection, under the field's
// key, in the shape the field's type keeps (../../shared/collection.ts,
// FieldValueOf), or nothing: a text left empty, a number not written, no
// image chosen. A link may be half written (its words without its address)
// and is held so, for the check to say which half is missing. A toggle is
// always a value, false until it is turned on, so a required toggle is
// never missing.
//
// An entry read back may hold values no field of the collection takes: a
// field deleted since, or a key given again to a field of another type
// (docs/decisions/collections-are-typed-entries.md). The form reads each
// value by its field, never by the key it finds, and says which it leaves
// out, since the next save does not keep them.
import { refusal } from "../../document/check.ts";
import { isObject } from "../../document/json.ts";
import { textLimitWords } from "../../document/rich-text.ts";
import type { CollectionDefinition, EntryContent, EntryValues, Field, FieldValue, ImageValue, LinkValue } from "../../shared/collection.ts";
import type { RichTextDoc } from "../../shared/document.ts";
import { MAX_NESTING, validateBlockSchema } from "../../shared/validate.ts";

export type FormValues = Readonly<Record<string, unknown>>;

// Whether a value read back is of the shape its field's type keeps.
export function fits(field: Field, value: unknown): boolean {
  switch (field.type) {
    case "text":
    case "paragraph":
    case "date":
    case "choice":
      return typeof value === "string";
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "toggle":
      return typeof value === "boolean";
    case "richText":
      return isObject(value) && value.type === "doc" && Array.isArray(value.content);
    case "image":
      return isObject(value) && typeof value.mediaId === "string";
    case "link":
      return isObject(value) && typeof value.label === "string" && typeof value.href === "string";
  }
}

// A rich text with nothing written in it: one empty paragraph, as the text
// editor holds an empty text.
export function emptyRichText(doc: RichTextDoc): boolean {
  if (doc.content.length !== 1) return false;
  const [only] = doc.content;
  return only?.type === "paragraph" && (only.content ?? []).length === 0;
}

// Whether the form's value of a field is a value to keep, or nothing.
export function given(field: Field, value: unknown): boolean {
  if (value === undefined || value === null) return false;
  switch (field.type) {
    case "text":
    case "paragraph":
    case "date":
    case "choice":
      return value !== "";
    case "richText":
      return !emptyRichText(value as RichTextDoc);
    case "link": {
      const link = value as LinkValue;
      return link.label !== "" || link.href !== "";
    }
    default:
      return true;
  }
}

// The values the form starts from: each field's value read back, if it is
// of the field's shape; a toggle off when it has none. `left` names what
// the entry holds that no field takes, in the order it holds them.
export function formValues(fields: readonly Field[], stored: EntryValues | null): { values: FormValues; left: string[] } {
  const values: Record<string, unknown> = {};
  for (const field of fields) {
    const value = stored?.[field.key];
    if (value !== undefined && fits(field, value)) values[field.key] = value;
    else if (field.type === "toggle") values[field.key] = false;
  }
  const left = Object.keys(stored ?? {}).filter((key) => {
    const field = fields.find((f) => f.key === key);
    return !field || !fits(field, stored?.[key]);
  });
  return { values, left };
}

// The values to save: the fields' own, in their order, without the ones
// left empty; nothing under a key no field has.
export function entryValues(fields: readonly Field[], values: FormValues): EntryValues {
  const out: Record<string, FieldValue> = {};
  for (const field of fields) {
    const value = values[field.key];
    if (given(field, value)) out[field.key] = value as FieldValue;
  }
  return out;
}

// What the form saves: the title and slug as typed, and the values.
export function entryContent(definition: Pick<CollectionDefinition, "fields">, title: string, slug: string, values: FormValues): EntryContent {
  return { title, slug, values: entryValues(definition.fields, values) };
}

// A number as the person writes it: digits, a point and at most two
// decimals, a minus before it; commas between thousands, as en-US writes
// them ("1,250.50"), but never a comma for the point, which would read
// "1,000" as one. Null for a text that is no such number.
export function typedAmount(text: string): number | null {
  const trimmed = text.trim();
  const grouped = /^[+-]?\d{1,3}(?:,\d{3})+(?:\.\d*)?$/.test(trimmed);
  const plain = grouped ? trimmed.replaceAll(",", "") : trimmed;
  const found = /^([+-]?)(\d*)(?:\.(\d*))?$/.exec(plain);
  if (!found || (found[2] === "" && (found[3] ?? "") === "")) return null;
  const decimals = (found[3] ?? "").replace(/0+$/, "");
  if (decimals.length > 2) return null;
  const value = Number(`${found[1]}${found[2] || "0"}.${decimals || "0"}`);
  return Number.isFinite(value) ? (Object.is(value, -0) ? 0 : value) : null;
}

// A number as its field shows it to be changed: as the page writes it.
export const amountText = (value: number): string => String(value);

// An image chosen in the library as an entry's value: the image and its
// alt text, or the mark that it is decorative.
export function imageValue(mediaId: string, text: { alt?: string; decorative?: boolean }): ImageValue {
  return text.decorative === true ? { mediaId, decorative: true } : { mediaId, alt: text.alt ?? "" };
}

// What an entry takes of a rich text, held while it is written, as a text
// block's is on the canvas (../rich/limits.ts): the text widget's own
// counts, from its schema (a rich text value is that widget's document),
// in the words the canvas says them in; null when the text fits.
export function richTextRefusal(doc: RichTextDoc): string | null {
  const checked = validateBlockSchema({ id: "text", type: "text", props: { doc }, children: [], style: { base: {} } });
  return checked.valid ? null : textLimitWords(refusal("invalid", "This text is not one an entry can keep.", checked.errors), doc);
}

// How many lists deep a list item of an entry's rich text may stand, a
// linked word in it still within the nesting every JSON value is held to:
// above the text's paragraphs stand the entry, its values, the text and
// its content (four, where a text block on a page has ten above them),
// then four levels for each list and six for a paragraph holding a link,
// as ../rich/text-session.ts counts them.
export const ENTRY_DEEPEST_LIST = Math.floor((MAX_NESTING - 4 - 6) / 4);
