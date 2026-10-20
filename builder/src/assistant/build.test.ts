// A plan made into the page's blocks (./build.ts): each section goes into a
// real editor store with makeInsert, as the Assistant puts it in, so the
// page's schema and rules decide; and what a model may get wrong is shown
// left out or mended: headings out of order, links of its own invention,
// images the library does not have, words too long, forms twice, more
// figures, steps, plans or features than a widget takes, or too few.
import { expect, test } from "vitest";
import { makeInsert } from "../document/commands.ts";
import { idDraw } from "../document/ids.ts";
import { createEditorStore } from "../store/editor-store.ts";
import type { HeadingBlock, PageDocument, PricingPlan, SectionBlock, StatsItem, StepsItem, WidgetBlock } from "../shared/document.ts";
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
// A plan of a pricing block as a model writes it, and a block's own lists.
const offer = (name: string, more: Record<string, unknown> = {}) => ({ name, price: "€5", period: "", text: "", features: [], buttonLabel: "Book", buttonTarget: "/", featured: false, badge: "", ...more });
const figuresOf = (block: WidgetBlock | undefined) => (block!.props as { items: StatsItem[] }).items;
const stepsOf = (block: WidgetBlock | undefined) => (block!.props as { items: StepsItem[] }).items;
const plansOf = (block: WidgetBlock | undefined) => (block!.props as { plans: PricingPlan[] }).plans;

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

test("a section's background is never the colour of its keys: a form on primary, a button or a plan's on accent, take soft", () => {
  const { doc, builder } = fill([
    section("Book", [column([{ kind: "form", fields: [{ type: "email", label: "Email", required: true }], submitLabel: "Book", confirmation: "Thanks." }])], { background: "primary" }),
    section("Go", [column([{ kind: "button", label: "Go", target: "/" }])], { background: "accent" }),
    section("Fine", [column([{ kind: "button", label: "Go", target: "/" }])], { background: "primary" }),
    section("Plans", [column([{ kind: "pricing", plans: [offer("Plus")] }])], { background: "accent" }),
    section("Plans too", [column([{ kind: "pricing", plans: [offer("Plus")] }])], { background: "primary" }),
  ]);
  expect(doc.sections.map((s) => s.style.base.background)).toEqual(["soft", "soft", "primary", "soft", "primary"]);
  expect(builder.notes).toEqual([
    "Gave the section “Book” the soft background: its form's send key would not show on the primary one.",
    "Gave the section “Go” the soft background: its buttons would not show on the accent one.",
    "Gave the section “Plans” the soft background: its plans' buttons would not show on the accent one.",
  ]);
});

test("stats, steps and pricing go in as their blocks, and the store takes each", () => {
  const { doc, builder, refused } = fill([
    section("Numbers", [column([
      { kind: "heading", level: 1, text: "The club in numbers", display: true },
      { kind: "stats", figures: [{ value: "120", label: "Members" }, { value: "1987", label: "Swimming since" }] },
    ])]),
    section("How to join", [column([{ kind: "steps", steps: [{ title: "Come along", text: "Any Saturday at eight." }, { title: "Swim with a coach", text: "Close to the shore,\nat your pace." }] }])]),
    section("Membership", [column([{ kind: "pricing", plans: [
      offer("Swimmer", { price: "€20", period: "a month", features: ["Two swims a week", "A coach on Saturdays"], buttonLabel: "Join", buttonTarget: "#join" }),
      offer("Family", { price: "€45", text: "Two adults and their children.", buttonLabel: "Join as a family", buttonTarget: "/winter-series", featured: true, badge: "For families" }),
    ] }])]),
    section("Join", [column([{ kind: "text", paragraphs: ["Write to hello@slackwater.example."] }])], { anchor: "join" }),
  ]);
  expect(refused).toEqual([]);
  expect(builder.notes).toEqual([]);
  const last = doc.sections.map((s) => s.children[0]!.children.at(-1));
  expect(last.map((block) => block?.type)).toEqual(["stats", "steps", "pricing", "text"]);
  expect(figuresOf(last[0])).toEqual([{ value: "120", label: "Members" }, { value: "1987", label: "Swimming since" }]);
  expect(stepsOf(last[1])).toEqual([{ title: "Come along", text: "Any Saturday at eight." }, { title: "Swim with a coach", text: "Close to the shore, at your pace." }]);
  expect(plansOf(last[2])).toEqual([
    { name: "Swimmer", price: "€20", period: "a month", text: "", features: ["Two swims a week", "A coach on Saturdays"], button: { label: "Join", href: "#join" }, featured: false, badge: "" },
    { name: "Family", price: "€45", period: "", text: "Two adults and their children.", features: [], button: { label: "Join as a family", href: "/winter-series" }, featured: true, badge: "For families" },
  ]);
  expect(builder.unmet(doc)).toEqual([]);
});

test("their counts are held: the first 8 figures, 10 steps, 4 plans and 12 features a plan, said; with fewer than a widget takes, it goes, said", () => {
  const figure = (n: number) => ({ value: String(n), label: `Figure ${n}` });
  const step = (n: number) => ({ title: `Step ${n}`, text: `Then ${n}.` });
  const count = (n: number, word: string) => Array.from({ length: n }, (_, index) => `${word} ${index + 1}`);
  const { doc, builder, refused } = fill([section("Many", [column([
    // Kept: figures and steps with words, plans with a name and a price.
    { kind: "stats", figures: [{ value: "", label: "No value" }, ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map(figure)] },
    { kind: "steps", steps: [...[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(step), { title: "", text: "No title." }] },
    { kind: "pricing", plans: [offer(""), offer("A", { features: [...count(14, "Feature"), " "] }), offer("B"), offer("C", { price: " " }), offer("D"), offer("E"), offer("F")] },
    // Left out: too few.
    { kind: "stats", figures: [{ value: "12", label: "\u200b" }] },
    { kind: "steps", steps: [step(1), { title: "Two", text: "" }] },
    { kind: "pricing", plans: [offer("Free", { price: "" })] },
  ])])]);
  expect(refused).toEqual([]);
  const blocks = doc.sections[0]!.children[0]!.children;
  expect(blocks.map((block) => block.type)).toEqual(["stats", "steps", "pricing"]);
  expect(figuresOf(blocks[0])).toEqual([1, 2, 3, 4, 5, 6, 7, 8].map(figure));
  expect(stepsOf(blocks[1])).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(step));
  expect(plansOf(blocks[2]).map((plan) => [plan.name, plan.features.length])).toEqual([["A", 12], ["B", 0], ["D", 0], ["E", 0]]);
  expect(plansOf(blocks[2])[0]!.features).toEqual(count(12, "Feature"));
  expect(builder.notes).toEqual([
    "Kept the first 8 figures: a stats block has at most 8.",
    "Kept the first 10 steps: a steps block has at most 10.",
    "Kept the first 4 plans: a pricing block has at most 4.",
    "Kept the first 12 features of the plan “A”: a plan has at most 12.",
    "Left out a stats block with no figures.",
    "Left out a steps block with fewer than two steps.",
    "Left out a pricing block with no plans.",
  ]);
});

test("their words are cut at a word to the page's lengths; a plan's period, text and badge may be empty, and a button with no words takes the plan's", () => {
  const long = (words: number) => "word ".repeat(words);
  const { doc, builder, refused } = fill([section("Long", [column([
    { kind: "stats", figures: [{ value: "1,000,000 swims and counting", label: long(30) }] },
    { kind: "steps", steps: [{ title: long(40), text: long(300) }, { title: "Two", text: "Then this." }] },
    { kind: "pricing", plans: [
      offer(long(30), { price: "€ 1 000 000 000 000 000 000", period: long(20), text: long(100), features: [long(40)], buttonLabel: long(30), buttonTarget: "/", featured: true, badge: long(10) }),
      offer("Plain", { price: "Free", period: " ", text: "\n", buttonLabel: "", buttonTarget: "/", badge: "\u00a0" }),
    ] },
  ])])]);
  expect(refused).toEqual([]);
  expect(builder.notes).toEqual([]);
  const [stats, steps, pricing] = doc.sections[0]!.children[0]!.children;
  const within = (text: string, max: number) => [...text].length <= max && text.endsWith("…");
  const [figure] = figuresOf(stats);
  expect(figure!.value).toBe("1,000,000 swims and…");
  expect(within(figure!.label, 80)).toBe(true);
  const [first] = stepsOf(steps);
  expect([within(first!.title, 120), within(first!.text, 1000)]).toEqual([true, true]);
  const [long30, plain] = plansOf(pricing);
  expect([
    within(long30!.name, 80), within(long30!.price, 24), within(long30!.period, 40), within(long30!.text, 400),
    within(long30!.features[0]!, 120), within(long30!.button.label, 80), within(long30!.badge, 30),
  ]).toEqual([true, true, true, true, true, true, true]);
  expect(plain).toEqual({ name: "Plain", price: "Free", period: "", text: "", features: [], button: { label: "Choose Plain", href: "/" }, featured: false, badge: "" });
});

test("a plan's button leads where a button may; elsewhere it keeps its words and leads to the top of the page, said; a section it names that never comes is said with its plan", () => {
  const to = (name: string, target: string) => offer(name, { buttonLabel: "Book", buttonTarget: target });
  const { doc, builder } = fill([section("Plans", [column([
    { kind: "pricing", plans: [to("Series", "/winter-series/"), to("Tickets", "https://tickets.example.org/open-day"), to("Write", "mailto:hello@slackwater.example"), to("Call", "tel:+441632960123")] },
    { kind: "pricing", plans: [to("Invented", "https://slackwater.example/book"), to("No page", "/prices"), to("Later", "#prices"), to("Again", "#prices")] },
    { kind: "pricing", plans: [to("Nowhere", ""), to("Bad", "#Not An Anchor")] },
  ])])]);
  const [first, second, third] = doc.sections[0]!.children[0]!.children;
  expect(plansOf(first).map((plan) => plan.button.href)).toEqual(["/winter-series", "https://tickets.example.org/open-day", "mailto:hello@slackwater.example", "tel:+441632960123"]);
  expect(plansOf(second).map((plan) => plan.button)).toEqual([{ label: "Book", href: "#" }, { label: "Book", href: "#" }, { label: "Book", href: "#prices" }, { label: "Book", href: "#prices" }]);
  expect(plansOf(third).map((plan) => plan.button.href)).toEqual(["#", "#"]);
  expect(builder.notes).toEqual([
    "Left out the link of the button “Book” of the plan “Invented”: it would lead to an address the brief does not give.",
    "Left out the link of the button “Book” of the plan “No page”: it would lead to an address the brief does not give.",
    "Left out the link of the button “Book” of the plan “Nowhere”: it would lead to an address the brief does not give.",
    "Left out the link of the button “Book” of the plan “Bad”: it would lead to an address the brief does not give.",
  ]);
  // The section #prices never came: each plan whose button leads there, once.
  expect(builder.unmet(doc)).toEqual([
    { id: second!.id, label: "Book", plan: { index: 2, name: "Later" } },
    { id: second!.id, label: "Book", plan: { index: 3, name: "Again" } },
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

// A section's picture as a model writes it.
const picture = (mediaId: string, more: Record<string, unknown> = {}) => ({ source: "library", mediaId, veil: "dark", strength: "medium", focus: "center", ...more });
const words = { kind: "heading", level: 2, text: "Strength", display: false };

test("a section's picture is the library's, under the plan's veil; the theme's own strength and focus are not written; and the store takes it", () => {
  const { doc, builder, refused } = fill([
    section("Opening", [column([{ kind: "heading", level: 1, text: "Train with us", display: true }])], { background: "text", picture: picture("m-pier", { veil: "dark", strength: "strong", focus: "top-right" }) }),
    section("Middle", [column([words])], { picture: picture("m-buoy") }),
    section("Light", [column([words])], { picture: picture("m-pier", { veil: "light", focus: "bottom" }) }),
  ]);
  expect(refused).toEqual([]);
  expect(builder.notes).toEqual([]);
  const [opening, middle, light] = doc.sections as [SectionBlock, SectionBlock, SectionBlock];
  expect(opening.props).toEqual({ label: "Opening", picture: { mediaId: "m-pier" } });
  expect(opening.style).toEqual({ base: { background: "text", veil: "dark", veilStrength: "strong", focus: "top-right" } });
  expect(middle.style).toEqual({ base: { veil: "dark" } });
  expect(light.style).toEqual({ base: { veil: "light", focus: "bottom" } });
});

test("a picture the library has not, or a source the plan has not, is none; a picture's veil and focus not of the plan are its own", () => {
  const { doc, builder } = fill([
    section("Gone", [column([words])], { picture: picture("m-not-there") }),
    section("Made", [column([words])], { picture: { source: "made", prompt: "A gym at dawn", alt: "A gym" } }),
    section("Word", [column([words])], { picture: "m-pier" }),
    section("Odd", [column([words])], { picture: picture("m-pier", { veil: "none", strength: "light", focus: "20% 30%" }) }),
  ]);
  expect(doc.sections.map((s) => s.props.picture ?? null)).toEqual([null, null, null, { mediaId: "m-pier" }]);
  expect(doc.sections.map((s) => s.style.base)).toEqual([{}, {}, {}, { veil: "dark" }]);
  expect(builder.notes).toEqual(["Left out the picture of the section “Gone”: it is not in the site's library."]);
});

test("the words over a picture read through its veil, as the panel measures them: a veil too weak is made strong, and one that cannot be is made dark, said", () => {
  // The theme's ink as the text veil: 3.8 to 1 at medium, 7.9 strong.
  const { doc, builder } = fill([section("Ink", [column([words])], { picture: picture("m-pier", { veil: "text" }) })]);
  expect(doc.sections[0]!.style.base).toEqual({ veil: "text", veilStrength: "strong" });
  expect(builder.notes).toEqual(["Made the veil over the picture of the section “Ink” strong: its words would not read through a medium one."]);
  // A site whose text is a pale grey: its text colour's veil reads at no strength.
  const pale = fill([section("Pale", [column([words])], { picture: picture("m-pier", { veil: "text" }) })], { ...FACTS, ink: { text: "#bbbbbb", background: "#ffffff" } });
  expect(pale.doc.sections[0]!.style.base).toEqual({ veil: "dark", veilStrength: "strong" });
  expect(pale.builder.notes).toEqual(["Made the veil over the picture of the section “Pale” dark and strong: its words would not read through the text colour's one."]);
});

test("a section comes into view by its plan's motion, none written as nothing; a plan with neither picture nor motion builds as it did", () => {
  const { doc } = fill([
    section("Rises", [column([words])], { motion: "rise" }),
    section("Still", [column([words])], { motion: "none" }),
    section("Spins", [column([words])], { motion: "spin" }),
    section("Old", [column([words])]),
  ]);
  expect(doc.sections.map((s) => s.style.base)).toEqual([{ motion: "rise" }, {}, {}, {}]);
});

test("a heading's section and the points it announces share one band: the points' section takes no space above, and only there", () => {
  const point = (title: string) => column([{ kind: "iconbox", icon: "timer", title, text: "One sentence." }]);
  const announce = (label: string, more: Record<string, unknown> = {}) => section(label, [column([{ kind: "heading", level: 2, text: label, display: false }, { kind: "text", paragraphs: ["Three reasons."] }], "center")], more);
  const { doc, refused } = fill([
    announce("Why"),
    section("Points", [point("One"), point("Two"), point("Three")]),
    // Another band after them, then points on another background than the heading's.
    section("More points", [point("Four"), point("Five")], { background: "soft" }),
    announce("Soft heading", { background: "soft" }),
    section("Unlike", [point("Six"), point("Seven")], { background: "muted" }),
    // A picture behind either, and a section of one column, keep their space.
    announce("Pictured", { picture: picture("m-pier") }),
    section("After a picture", [point("Eight"), point("Nine")]),
    announce("Plain"),
    section("One column", [point("Ten")]),
  ]);
  expect(refused).toEqual([]);
  expect(doc.sections.map((s) => [s.props.label, s.style.base.spaceAbove ?? null])).toEqual([
    ["Why", null], ["Points", "none"], ["More points", null], ["Soft heading", null], ["Unlike", null],
    ["Pictured", null], ["After a picture", null], ["Plain", null], ["One column", null],
  ]);
});

test("an icon box takes any icon of the site's set, Lucide's forty among them, and an icon it has not is the i", () => {
  const { doc } = fill([section("Points", [
    column([{ kind: "iconbox", icon: "dumbbell", title: "Strength", text: "Free weights." }]),
    column([{ kind: "iconbox", icon: "heart-pulse", title: "Cardio", text: "Rowers and bikes." }]),
    column([{ kind: "iconbox", icon: "kettlebell", title: "Classes", text: "Every day." }]),
  ])]);
  expect(doc.sections[0]!.children.map((c) => (c.children[0]!.props as { icon: string }).icon)).toEqual(["dumbbell", "heart-pulse", "info"]);
});

test("the plan's head: a title and a description cut to the page's lengths, or nothing", () => {
  const builder = new PlanBuilder(FACTS);
  expect(builder.title("Open day")).toBe("Open day");
  expect(builder.title("  ")).toBeNull();
  expect(builder.title(7)).toBeNull();
  expect([...(builder.description("word ".repeat(60)) ?? "")].length).toBeLessThanOrEqual(160);
});
