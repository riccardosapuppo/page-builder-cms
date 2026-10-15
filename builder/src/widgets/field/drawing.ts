// What a Field block draws, read from its props and the entry its template
// is drawn with: which value (the entry's title, or a field's by its key)
// and how its type draws it. The twin of EntryField
// (cms/app/models/entry_field.rb), held to it by the render contract.
//
// A field draws as a widget does, and takes that widget's settings: a
// heading's (a text, or the title, given a level), a text's (a text
// without a level, a paragraph's lines, a rich text, a day, a toggle that
// is on, a choice's option, a number), an image's, a button's (a link).
// Nothing at all for a value the entry has not, or not of its field's
// type, and on a page with no entry: what is not a template's.
import { isObject } from "../../document/json.ts";
import type { ShownEntry } from "../../render/context.ts";
import { dayOf, dayWords, fieldOf, numberWords, valueOf } from "../../render/entry-words.ts";
import type { FieldType } from "../../shared/collection.ts";
import type { HeadingLevel } from "../../shared/document.ts";

// The widget a field draws as.
export type FieldShape = "heading" | "text" | "image" | "button";

// The key of the entry's own title, which no field of a collection takes.
export const TITLE = "title";

// A Field block's level, when it names one the schema lists.
export function fieldLevel(props: Readonly<Record<string, unknown>>): HeadingLevel | null {
  return Number.isInteger(props.level) && (props.level as number) >= 1 && (props.level as number) <= 4 ? (props.level as HeadingLevel) : null;
}

// What a type of field draws as: a text as a heading when the block names
// a level, an image as an image, a link as a button, every other type as a
// text.
export function fieldShape(type: FieldType | typeof TITLE, level: HeadingLevel | null): FieldShape {
  if (type === TITLE || type === "text") return level === null ? "text" : "heading";
  if (type === "image") return "image";
  if (type === "link") return "button";
  return "text";
}

// What is drawn, by the widget it draws as:
// - a heading of its level, its text;
// - a text: plain paragraphs, each a run of lines; a day, written in the
//   site's words; or a rich text, the text widget's document;
// - an image: the image block's props it takes (a library image, its alt
//   text or decorative);
// - a button: its words and its address, which the URL policy reads.
export type FieldDrawing =
  | { shape: "heading"; level: HeadingLevel; text: string }
  | { shape: "text"; paragraphs: readonly string[] }
  | { shape: "text"; day: string; words: string }
  | { shape: "text"; doc: unknown }
  | { shape: "image"; item: Record<string, unknown> }
  | { shape: "button"; label: string; href: unknown };

// What the block draws with the entry, or null for nothing.
export function fieldDrawing(props: Readonly<Record<string, unknown>>, entry: ShownEntry | null | undefined): FieldDrawing | null {
  if (!isObject(entry) || typeof props.field !== "string") return null;
  const level = fieldLevel(props);
  if (props.field === TITLE) return textDrawing(entry.title, level);
  const field = fieldOf(entry.fields, props.field);
  if (field === null) return null;
  const value = valueOf(entry.values, field.key);
  switch (field.type) {
    case "text":
      return textDrawing(value, level);
    case "paragraph":
      return typeof value === "string" ? lines(value) : null;
    case "choice":
      return typeof value === "string" && value !== "" ? { shape: "text", paragraphs: [value] } : null;
    case "richText":
      return isObject(value) && value.type === "doc" ? { shape: "text", doc: value } : null;
    case "date": {
      const day = dayOf(value);
      return day === null ? null : { shape: "text", day, words: dayWords(day) };
    }
    case "number": {
      const words = numberWords(value);
      return words === null ? null : { shape: "text", paragraphs: [words] };
    }
    case "toggle":
      return value === true && field.label !== "" ? { shape: "text", paragraphs: [field.label] } : null;
    case "image":
      if (!isObject(value) || typeof value.mediaId !== "string") return null;
      return { shape: "image", item: value.decorative === true ? { mediaId: value.mediaId, decorative: true } : { mediaId: value.mediaId, alt: typeof value.alt === "string" ? value.alt : "" } };
    case "link":
      return isObject(value) ? { shape: "button", label: typeof value.label === "string" ? value.label : "", href: value.href } : null;
  }
}

// A text, as a heading of the level the block names, or as a paragraph.
function textDrawing(value: unknown, level: HeadingLevel | null): FieldDrawing | null {
  if (typeof value !== "string" || value === "") return null;
  return level === null ? { shape: "text", paragraphs: [value] } : { shape: "heading", level, text: value };
}

// Plain text as paragraphs: one at each empty line, its other line breaks
// kept within it; nothing for a text of line breaks alone.
function lines(text: string): FieldDrawing | null {
  const paragraphs = text.split(/\n{2,}/).filter((paragraph) => paragraph !== "");
  return paragraphs.length === 0 ? null : { shape: "text", paragraphs };
}
