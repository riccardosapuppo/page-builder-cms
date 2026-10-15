// An entry's values as its form holds them: read by their fields, never by
// the keys found (a field deleted since, a key given to a field of another
// type), so a save leaves out what no field takes; empty ones left out; a
// number written as a person writes it; and what an entry takes of a rich
// text, held while it is written.
import { expect, test } from "vitest";
import type { Field } from "../../shared/collection.ts";
import { validateEntry } from "../../shared/validate.ts";
import { emptyRichText, ENTRY_DEEPEST_LIST, entryValues, formValues, richTextRefusal, typedAmount } from "./values.ts";

const fields: Field[] = [
  { key: "summary", label: "Summary", type: "paragraph", required: false },
  { key: "date", label: "Date", type: "date", required: false },
  { key: "members", label: "Members only", type: "toggle", required: true },
  { key: "more", label: "Read more", type: "link", required: false },
];

test("the form reads each value by its field: a value no field takes is left out and named, a toggle with none is off", () => {
  const stored = { summary: "Cold water", date: 20261015, gone: "an old field's", more: { label: "Join", href: "/join" } };
  const { values, left } = formValues(fields, stored as never);
  expect(values).toEqual({ summary: "Cold water", members: false, more: { label: "Join", href: "/join" } });
  expect(left).toEqual(["date", "gone"]);
  // What it saves is what its fields take, and the collection's rules take it.
  const saved = entryValues(fields, values);
  expect(saved).toEqual({ summary: "Cold water", members: false, more: { label: "Join", href: "/join" } });
  const definition = { name: "News", prefix: "news", fields, sort: { by: "updatedAt", direction: "desc" as const } };
  expect(validateEntry(definition, { title: "A", slug: "a", values: saved }).valid).toBe(true);
  // Planted: the stored values saved as they were found are refused.
  expect(validateEntry(definition, { title: "A", slug: "a", values: stored }).valid).toBe(false);
});

test("an empty value is none; a link half written is kept, for the check to say which half is missing", () => {
  const values = { summary: "", date: "", members: true, more: { label: "Join", href: "" } };
  expect(entryValues(fields, values)).toEqual({ members: true, more: { label: "Join", href: "" } });
  expect(entryValues(fields, { more: { label: "", href: "" } })).toEqual({});
  expect(emptyRichText({ type: "doc", content: [{ type: "paragraph" }] })).toBe(true);
  expect(emptyRichText({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "A" }] }] })).toBe(false);
});

test("a number as a person writes it: a point and two decimals at most, commas between thousands, never a comma for the point", () => {
  expect(["12", "-3", "14.5", "1250.50", "1,250.50", "1,000", "+7", ".5", "-0"].map(typedAmount)).toEqual([12, -3, 14.5, 1250.5, 1250.5, 1000, 7, 0.5, 0]);
  expect(["", "abc", "1,5", "12.345", "1 000", "12,34,567", "1e3", "--1"].map(typedAmount)).toEqual([null, null, null, null, null, null, null, null]);
});

test("a rich text an entry cannot keep is refused while it is written, in the canvas's words", () => {
  const paragraph = { type: "paragraph" as const, content: [{ type: "text" as const, text: "A" }] };
  expect(richTextRefusal({ type: "doc", content: [paragraph] })).toBeNull();
  expect(richTextRefusal({ type: "doc", content: Array.from({ length: 501 }, () => paragraph) })).toBe("a text holds at most 500 paragraphs and lists");
  expect(ENTRY_DEEPEST_LIST).toBe(13);
});
