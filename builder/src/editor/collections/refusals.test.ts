// Refusals laid on the controls that hold them: an entry's at its title,
// its slug, each field (an image's alt text and a link's words and address
// at their own controls), and the rest; a definition's at its name, its
// prefix, each field by its place (key, label, an option, the bounds), the
// list and the order. The findings come as the editor's checks and the
// storage give them, pointers into what was sent.
import { expect, test } from "vitest";
import type { CollectionDefinition, Field } from "../../shared/collection.ts";
import { validateCollection, validateEntry } from "../../shared/validate.ts";
import { anyIssue, definitionIssues, entryIssues, issueCount } from "./refusals.ts";

const fields: Field[] = [
  { key: "summary", label: "Summary", type: "paragraph", required: true },
  { key: "hero", label: "Image", type: "image", required: false },
  { key: "more", label: "Read more", type: "link", required: false },
  { key: "temperature", label: "Water temperature", type: "number", required: false, min: 0, max: 30 },
];
const definition: CollectionDefinition = { name: "News", prefix: "news", fields, sort: { by: "updatedAt", direction: "desc" } };

test("an entry's refusals, found by the editor's checks, each at its control", () => {
  const checked = validateEntry(definition, {
    title: " ",
    slug: "Not A Slug",
    values: { hero: { mediaId: "m1", alt: "" }, more: { label: "Join", href: "javascript:alert(1)" }, temperature: 45, gone: "x" },
  });
  expect(checked.valid).toBe(false);
  if (checked.valid) return;
  const issues = entryIssues(fields, checked.errors);
  expect(issues.title).toEqual(["Write at least one visible character, on one line."]);
  expect(issues.slug).toEqual(["Lowercase letters, digits and hyphens."]);
  expect(issues.values.summary).toEqual(["Required. Write something here."]);
  expect(issues.values.temperature).toEqual(["At most 30."]);
  expect(issues.values["hero/alt"]).toEqual(["Write at least one visible character, on one line."]);
  expect(issues.values["more/href"]).toEqual(["Use a full address (https://…), a path on this site (/…), #anchor, mailto: or tel:."]);
  // A value no field takes is left out of the save, not said.
  expect(issues.other).toEqual([]);
  expect(issueCount(issues)).toBe(6);
});

test("the storage's refusals of an entry: a slug taken, an image gone, anything else above the form", () => {
  const issues = entryIssues(fields, [
    { pointer: "/slug", keyword: "taken", message: "is already the address of another entry" },
    { pointer: "/values/hero/mediaId", keyword: "mediaExists", message: "The media library has no item m9." },
    { pointer: "", keyword: "invalid", message: "The request is not valid." },
  ]);
  expect(issues.slug).toEqual(["Another entry of this collection has this address. Choose another."]);
  expect(issues.values.hero).toEqual(["The media library no longer has this image. Choose another."]);
  expect(issues.other).toEqual(["The request is not valid."]);
});

test("a definition's refusals, each at its control, by the field's place", () => {
  const checked = validateCollection({
    name: "",
    prefix: "News Items",
    fields: [
      { key: "date", label: "Date", type: "date", required: false },
      { key: "date", label: "Again", type: "number", required: false, min: 5, max: 1 },
      { key: "title", label: "Level", type: "choice", required: false, options: ["A", "A"] },
    ],
    sort: { by: "gone", direction: "desc" },
  });
  expect(checked.valid).toBe(false);
  if (checked.valid) return;
  const issues = definitionIssues(checked.errors);
  expect(issues.name).toEqual(["Write at least one visible character, on one line."]);
  expect(issues.prefix).toEqual(["Lowercase letters, digits and hyphens."]);
  expect(issues.fields[1]?.key).toEqual(["Another field has this key. Choose another."]);
  expect(issues.fields[1]?.bounds).toEqual(["The highest is below the lowest."]);
  expect(definitionIssues([{ pointer: "/fields/0/min", keyword: "decimals", message: "Two decimals at most." }]).fields[0]?.bounds).toEqual(["Lowest: two decimals at most."]);
  expect(issues.fields[2]?.key).toEqual(["Every entry has a title and a slug of its own: choose another key."]);
  expect(issues.fields[2]?.option[1]).toEqual(["This option is listed twice."]);
  expect(issues.sort).toEqual(["The order followed a field that is not there any more: choose another."]);
  expect(anyIssue(issues)).toBe(true);
  expect(anyIssue(definitionIssues([]))).toBe(false);
});
