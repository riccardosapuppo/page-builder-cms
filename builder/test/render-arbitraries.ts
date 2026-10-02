// Random page documents for the rule-9 check (render-agreement.rails.test.ts):
// valid by the schema, and chosen to be hard on two renderers that must
// agree. The text holds markup, entities, quotes, line breaks, runs of
// spaces, invisible characters, emoji, combining marks and right-to-left
// script; the addresses use every form and character the schema allows;
// the map's numbers fall on and near the points where a sixth decimal is
// half way; every style key of a type takes every token on every device;
// rich text nests lists, repeats marks, and puts marks on line breaks. The
// widgets the panel makes (../src/widgets) are among them.
//
// Each document is validated before it is used, so a generator that drifts
// from the schema fails loudly instead of testing less.
import fc from "fast-check";
import {
  ALIGN_TOKENS, ASPECT_TOKENS, BACKGROUND_TOKENS, COLUMN_WIDTHS_BY_COUNT, DEVICES, ICON_NAMES, PALETTE_SLOTS, SCHEMA_VERSION,
  SECTION_SPACE_TOKENS, SPACE_TOKENS, STYLE_KEYS_BY_TYPE, TYPE_STEPS, VERTICAL_ALIGN_TOKENS, VISIBILITY_TOKENS, WIDGET_TYPES,
  type BlockType, type StyleTokens, type WidgetType,
} from "../src/shared/document.ts";
import { validateDocument } from "../src/shared/validate.ts";

type AnyObject = Record<string, unknown>;

// The tokens each style key takes.
const TOKENS: Readonly<Record<keyof StyleTokens, readonly string[]>> = {
  spaceInside: SPACE_TOKENS,
  spaceBetween: SPACE_TOKENS,
  spaceAbove: SECTION_SPACE_TOKENS,
  spaceBelow: SECTION_SPACE_TOKENS,
  aspect: ASPECT_TOKENS,
  background: BACKGROUND_TOKENS,
  color: PALETTE_SLOTS,
  textSize: TYPE_STEPS,
  align: ALIGN_TOKENS,
  verticalAlign: VERTICAL_ALIGN_TOKENS,
  visibility: VISIBILITY_TOKENS,
};

function compact<T extends AnyObject>(object: T): T {
  return Object.fromEntries(Object.entries(object).filter(([, v]) => v !== undefined)) as T;
}

// ---------------------------------------------------------------- text

// Pieces of text a line is made of. None is a control character; the
// schema refuses those, and a paragraph adds the line feed it allows. The
// invisible ones are named by code point: a no-break space, a zero-width
// space, a soft hyphen, a byte order mark, a thin space, a combining acute
// accent after an e, and the joiners of a family emoji.
const char = (...points: number[]) => String.fromCodePoint(...points);
const PIECES = [
  "Swim", "slack water", "Caf" + char(0xe9), " ", "  ", "   ", "<script>alert(1)</script>", "<b>", "</p>", "&amp;", "&copy", "&#39;", "&",
  "\"", "'", "`", "=", "/", "\\", "<!--", "]]>", "{{x}}", "%20", char(0x65e5, 0x672c, 0x8a9e), char(0x1f389),
  char(0x1f469, 0x200d, 0x1f469, 0x200d, 0x1f467), char(0x5e9, 0x5dc, 0x5d5, 0x5dd), "e" + char(0x301), char(0xa0),
  char(0x200b), char(0xad), char(0xfeff), char(0x2009), char(0x3a9), char(0xfb01), "x".repeat(40),
];
// The schema's test for a visible character, in its line and paragraph
// rules: anything but these spaces and invisible characters.
const INVISIBLE: ReadonlyArray<readonly [number, number]> = [
  [0x09, 0x0d], [0x20, 0x20], [0x85, 0x85], [0xa0, 0xa0], [0xad, 0xad], [0x1680, 0x1680], [0x180e, 0x180e], [0x2000, 0x200f],
  [0x2028, 0x2029], [0x202f, 0x202f], [0x205f, 0x2060], [0x3000, 0x3000], [0xfeff, 0xfeff],
];
const visible = (text: string) => [...text].some((c) => !INVISIBLE.some(([from, to]) => c.codePointAt(0)! >= from && c.codePointAt(0)! <= to));

// The pieces joined, cut to the field's length in code points (never in the
// middle of one), with a visible character added when there is none. Made
// to fit rather than filtered: a filter that refuses most of what it is
// given made the pages several times slower to generate.
function fit(pieces: readonly string[], max: number): string {
  const text = [...pieces.join("")].slice(0, max - 1).join("");
  return visible(text) ? text : `${text}x`;
}

export function line(max: number): fc.Arbitrary<string> {
  return fc.array(fc.constantFrom(...PIECES), { minLength: 1, maxLength: 5 }).map((pieces) => fit(pieces, max));
}

function paragraph(max: number): fc.Arbitrary<string> {
  return fc.array(fc.oneof({ weight: 4, arbitrary: fc.constantFrom(...PIECES) }, { weight: 1, arbitrary: fc.constantFrom("\n", "\n\n") }), { minLength: 1, maxLength: 7 })
    .map((pieces) => fit(pieces, max));
}

// ------------------------------------------------------------ addresses

const host = fc.constantFrom("example.com", "swims.example.org", "a.b-c.example", "EXAMPLE.com", "x1.example:8080", "localhost");
// The characters of a path, query or fragment, as the schema lists them.
const urlChars = fc.array(fc.constantFrom(..."abzAZ09._~!$&'()*+,;=:@/?#-", "%20", "%2F", "%C3%A9"), { maxLength: 8 }).map((c) => c.join(""));

export const href: fc.Arbitrary<string> = fc.oneof(
  fc.tuple(fc.constantFrom("https", "http"), host, fc.option(fc.tuple(fc.constantFrom("/", "?", "#"), urlChars), { nil: undefined }))
    .map(([scheme, h, rest]) => `${scheme}://${h}${rest ? rest[0] + rest[1] : ""}`),
  fc.tuple(fc.constantFrom("club", "a.b+c"), urlChars).map(([user, rest]) => `mailto:${user}@example.org${rest.replaceAll("#", "")}`),
  fc.constantFrom("tel:+44-20-7946-0958", "tel:0123", "tel:+1(555)0100"),
  fc.tuple(fc.constantFrom("a", "winter", "~x", "%7E", "@"), urlChars).map(([first, rest]) => `/${first}${rest}`),
  fc.constant("/"),
  fc.tuple(fc.constantFrom("?", "#"), urlChars).map(([mark, rest]) => mark + rest),
);

const imageUrl = fc.oneof(
  fc.tuple(host, urlChars).map(([h, rest]) => `https://${h}/${rest}`),
  fc.tuple(fc.constantFrom("media", "u", "x.png"), urlChars).map(([first, rest]) => `/${first}${rest}`),
);

// ------------------------------------------------------------- numbers

// A latitude or longitude: on a round number, with a few decimals, any
// double at all, or on and around a point where the sixth decimal is half
// way (an odd multiple of 1/128, give or take a few units in the last place).
function coordinate(limit: number): fc.Arbitrary<number> {
  const nearHalf = fc.tuple(fc.integer({ min: -limit * 64, max: limit * 64 - 1 }), fc.integer({ min: -3, max: 3 }))
    .map(([n, ulps]) => (2 * n + 1) / 128 + ulps * Number.EPSILON * Math.max(1, Math.abs((2 * n + 1) / 128)));
  return fc.oneof(
    fc.integer({ min: -limit, max: limit }),
    fc.integer({ min: -limit * 10_000, max: limit * 10_000 }).map((n) => n / 10_000),
    fc.double({ min: -limit, max: limit, noNaN: true, noDefaultInfinity: true }).map((x) => (Object.is(x, -0) ? 0 : x)),
    nearHalf,
  ).filter((x) => Math.abs(x) <= limit);
}

// --------------------------------------------------------------- props

// A library image names an item the library has: the CMS refuses to save a
// draft that names any other (its mediaExists rule).
function imageRef(mediaIds: readonly string[]): fc.Arbitrary<AnyObject> {
  const external = imageUrl.map((url): AnyObject => ({ url }));
  const source = mediaIds.length === 0 ? external : fc.oneof(fc.constantFrom(...mediaIds).map((mediaId): AnyObject => ({ mediaId })), external);
  const text = fc.oneof({ weight: 4, arbitrary: line(300).map((alt) => ({ alt })) }, { weight: 1, arbitrary: fc.constant({ decorative: true }) });
  return fc.tuple(source, text).map(([s, t]) => ({ ...s, ...t }));
}

const linkMark = fc.record({
  href,
  target: fc.option(fc.constantFrom(null, "_blank"), { nil: undefined }),
  rel: fc.option(fc.constantFrom(null, "noopener noreferrer nofollow"), { nil: undefined }),
  class: fc.option(fc.constant(null), { nil: undefined }),
}).map((attrs) => ({ type: "link", attrs: compact(attrs) }));
const marks = fc.array(fc.oneof(fc.constant({ type: "bold" }), fc.constant({ type: "italic" }), linkMark), { maxLength: 3 });
const inline = fc.oneof(
  { weight: 5, arbitrary: fc.tuple(line(200), marks).map(([text, m]) => compact({ type: "text", text, marks: m.length > 0 ? m : undefined })) },
  { weight: 1, arbitrary: marks.map((m) => compact({ type: "hardBreak", marks: m.length > 0 ? m : undefined })) },
);
const richParagraph = fc.array(inline, { maxLength: 4 }).map((content) => (content.length > 0 ? { type: "paragraph", content } : { type: "paragraph" }));
const orderedAttrs = fc.option(
  fc.record({ start: fc.option(fc.integer({ min: 1, max: 100_000 }), { nil: undefined }), type: fc.option(fc.constantFrom(null, "1", "a", "A", "i", "I"), { nil: undefined }) }).map(compact),
  { nil: undefined },
);
const { richBlock } = fc.letrec<{ richBlock: AnyObject; listItem: AnyObject }>((tie) => ({
  richBlock: fc.oneof(
    { maxDepth: 3, depthIdentifier: "rich" },
    { weight: 4, arbitrary: richParagraph },
    { weight: 1, arbitrary: fc.array(tie("listItem"), { minLength: 1, maxLength: 3 }).map((content) => ({ type: "bulletList", content })) },
    { weight: 1, arbitrary: fc.tuple(orderedAttrs, fc.array(tie("listItem"), { minLength: 1, maxLength: 3 })).map(([attrs, content]) => compact({ type: "orderedList", attrs, content })) },
  ),
  listItem: fc.tuple(richParagraph, fc.array(tie("richBlock"), { maxLength: 2 })).map(([first, rest]) => ({ type: "listItem", content: [first, ...rest] })),
}));
const richDoc = fc.array(richBlock, { minLength: 1, maxLength: 4 }).map((content) => ({ type: "doc", content }));

function props(type: WidgetType, mediaIds: readonly string[]): fc.Arbitrary<AnyObject> {
  switch (type) {
    case "heading": return fc.record({ level: fc.integer({ min: 1, max: 4 }), text: line(200), href: fc.option(href, { nil: undefined }) }).map(compact);
    case "text": return richDoc.map((doc) => ({ doc }));
    case "image": return imageRef(mediaIds);
    case "button": return fc.record({ label: line(80), href });
    case "divider": return fc.constant({});
    case "spacer": return fc.constantFrom(...SPACE_TOKENS).map((size) => ({ size }));
    case "gallery": return fc.array(imageRef(mediaIds), { minLength: 1, maxLength: 5 }).map((items) => ({ items }));
    case "video": return fc.oneof(
      fc.record({ provider: fc.constant("youtube"), videoId: fc.stringMatching(/^[A-Za-z0-9_-]{11}$/), title: line(120) }),
      fc.record({ provider: fc.constant("vimeo"), videoId: fc.stringMatching(/^[0-9]{1,12}$/), title: line(120) }),
    );
    case "map": return fc.record({ latitude: coordinate(90), longitude: coordinate(180), zoom: fc.integer({ min: 1, max: 19 }), label: line(120) });
    case "iconbox": return fc.record({ icon: fc.constantFrom(...ICON_NAMES), title: line(80), text: paragraph(300) });
    case "quote": return fc.record({ text: paragraph(500), attribution: fc.option(line(120), { nil: undefined }) }).map(compact);
    case "accordion": return fc.array(fc.record({ question: line(200), answer: paragraph(2000) }), { minLength: 1, maxLength: 4 }).map((items) => ({ items }));
  }
}

// ---------------------------------------------------------------- style

function stylePart(type: BlockType, minKeys: number): fc.Arbitrary<AnyObject> {
  const keys = STYLE_KEYS_BY_TYPE[type] as readonly (keyof StyleTokens)[];
  return fc.subarray([...keys], { minLength: Math.min(minKeys, keys.length) })
    .chain((chosen) => fc.tuple(...chosen.map((key) => fc.constantFrom(...TOKENS[key]).map((token) => [key, token] as const))))
    .map((pairs) => Object.fromEntries(pairs));
}

function style(type: BlockType): fc.Arbitrary<AnyObject> {
  return fc.record(Object.fromEntries(DEVICES.map((device) => [device, device === "base" ? stylePart(type, 0) : fc.option(stylePart(type, 1), { nil: undefined })])))
    .map(compact);
}

// ---------------------------------------------------------------- pages

function widget(mediaIds: readonly string[]): fc.Arbitrary<AnyObject> {
  return fc.constantFrom(...WIDGET_TYPES).chain((type) =>
    fc.record({ props: props(type, mediaIds), style: style(type) }).map(({ props: p, style: s }) => ({ id: "", type, props: p, children: [], style: s })));
}

function section(mediaIds: readonly string[]): fc.Arbitrary<AnyObject> {
  const column = fc.record({ widgets: fc.array(widget(mediaIds), { maxLength: 4 }), style: style("column") })
    .map(({ widgets, style: s }) => ({ id: "", type: "column", props: {}, children: widgets, style: s }));
  return fc.integer({ min: 1, max: 4 }).chain((count) => {
    const presets = COLUMN_WIDTHS_BY_COUNT[count as 1 | 2 | 3 | 4] as readonly string[];
    return fc.record({
      columns: fc.array(column, { minLength: count, maxLength: count }),
      label: fc.option(line(60), { nil: undefined }),
      anchor: fc.option(fc.stringMatching(/^[a-z][a-z0-9-]{0,63}$/), { nil: undefined }),
      widths: presets.length > 0 ? fc.option(fc.constantFrom(...presets), { nil: undefined }) : fc.constant(undefined),
      style: style("section"),
    }).map(({ columns, label, anchor, widths, style: s }) => ({
      id: "", type: "section", props: compact({ label, anchor, columnWidths: widths }), children: columns, style: s,
    }));
  });
}

// Ids drawn from every character the schema allows, unique by their number.
function giveIds(sections: AnyObject[], prefixes: readonly string[]): void {
  let n = 0;
  const visit = (block: AnyObject): void => {
    block.id = `${prefixes[n % prefixes.length]}${n}`;
    n += 1;
    (block.children as AnyObject[]).forEach(visit);
  };
  sections.forEach(visit);
}

export function page(mediaIds: readonly string[]): fc.Arbitrary<AnyObject> {
  return fc.record({
    title: line(120),
    description: fc.option(line(160), { nil: undefined }),
    sections: fc.array(section(mediaIds), { maxLength: 3 }),
    prefixes: fc.array(fc.stringMatching(/^[A-Za-z0-9_-]{1,8}$/), { minLength: 1, maxLength: 3 }),
  }).map(({ title, description, sections, prefixes }) => {
    const copy = structuredClone(sections);
    giveIds(copy, prefixes);
    return checked(compact({ schemaVersion: SCHEMA_VERSION, title, description, sections: copy }));
  });
}

export function checked(document: AnyObject): AnyObject {
  const result = validateDocument(document);
  if (!result.valid) throw new Error(`the generator made an invalid page: ${JSON.stringify(result.errors.slice(0, 3))}`);
  return document;
}
