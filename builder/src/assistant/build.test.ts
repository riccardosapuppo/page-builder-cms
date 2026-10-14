// A plan made into the page's blocks (./build.ts): each section goes into a
// real editor store with makeInsert, as the Assistant puts it in, so the
// page's schema and rules decide; and what a model may get wrong is shown
// left out or mended: headings out of order, links of its own invention,
// images the library does not have, words too long, forms twice.
import { expect, test } from "vitest";
import { makeInsert } from "../document/commands.ts";
import { idDraw } from "../document/ids.ts";
import { createEditorStore } from "../store/editor-store.ts";
import type { HeadingBlock, PageDocument, SectionBlock } from "../shared/document.ts";
import { line, PlanBuilder, type SiteFacts } from "./build.ts";

const FACTS: SiteFacts = {
  media: [{ id: "m-buoy", alt: "A red and white buoy" }, { id: "m-pier", alt: "The pier at dawn" }],
  paths: ["/", "/winter-series"],
  brief: "A page for our open day on 12 April. Questions to hello@slackwater.example or +44 1632 960 123, tickets at https://tickets.example.org/open-day.",
};

const empty = (): PageDocument => ({ schemaVersion: 1, title: "New page", sections: [] });

function counter(): () => string {
  let count = 0;
  return () => `n${++count}`;
}

// Puts each section of `sections` into a store, as the Assistant does, and
// gives back the page, the builder and what the store refused.
function fill(sections: unknown[], facts: SiteFacts = FACTS) {
  const store = createEditorStore({ document: empty(), now: () => 0 });
  const builder = new PlanBuilder(facts);
  const next = counter();
  const refused: string[] = [];
  for (const raw of sections) {
    const doc = store.getState().document;
    const section = builder.section(raw, idDraw(doc, next));
    if (!section) continue;
    const made = makeInsert(doc, section, { parentId: null, index: doc.sections.length });
    if (!made.ok) {
      refused.push(made.error.message);
      continue;
    }
    const outcome = store.getState().dispatch(made.command);
    if (!outcome.ok) refused.push(outcome.error.message);
  }
  return { doc: store.getState().document, builder, refused };
}

const column = (blocks: unknown[], align = "left") => ({ align, blocks });
const section = (label: string, columns: unknown[], more: Record<string, unknown> = {}) => ({ label, anchor: "", background: "none", widths: "equal", columns, ...more });
const headings = (doc: PageDocument) => doc.sections.flatMap((s) => s.children.flatMap((c) => c.children)).filter((b): b is HeadingBlock => b.type === "heading");

test("a whole plan goes in, section by section, and the store takes every block", () => {
  const { doc, builder, refused } = fill([
    section("Hero", [
      column([
        { kind: "heading", level: 1, text: "Open day at Slack Water", display: true },
        { kind: "text", paragraphs: ["Come and swim with us on 12 April.", "Bring a towel."] },
        { kind: "button", label: "Book a place", target: "#join" },
      ]),
      column([{ kind: "image", mediaId: "m-buoy", alt: "The club's buoy at slack water" }]),
    ], { widths: "3:2", background: "soft", anchor: "top" }),
    section("What to expect", [
      column([{ kind: "iconbox", icon: "clock", title: "Early start", text: "We meet at seven." }]),
      column([{ kind: "iconbox", icon: "cup", title: "Hot drinks", text: "Tea after the swim." }]),
      column([{ kind: "iconbox", icon: "pin", title: "The slipway", text: "By the harbour wall." }]),
    ]),
    section("Steps", [column([{ kind: "list", ordered: true, items: ["Book", "Arrive", "Swim"] }, { kind: "divider" }])]),
    section("Questions", [column([{ kind: "questions", items: [{ question: "Is it cold?", answer: "Yes, and then it is not." }] }])]),
    section("Voices", [column([{ kind: "quote", text: "Cold, then glad.", attribution: "A member" }], "center")]),
    section("Join", [column([
      { kind: "heading", level: 2, text: "Book your place", display: false },
      { kind: "form", fields: [{ type: "text", label: "Your name", required: true }, { type: "email", label: "Email", required: true }, { type: "longtext", label: "Anything we should know?", required: false }, { type: "checkbox", label: "I can swim 200 metres", required: true }], submitLabel: "Book", confirmation: "See you on the slipway." },
    ])], { anchor: "join", background: "muted" }),
  ]);
  expect(refused).toEqual([]);
  expect(builder.notes).toEqual([]);
  expect(doc.sections.map((s) => s.props.label)).toEqual(["Hero", "What to expect", "Steps", "Questions", "Voices", "Join"]);
  const hero = doc.sections[0]!;
  expect(hero.props).toEqual({ label: "Hero", anchor: "top", columnWidths: "3:2" });
  expect(hero.style.base).toEqual({ background: "soft" });
  expect(headings(doc).map((h) => [h.props.level, h.style.base])).toEqual([[1, { textSize: "display" }], [2, {}]]);
  expect(builder.unmet(doc)).toEqual([]);
  const form = doc.sections[5]!.children[0]!.children[1]!;
  expect(form.props).toMatchObject({ items: [
    { name: "your-name", kind: "text", maxLength: 300, required: true },
    { name: "email", kind: "email", required: true },
    { name: "anything-we-should-know", kind: "textarea", maxLength: 2000, required: false },
    { name: "i-can-swim-200-metres", kind: "checkbox", required: true },
  ] });
});

test("headings keep the page's order: one level 1, the first; none skipped below the one before", () => {
  const { doc } = fill([
    section("A", [column([{ kind: "heading", level: 2, text: "First", display: true }, { kind: "heading", level: 4, text: "Too deep", display: false }])]),
    section("B", [column([{ kind: "heading", level: 1, text: "Another first", display: true }, { kind: "heading", level: 3, text: "Fine", display: false }])]),
  ]);
  expect(headings(doc).map((h) => [h.props.text, h.props.level, h.style.base])).toEqual([
    ["First", 1, { textSize: "display" }], ["Too deep", 2, {}], ["Another first", 2, {}], ["Fine", 3, {}],
  ]);
});

test("a button leads where it may: this plan's sections, the site's pages, the brief's own addresses; never one made up", () => {
  const { doc, builder } = fill([section("Links", [column([
    { kind: "button", label: "Series", target: "/winter-series/" },
    { kind: "button", label: "Tickets", target: "https://tickets.example.org/open-day" },
    { kind: "button", label: "Write", target: "mailto:hello@slackwater.example" },
    { kind: "button", label: "Call", target: "tel:+441632960123" },
    { kind: "button", label: "Invented", target: "https://slackwater.example/book" },
    { kind: "button", label: "Invented call", target: "tel:+441632000000" },
    { kind: "button", label: "No page", target: "/prices" },
    { kind: "button", label: "Later", target: "#prices" },
    { kind: "button", label: "Bad", target: "#Not An Anchor" },
  ])])]);
  const buttons = doc.sections[0]!.children[0]!.children.map((b) => b.props);
  expect(buttons).toEqual([
    { label: "Series", href: "/winter-series" },
    { label: "Tickets", href: "https://tickets.example.org/open-day" },
    { label: "Write", href: "mailto:hello@slackwater.example" },
    { label: "Call", href: "tel:+441632960123" },
    { label: "Later", href: "#prices" },
  ]);
  expect(builder.notes).toEqual([
    "Left out the button “Invented”: it would lead to an address the brief does not give.",
    "Left out the button “Invented call”: it would lead to an address the brief does not give.",
    "Left out the button “No page”: it would lead to an address the brief does not give.",
    "Left out the button “Bad”: it would lead to an address the brief does not give.",
  ]);
  // The section #prices never came: its button is said at the end.
  expect(builder.unmet(doc)).toEqual([{ id: doc.sections[0]!.children[0]!.children[4]!.id, label: "Later" }]);
});

test("images come from the library only; an empty alt text means the image only decorates", () => {
  const { doc, builder } = fill([section("Pictures", [column([
    { kind: "image", mediaId: "m-pier", alt: "The pier at dawn, the tide out" },
    { kind: "image", mediaId: "m-pier", alt: "" },
    { kind: "image", mediaId: "made-up", alt: "Something" },
  ])])]);
  expect(doc.sections[0]!.children[0]!.children.map((b) => b.props)).toEqual([
    { mediaId: "m-pier", alt: "The pier at dawn, the tide out" },
    { mediaId: "m-pier", decorative: true },
  ]);
  expect(builder.notes).toEqual(["Left out an image that is not in the site's library."]);
});

test("words lose control characters and are cut at a word with an ellipsis; nothing visible is no text", () => {
  expect(line("  Swim\u0007 at\n\tdawn  ", 120)).toBe("Swim at dawn");
  expect(line("one two three four five six", 16)).toBe("one two three…");
  expect(line("\u200b\u00a0 ", 40)).toBe("");
  const { doc, builder } = fill([section("Words", [column([
    { kind: "heading", level: 1, text: "\u200b", display: false },
    { kind: "text", paragraphs: ["", "Kept."] },
  ])])]);
  expect(doc.sections[0]!.children[0]!.children.map((b) => b.type)).toEqual(["text"]);
  expect(builder.notes).toEqual(["Left out a heading with no words."]);
});

test("a page takes one form; fields get names from their labels, each its own", () => {
  const field = (label: string) => ({ type: "text", label, required: false });
  const { doc, builder } = fill([section("Forms", [column([
    { kind: "form", fields: [field("Name"), field("Name"), field("123"), field("Ünïcode ok")], submitLabel: "", confirmation: "" },
    { kind: "form", fields: [field("Again")], submitLabel: "Send", confirmation: "Thanks." },
  ])])]);
  const form = doc.sections[0]!.children[0]!.children;
  expect(form).toHaveLength(1);
  expect(form[0]!.props).toMatchObject({
    items: [{ name: "name" }, { name: "name-2" }, { name: "field" }, { name: "unicode-ok" }],
    submitLabel: "Send",
    confirmation: "Thank you: your answer is kept.",
  });
  expect(builder.notes).toEqual(["Left out a second form: a page takes one."]);
});

test("columns: empty ones go, four at most, and widths only where they fit the count", () => {
  const words = (text: string) => ({ kind: "text", paragraphs: [text] });
  const { doc, builder } = fill([
    section("Gaps", [column([words("a")]), column([]), column([words("b")])], { widths: "1:2:1" }),
    section("Many", [1, 2, 3, 4, 5].map((n) => column([words(String(n))])), { widths: "2:1" }),
    section("Nothing", [column([]), column([{ kind: "image", mediaId: "nope", alt: "" }])]),
  ]);
  const shapes = doc.sections.map((s: SectionBlock) => [s.props.label, s.children.length, s.props.columnWidths]);
  expect(shapes).toEqual([["Gaps", 2, undefined], ["Many", 4, undefined]]);
  expect(builder.notes).toEqual([
    "Kept the first 4 columns of the section “Many”: a section has at most 4.",
    "Left out an image that is not in the site's library.",
    "Left out the section “Nothing”: nothing in it could be kept.",
  ]);
});

test("a section's background is never the colour of its keys: a form on primary, a button on accent, take soft", () => {
  const { doc, builder } = fill([
    section("Book", [column([{ kind: "form", fields: [{ type: "email", label: "Email", required: true }], submitLabel: "Book", confirmation: "Thanks." }])], { background: "primary" }),
    section("Go", [column([{ kind: "button", label: "Go", target: "/" }])], { background: "accent" }),
    section("Fine", [column([{ kind: "button", label: "Go", target: "/" }])], { background: "primary" }),
  ]);
  expect(doc.sections.map((s) => s.style.base.background)).toEqual(["soft", "soft", "primary"]);
  expect(builder.notes).toEqual([
    "Gave the section “Book” the soft background: its form's send key would not show on the primary one.",
    "Gave the section “Go” the soft background: its buttons would not show on the accent one.",
  ]);
});

test("anchors: written as the schema wants, each once", () => {
  const words = { kind: "text", paragraphs: ["x"] };
  const { doc } = fill([
    section("One", [column([words])], { anchor: "Our Prices!" }),
    section("Two", [column([words])], { anchor: "our-prices" }),
    section("Three", [column([words])], { anchor: "9lives" }),
  ]);
  expect(doc.sections.map((s) => s.props.anchor)).toEqual(["our-prices", undefined, "lives"]);
});

test("what is not a plan's section is left out and said", () => {
  const { doc, builder } = fill([null, { label: "No columns", columns: [] }, "text"]);
  expect(doc.sections).toEqual([]);
  expect(builder.notes).toEqual([
    "Left out a section that was not written as a plan's section.",
    "Left out a section that was not written as a plan's section.",
    "Left out a section that was not written as a plan's section.",
  ]);
});

test("the plan's head: a title and a description cut to the page's lengths, or nothing", () => {
  const builder = new PlanBuilder(FACTS);
  expect(builder.title("Open day")).toBe("Open day");
  expect(builder.title("  ")).toBeNull();
  expect(builder.title(7)).toBeNull();
  expect([...(builder.description("word ".repeat(60)) ?? "")].length).toBeLessThanOrEqual(160);
});
