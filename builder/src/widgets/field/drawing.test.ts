// What a Field block draws (./drawing.ts), the twin of EntryField
// (cms/app/models/entry_field.rb), which the render contract holds to it
// on the fixtures; here, its rules one by one: what each type draws as,
// the value it draws, and when it draws nothing.
import { expect, test } from "vitest";
import type { ShownEntry } from "../../render/context.ts";
import { fieldDrawing, fieldShape } from "./drawing.ts";

const entry: ShownEntry = {
  fields: [
    { key: "place", label: "Place", type: "text" },
    { key: "summary", label: "Summary", type: "paragraph" },
    { key: "body", label: "Body", type: "richText" },
    { key: "places", label: "Places", type: "number" },
    { key: "day", label: "Day", type: "date" },
    { key: "picture", label: "Picture", type: "image" },
    { key: "booking", label: "Book", type: "link" },
    { key: "members-only", label: "Members only", type: "toggle" },
    { key: "level", label: "Level", type: "choice" },
  ],
  title: "Dawn swims",
  slug: "dawn-swims",
  values: {
    place: "The slipway",
    summary: "Twice a week,\nat first light.\n\n\nBring a cap.",
    body: { type: "doc", content: [{ type: "paragraph" }] },
    places: 1250.5,
    day: "2026-10-15",
    picture: { mediaId: "dawn", decorative: true, alt: "kept out" },
    booking: { label: "Book a place", href: "/join" },
    "members-only": true,
    level: "Strong",
  },
};
const draws = (props: Record<string, unknown>, shown: ShownEntry | null = entry) => fieldDrawing(props, shown);

test("a text and the title draw as a heading given a level, as a paragraph without one; an image, a link and every other type as their widgets", () => {
  expect([fieldShape("title", 1), fieldShape("text", null), fieldShape("paragraph", 2), fieldShape("image", 1), fieldShape("link", null), fieldShape("toggle", 3)])
    .toEqual(["heading", "text", "text", "image", "button", "text"]);
});

test("each type draws its value as its widget draws it", () => {
  expect(draws({ field: "title", level: 1 })).toEqual({ shape: "heading", level: 1, text: "Dawn swims" });
  expect(draws({ field: "title", level: 7 })).toEqual({ shape: "text", paragraphs: ["Dawn swims"] });
  expect(draws({ field: "place", level: 3 })).toEqual({ shape: "heading", level: 3, text: "The slipway" });
  expect(draws({ field: "summary", level: 2 })).toEqual({ shape: "text", paragraphs: ["Twice a week,\nat first light.", "Bring a cap."] });
  expect(draws({ field: "body" })).toEqual({ shape: "text", doc: { type: "doc", content: [{ type: "paragraph" }] } });
  expect(draws({ field: "places" })).toEqual({ shape: "text", paragraphs: ["1,250.5"] });
  expect(draws({ field: "day" })).toEqual({ shape: "text", day: "2026-10-15", words: "Oct 15, 2026" });
  expect(draws({ field: "picture" })).toEqual({ shape: "image", item: { mediaId: "dawn", decorative: true } });
  expect(draws({ field: "booking" })).toEqual({ shape: "button", label: "Book a place", href: "/join" });
  expect(draws({ field: "members-only" })).toEqual({ shape: "text", paragraphs: ["Members only"] });
  expect(draws({ field: "level" })).toEqual({ shape: "text", paragraphs: ["Strong"] });
});

test("nothing for a value the entry has not, one of another type, a key no field has, a key that is no text, and with no entry", () => {
  const odd: ShownEntry = { ...entry, title: "", values: { place: 42, summary: "\n\n", day: "2026-02-30", places: 0.125, picture: "dawn", booking: "Book", "members-only": false, level: "" } };
  for (const field of ["title", "place", "summary", "day", "places", "picture", "booking", "members-only", "level", "body"]) expect(draws({ field }, odd), field).toBeNull();
  expect([draws({ field: "gone" }), draws({ field: 3 }), draws({ field: "title" }, null)]).toEqual([null, null, null]);
});
