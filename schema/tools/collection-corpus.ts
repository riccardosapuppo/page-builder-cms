// The collection corpus, schema/collection-corpus: cases of
// collection.schema.json and of the collection rules (./collection-rules.ts
// and its Ruby twin), which both validators must call valid or invalid
// alike. Each case is one JSON object, {"collection": ..., "entry": ...}:
// the collection is checked, then the entry, where the case has one,
// against that collection.
//
// Every invalid case is the base case (valid/news.json) with ONE change,
// and the manifest records the rule it breaks and where both validators
// must report it: the JSON pointer into the case and the keyword, and
// whether a rule or the schema refuses it. Cases that need bytes
// JSON.stringify cannot write (a duplicate member, a lone surrogate,
// 1e400) are written from the serialised base with one literal swapped.
// ./gen-corpus.ts writes this corpus beside the page corpus, and checks it
// with --check.
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ManifestEntry } from "./corpus.ts";
import { MAX_NESTING } from "./rules.ts";

export const COLLECTION_CORPUS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "collection-corpus");

// The keywords only a rule reports. required, minimum, maximum and enum
// are the schema's words too: a case refused by the rule under one of
// them says so itself.
const RULE_KEYWORDS = new Set([
  "encoding", "parse", "duplicateKey", "maxNesting", "wellFormed", "finite", "safeInteger", "decimals",
  "uniqueKey", "uniqueOption", "range", "sortField", "unknownField", "dateExists",
]);

type J = any;

const cp = (...codes: number[]): string => String.fromCodePoint(...codes);
const NBSP = cp(0xa0);
const ZERO_WIDTH_SPACE = cp(0x200b);
const IDEOGRAPHIC_SPACE = cp(0x3000);
const COMBINING_ACUTE = cp(0x301);
const TAB = cp(0x09);
const NEWLINE = cp(0x0a);
const ARABIC_INDIC = (digits: string): string => [...digits].map((d) => cp(0x660 + Number(d))).join("");
const BACKSLASH = cp(0x5c);
const uEscape = (hex: string): string => `${BACKSLASH}u${hex}`;

// --- rich text, as the text widget's document --------------------------------------
const t = (s: string, marks?: J[]): J => (marks ? { type: "text", text: s, marks } : { type: "text", text: s });
const br = (): J => ({ type: "hardBreak" });
const p = (...content: J[]): J => (content.length > 0 ? { type: "paragraph", content } : { type: "paragraph" });
const li = (...content: J[]): J => ({ type: "listItem", content });
const ul = (...items: J[]): J => ({ type: "bulletList", content: items });
const ol = (start: number, ...items: J[]): J => ({ type: "orderedList", attrs: { start, type: null }, content: items });
const rich = (...content: J[]): J => ({ type: "doc", content });
const bold: J = { type: "bold" };
const italic: J = { type: "italic" };
const link = (href: string): J => ({ type: "link", attrs: { href, target: null, rel: "noopener noreferrer nofollow", class: null } });

// --- the base case: a collection with a field of every type, and an entry --------
const field = (key: string, label: string, type: string, required: boolean, extra: J = {}): J => ({ key, label, type, required, ...extra });

function news(): J {
  return {
    name: "News",
    prefix: "news",
    fields: [
      field("summary", "Summary", "paragraph", true),
      field("body", "Body", "richText", false),
      field("picture", "Picture", "image", false),
      field("day", "Day", "date", true),
      field("place", "Place", "text", false),
      field("places", "Places", "number", false, { min: 0, max: 40 }),
      field("booking", "Booking", "link", false),
      field("members-only", "Members only", "toggle", false),
      field("level", "Level", "choice", true, { options: ["Beginner", "Improver", "Strong swimmer"] }),
    ],
    sort: { by: "day", direction: "desc" },
  };
}

function dawn(): J {
  return {
    title: "Dawn swims start again",
    slug: "dawn-swims-start-again",
    values: {
      summary: `From May, twice a week at first light.${NEWLINE}Meet at the slipway.`,
      body: rich(
        p(t("Bring a "), t("bright cap", [bold]), t(" and "), t("read the rules", [link("/rules")]), t(".")),
        ul(li(p(t("goggles"))), li(p(t("something warm")))),
      ),
      picture: { mediaId: "dawn-01", alt: "The bay at first light, flat and grey" },
      day: "2026-05-02",
      place: "The slipway at the north end",
      places: 24,
      booking: { label: "Book a place", href: "/join?swim=dawn" },
      "members-only": false,
      level: "Beginner",
    },
  };
}

const BASE = { collection: news(), entry: dawn() };
const FIELD = (k: number): string => `/collection/fields/${k}`;
const VALUE = (key: string): string => `/entry/values/${key}`;
const index = (key: string): number => (BASE.collection.fields as J[]).findIndex((f) => f.key === key);
const SUMMARY = index("summary");
const PLACE = index("place");
const PLACES = index("places");
const DAY = index("day");
const LEVEL = index("level");

// --- output ------------------------------------------------------------------------
export function collectionCorpus(): { files: Map<string, Uint8Array>; manifest: Record<string, ManifestEntry> } {
  const files = new Map<string, Uint8Array>();
  const manifest: Record<string, ManifestEntry> = {};
  const encoder = new TextEncoder();
  const serialise = (d: J): string => JSON.stringify(d, null, 2) + "\n";

  const add = (name: string, bytes: Uint8Array, entry: ManifestEntry): void => {
    if (files.has(name)) throw new Error(`duplicate collection corpus file ${name}`);
    files.set(name, bytes);
    manifest[name] = entry;
  };
  const valid = (name: string, rule: string, d: J): void => add(`valid/${name}.json`, encoder.encode(serialise(d)), { rule });
  const refused = (rule: string, pointer: string, keyword: string, layer?: "rules" | "schema"): ManifestEntry =>
    ({ rule, pointer, keyword, layer: layer ?? (RULE_KEYWORDS.has(keyword) ? "rules" : "schema") });
  // One change to the base case. byRule: a keyword the schema has too,
  // reported here by a rule.
  const invalid = (name: string, rule: string, pointer: string, keyword: string, mutate: (d: J) => void, byRule = false): void => {
    const d = structuredClone(BASE) as J;
    mutate(d);
    add(`invalid/${name}.json`, encoder.encode(serialise(d)), refused(rule, pointer, keyword, byRule ? "rules" : undefined));
  };
  // One literal of the serialised base swapped for text JSON.stringify
  // would not write.
  const replaceOnce = (s: string, from: string, to: string, name: string): string => {
    if (s.split(from).length !== 2) throw new Error(`${name}: ${JSON.stringify(from)} is not in the text exactly once`);
    return s.split(from).join(to);
  };
  const BASE_TEXT = serialise(BASE);
  const invalidRaw = (name: string, rule: string, pointer: string, keyword: string, from: string, to: string): void =>
    add(`invalid/${name}.json`, encoder.encode(replaceOnce(BASE_TEXT, from, to, name)), refused(rule, pointer, keyword));

  // ================================ VALID ===========================================
  valid("news", "the base case: a collection with a field of every type, sorted by a date field, and an entry with a value for each; each invalid case changes one thing in it", BASE);
  valid("collection-alone", "a collection with no entry to check", { collection: news() });
  valid("no-fields", "a collection of no field but the built-in title and slug, sorted by title, and an entry with no value", {
    collection: { name: "Notes", prefix: "notes", fields: [], sort: { by: "title", direction: "asc" } },
    entry: { title: "A note", slug: "a-note", values: {} },
  });
  valid("required-values-only", "an entry that leaves every optional field without a value", (() => {
    const d = structuredClone(BASE) as J;
    for (const key of ["body", "picture", "place", "places", "booking", "members-only"]) delete d.entry.values[key];
    return d;
  })());
  for (const [by, direction] of [["updatedAt", "desc"], ["publishedAt", "asc"], ["title", "desc"], ["places", "asc"]] as const) {
    valid(`sort-by-${by.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`, `sorted by ${by}, ${direction}: the title, a time, or a number field`, { collection: { ...news(), sort: { by, direction } } });
  }
  valid("values-at-their-limits", "every value at the ends of its rules: a title of 200 emoji, a paragraph of 5000 characters, numbers at a billion each way and with two decimals, 29 February of leap years (2000, 0000) and a day of the gap the Julian calendar left in 1582, a choice of twenty options of 60 characters, a decorative image, every link form", {
    collection: {
      name: "L".repeat(60),
      prefix: "a".repeat(64),
      fields: [
        field("words", "W".repeat(60), "text", true),
        field("lines", "Lines", "paragraph", true),
        field("high", "High", "number", true),
        field("low", "Low", "number", true),
        field("cents", "Cents", "number", true, { min: -0.05, max: 0.75 }),
        field("leap", "Leap", "date", true),
        field("first", "First", "date", true),
        field("gap", "Gap", "date", true),
        field("picture", "Picture", "image", true),
        field("mail", "Mail", "link", true),
        field("call", "Call", "link", true),
        field("fragment", "Fragment", "link", true),
        field("on", "On", "toggle", true),
        field("many", "Many", "choice", true, { options: Array.from({ length: 20 }, (_, k) => `${"o".repeat(58)}${String(k).padStart(2, "0")}`) }),
        field(`k${"a".repeat(63)}`, "The longest key", "text", false),
      ],
      sort: { by: "cents", direction: "asc" },
    },
    entry: {
      title: cp(0x1f30a).repeat(200),
      slug: "z".repeat(64),
      values: {
        words: `e${COMBINING_ACUTE}`.repeat(100),
        lines: `${"x".repeat(2499)}${NEWLINE}${"y".repeat(2500)}`,
        high: 1_000_000_000,
        low: -1_000_000_000,
        cents: 0.75,
        leap: "2000-02-29",
        first: "0000-02-29",
        gap: "1582-10-10",
        picture: { mediaId: "rule-wave", decorative: true },
        mail: { label: "Write", href: "mailto:hello@slackwater.example?subject=Dawn%20swims" },
        call: { label: "Call", href: "tel:+44-1234-567890" },
        fragment: { label: "Top", href: "#top" },
        on: true,
        many: `${"o".repeat(58)}19`,
        [`k${"a".repeat(63)}`]: "The longest key's value",
      },
    },
  });
  valid("rich-text-every-mark", "a rich text value with every node and mark the text widget takes", {
    collection: news(),
    entry: { ...dawn(), values: { ...dawn().values, body: rich(
      p(t("Plain, "), t("bold", [bold]), t(", "), t("italic", [italic]), t(" and "), t("all three", [bold, italic, link("https://example.org/")])),
      p(),
      p(t("Line one"), br(), t("line two")),
      ol(3, li(p(t("third"))), li(p(t("fourth")), ul(li(p(t("nested")))))),
    ) } },
  });
  valid("labels-in-other-scripts", "names, labels and options in other scripts, and spaces inside them", {
    collection: {
      name: "Νέα της ακτής",
      prefix: "nea",
      fields: [field("titlos", `Περίληψη${NBSP}σύντομη`, "text", true), field("choice", "Выбор", "choice", true, { options: ["Один", "Два"] })],
      sort: { by: "publishedAt", direction: "desc" },
    },
    entry: { title: "Ημέρα στη θάλασσα", slug: "imera", values: { titlos: "Κρύο νερό, ζεστό τσάι", choice: "Два" } },
  });
  {
    // Numbers written as integral floats: both engines read 24.0 as the
    // integer 24, and both languages normalise it so.
    let s = serialise(BASE);
    s = replaceOnce(s, '"places": 24', '"places": 24.0', "integral-floats");
    s = replaceOnce(s, '"min": 0', '"min": 0.0', "integral-floats");
    s = replaceOnce(s, '"max": 40', '"max": 4e1', "integral-floats");
    add("valid/integral-floats.json", encoder.encode(s), { rule: "24.0, 0.0 and 4e1 are the integers 24, 0 and 40: a value, a lowest and a highest" });
  }

  // ================================ INVALID: the collection =========================
  invalid("collection-name-missing", "a collection has a name", "/collection", "required", (d) => { delete d.collection.name; });
  invalid("collection-name-blank", "a name has a visible character", "/collection/name", "pattern", (d) => { d.collection.name = `${NBSP}${NBSP}`; });
  invalid("collection-name-too-long", "a name has at most 60 characters", "/collection/name", "maxLength", (d) => { d.collection.name = "N".repeat(61); });
  invalid("collection-name-newline", "a name is one line", "/collection/name", "not", (d) => { d.collection.name = `News${NEWLINE}letter`; });
  invalid("collection-prefix-missing", "a collection has a prefix", "/collection", "required", (d) => { delete d.collection.prefix; });
  invalid("collection-prefix-uppercase", "a prefix is lowercase", "/collection/prefix", "pattern", (d) => { d.collection.prefix = "News"; });
  invalid("collection-prefix-trailing-newline", "the line-anchor trap: news and a newline", "/collection/prefix", "pattern", (d) => { d.collection.prefix = `news${NEWLINE}`; });
  invalid("collection-prefix-double-hyphen", "single hyphens between words", "/collection/prefix", "pattern", (d) => { d.collection.prefix = "tide--times"; });
  invalid("collection-prefix-path", "a prefix is one part of an address", "/collection/prefix", "pattern", (d) => { d.collection.prefix = "news/2026"; });
  invalid("collection-prefix-too-long", "a prefix has at most 64 characters", "/collection/prefix", "maxLength", (d) => { d.collection.prefix = "a".repeat(65); });
  invalid("collection-extra-member", "a collection names nothing else: its template is a document of its own", "/collection/template", "additionalProperties", (d) => { d.collection.template = { sections: [] }; });
  invalid("collection-fields-not-a-list", "the fields are a list", "/collection/fields", "type", (d) => { d.collection.fields = { summary: "paragraph" }; });
  invalid("collection-31-fields", "a collection has at most thirty fields", "/collection/fields", "maxItems", (d) => {
    d.collection.fields = Array.from({ length: 31 }, (_, k) => field(`field-${k}`, `Field ${k}`, "text", false));
    d.collection.sort = { by: "title", direction: "asc" };
    d.entry.values = {};
  });

  invalid("field-key-missing", "a field has a key", FIELD(SUMMARY), "required", (d) => { delete d.collection.fields[SUMMARY].key; });
  invalid("field-key-title", "title is the built-in field every entry has", `${FIELD(PLACE)}/key`, "not", (d) => { d.collection.fields[PLACE].key = "title"; });
  invalid("field-key-slug", "slug is the built-in field every entry has", `${FIELD(PLACE)}/key`, "not", (d) => { d.collection.fields[PLACE].key = "slug"; });
  invalid("field-key-uppercase", "a key is lowercase", `${FIELD(SUMMARY)}/key`, "pattern", (d) => { d.collection.fields[SUMMARY].key = "Summary"; });
  invalid("field-key-starts-with-digit", "a key starts with a letter", `${FIELD(SUMMARY)}/key`, "pattern", (d) => { d.collection.fields[SUMMARY].key = "2nd-summary"; });
  invalid("field-key-too-long", "a key has at most 64 characters", `${FIELD(PLACE)}/key`, "pattern", (d) => { d.collection.fields[PLACE].key = `k${"a".repeat(64)}`; });
  invalid("field-key-trailing-newline", "the line-anchor trap in a key", `${FIELD(PLACE)}/key`, "pattern", (d) => { d.collection.fields[PLACE].key = `place${NEWLINE}`; });
  invalid("field-key-arabic-digits", "digits of another script are not digits here", `${FIELD(PLACE)}/key`, "pattern", (d) => { d.collection.fields[PLACE].key = `place-${ARABIC_INDIC("2")}`; });
  invalid("field-key-twice", "two fields of one key would keep their values under one name (a rule)", `${FIELD(PLACE)}/key`, "uniqueKey", (d) => { d.collection.fields[PLACE].key = "summary"; });
  invalid("field-label-blank", "a label has a visible character", `${FIELD(PLACE)}/label`, "pattern", (d) => { d.collection.fields[PLACE].label = IDEOGRAPHIC_SPACE; });
  invalid("field-label-too-long", "a label has at most 60 characters", `${FIELD(PLACE)}/label`, "maxLength", (d) => { d.collection.fields[PLACE].label = "L".repeat(61); });
  invalid("field-label-tab", "a label is one line", `${FIELD(PLACE)}/label`, "not", (d) => { d.collection.fields[PLACE].label = `The${TAB}place`; });
  invalid("field-type-unknown", "the types are a closed list", `${FIELD(PLACE)}/type`, "enum", (d) => { d.collection.fields[PLACE].type = "email"; });
  invalid("field-required-text", "whether a value is required is true or false", `${FIELD(PLACE)}/required`, "type", (d) => { d.collection.fields[PLACE].required = "no"; });
  invalid("field-extra-member", "a field has no placeholder or default value", `${FIELD(PLACE)}/placeholder`, "additionalProperties", (d) => { d.collection.fields[PLACE].placeholder = "Where?"; });
  invalid("field-text-with-min", "only a number has a lowest value", FIELD(PLACE), "not", (d) => { d.collection.fields[PLACE].min = 1; });
  invalid("field-date-with-options", "only a choice has options", FIELD(DAY), "not", (d) => { d.collection.fields[DAY].options = ["2026-05-02"]; });
  invalid("field-number-with-options", "a number has no options", FIELD(PLACES), "not", (d) => { d.collection.fields[PLACES].options = ["24"]; });
  invalid("field-choice-without-options", "a choice lists its options", FIELD(LEVEL), "required", (d) => { delete d.collection.fields[LEVEL].options; });
  invalid("field-choice-with-max", "a choice has no highest value", FIELD(LEVEL), "not", (d) => { d.collection.fields[LEVEL].max = 3; });
  invalid("field-choice-no-option", "a choice has at least one option", `${FIELD(LEVEL)}/options`, "minItems", (d) => { d.collection.fields[LEVEL].options = []; });
  invalid("field-choice-21-options", "a choice has at most twenty options", `${FIELD(LEVEL)}/options`, "maxItems", (d) => { d.collection.fields[LEVEL].options = Array.from({ length: 21 }, (_, k) => (k === 0 ? "Beginner" : `Option ${k}`)); });
  invalid("field-choice-option-twice", "an option is listed once (a rule)", `${FIELD(LEVEL)}/options/2`, "uniqueOption", (d) => { d.collection.fields[LEVEL].options = ["Beginner", "Improver", "Beginner"]; });
  invalid("field-choice-option-blank", "an option has a visible character", `${FIELD(LEVEL)}/options/1`, "pattern", (d) => { d.collection.fields[LEVEL].options[1] = ZERO_WIDTH_SPACE; });
  invalid("field-choice-option-too-long", "an option has at most 60 characters", `${FIELD(LEVEL)}/options/2`, "maxLength", (d) => { d.collection.fields[LEVEL].options[2] = "o".repeat(61); });
  invalid("field-number-min-above-max", "the lowest value is not above the highest (a rule)", `${FIELD(PLACES)}/max`, "range", (d) => { d.collection.fields[PLACES].min = 50; });
  invalid("field-number-min-three-decimals", "a lowest value has two decimals at most (a rule)", `${FIELD(PLACES)}/min`, "decimals", (d) => { d.collection.fields[PLACES].min = 0.125; });
  invalid("field-number-max-beyond", "a highest value is at most a billion", `${FIELD(PLACES)}/max`, "maximum", (d) => { d.collection.fields[PLACES].max = 2_000_000_000; });
  invalid("field-number-min-text", "a lowest value is a number", `${FIELD(PLACES)}/min`, "type", (d) => { d.collection.fields[PLACES].min = "0"; });

  invalid("sort-missing", "a collection says how its entries are ordered", "/collection", "required", (d) => { delete d.collection.sort; });
  invalid("sort-by-text-field", "an order follows a date or number field, not a text (a rule)", "/collection/sort/by", "sortField", (d) => { d.collection.sort.by = "place"; });
  invalid("sort-by-no-field", "an order follows a field the collection has (a rule)", "/collection/sort/by", "sortField", (d) => { d.collection.sort.by = "weather"; });
  invalid("sort-by-uppercase", "a field's key is lowercase", "/collection/sort/by", "pattern", (d) => { d.collection.sort.by = "Day"; });
  invalid("sort-direction-up", "ascending or descending", "/collection/sort/direction", "enum", (d) => { d.collection.sort.direction = "up"; });
  invalid("sort-extra-member", "an order names nothing else", "/collection/sort/then", "additionalProperties", (d) => { d.collection.sort.then = "title"; });

  // ================================ INVALID: the entry ==============================
  invalid("entry-title-missing", "an entry has a title", "/entry", "required", (d) => { delete d.entry.title; });
  invalid("entry-title-blank", "a title has a visible character", "/entry/title", "pattern", (d) => { d.entry.title = ZERO_WIDTH_SPACE.repeat(3); });
  invalid("entry-title-too-long", "a title has at most 200 characters", "/entry/title", "maxLength", (d) => { d.entry.title = "T".repeat(201); });
  invalid("entry-title-newline", "a title is one line", "/entry/title", "not", (d) => { d.entry.title = `Dawn${NEWLINE}swims`; });
  invalid("entry-slug-missing", "an entry has an address", "/entry", "required", (d) => { delete d.entry.slug; });
  invalid("entry-slug-spaces", "an address is lowercase words joined by hyphens", "/entry/slug", "pattern", (d) => { d.entry.slug = "Dawn swims"; });
  invalid("entry-slug-too-long", "an address has at most 64 characters", "/entry/slug", "maxLength", (d) => { d.entry.slug = "z".repeat(65); });
  invalid("entry-values-a-list", "the values are an object, by field key", "/entry/values", "type", (d) => { d.entry.values = []; });
  invalid("entry-extra-member", "an entry as saved names nothing else: what is live is the storage's", "/entry/published", "additionalProperties", (d) => { d.entry.published = true; });

  invalid("value-unknown-key", "a value under a key no field has (a rule)", VALUE("summery"), "unknownField", (d) => { d.entry.values.summery = "A typo"; });
  invalid("value-required-missing", "a required field has a value (a rule)", VALUE("summary"), "required", (d) => { delete d.entry.values.summary; }, true);
  invalid("value-required-choice-missing", "a required choice has a value (a rule)", VALUE("level"), "required", (d) => { delete d.entry.values.level; }, true);
  invalid("value-text-empty", "a text with nothing in it is no value: the field is left without one", VALUE("place"), "pattern", (d) => { d.entry.values.place = ""; });
  invalid("value-text-too-long", "a text has at most 200 characters", VALUE("place"), "maxLength", (d) => { d.entry.values.place = "x".repeat(201); });
  invalid("value-text-newline", "a text is one line", VALUE("place"), "not", (d) => { d.entry.values.place = `The${NEWLINE}slipway`; });
  invalid("value-text-number", "a text is a string", VALUE("place"), "type", (d) => { d.entry.values.place = 7; });
  invalid("value-paragraph-too-long", "a paragraph has at most 5000 characters", VALUE("summary"), "maxLength", (d) => { d.entry.values.summary = "x".repeat(5001); });
  invalid("value-paragraph-tab", "a paragraph breaks its lines with a newline, nothing else", VALUE("summary"), "not", (d) => { d.entry.values.summary = `First${TAB}light`; });
  invalid("value-paragraph-blank", "a paragraph has a visible character", VALUE("summary"), "pattern", (d) => { d.entry.values.summary = `${NEWLINE}${NBSP}`; });
  invalid("value-rich-text-not-a-doc", "a rich text is the text widget's document", `${VALUE("body")}/type`, "const", (d) => { d.entry.values.body = { type: "paragraph", content: [t("Hi")] }; });
  invalid("value-rich-text-heading", "the text widget's document has no heading", `${VALUE("body")}/content/0/type`, "enum", (d) => { d.entry.values.body.content[0] = { type: "heading", attrs: { level: 2 }, content: [t("Hi")] }; });
  invalid("value-rich-text-javascript-link", "a link in a rich text follows a page's link rules", `${VALUE("body")}/content/0/content/3/marks/0/attrs/href`, "pattern", (d) => { d.entry.values.body.content[0].content[3].marks[0].attrs.href = "javascript:alert(1)"; });
  invalid("value-rich-text-empty", "a rich text holds a paragraph at least", `${VALUE("body")}/content`, "minItems", (d) => { d.entry.values.body.content = []; });
  invalid("value-rich-text-bold-twice", "a run of text carries a mark once", `${VALUE("body")}/content/0/content/1/marks`, "not", (d) => { d.entry.values.body.content[0].content[1].marks = [bold, bold]; });
  invalid("value-number-above-max", "a number at most its field's highest (a rule)", VALUE("places"), "maximum", (d) => { d.entry.values.places = 41; }, true);
  invalid("value-number-below-min", "a number at least its field's lowest (a rule)", VALUE("places"), "minimum", (d) => { d.entry.values.places = -1; }, true);
  invalid("value-number-three-decimals", "a number has two decimals at most (a rule)", VALUE("places"), "decimals", (d) => { d.entry.values.places = 12.345; });
  invalid("value-number-text", "a number is a number", VALUE("places"), "type", (d) => { d.entry.values.places = "24"; });
  invalid("value-number-beyond-a-billion", "no number beyond a billion, whatever its field says", VALUE("places"), "maximum", (d) => { d.entry.values.places = 2_000_000_000; });
  invalidRaw("value-number-1e400", "1e400 reads as Infinity in both languages (a rule)", VALUE("places"), "finite", '"places": 24', '"places": 1e400');
  invalidRaw("value-number-20-digits", "a 20-digit integer is exact in Ruby and rounded in JavaScript (a rule)", VALUE("places"), "safeInteger", '"places": 24', '"places": 12345678901234567890');
  invalid("value-date-30-february", "a day that exists (a rule)", VALUE("day"), "dateExists", (d) => { d.entry.values.day = "2026-02-30"; });
  invalid("value-date-29-february-2027", "29 February only in a leap year (a rule)", VALUE("day"), "dateExists", (d) => { d.entry.values.day = "2027-02-29"; });
  invalid("value-date-29-february-1900", "a century is a leap year only every 400 years (a rule)", VALUE("day"), "dateExists", (d) => { d.entry.values.day = "1900-02-29"; });
  invalid("value-date-31-april", "April has 30 days (a rule)", VALUE("day"), "dateExists", (d) => { d.entry.values.day = "2026-04-31"; });
  invalid("value-date-month-13", "twelve months", VALUE("day"), "pattern", (d) => { d.entry.values.day = "2026-13-01"; });
  invalid("value-date-short", "a day is written with two digits for its month and day", VALUE("day"), "pattern", (d) => { d.entry.values.day = "2026-5-2"; });
  invalid("value-date-and-time", "a day, not a time", VALUE("day"), "pattern", (d) => { d.entry.values.day = "2026-05-02T06:00:00Z"; });
  invalid("value-date-trailing-newline", "the line-anchor trap in a day", VALUE("day"), "pattern", (d) => { d.entry.values.day = `2026-05-02${NEWLINE}`; });
  invalid("value-date-arabic-digits", "digits of another script are not digits here", VALUE("day"), "pattern", (d) => { d.entry.values.day = `${ARABIC_INDIC("2026")}-05-02`; });
  invalid("value-date-number", "a day is written as text", VALUE("day"), "type", (d) => { d.entry.values.day = 20260502; });
  invalid("value-image-from-elsewhere", "an image of the library, never one from another site", VALUE("picture"), "required", (d) => { d.entry.values.picture = { url: "https://images.example.org/bay.jpg", alt: "The bay" }; });
  invalid("value-image-alt-and-decorative", "a decorative image has no alt text", VALUE("picture"), "not", (d) => { d.entry.values.picture.decorative = true; });
  invalid("value-image-no-alt", "an image has alt text, or is decorative", VALUE("picture"), "required", (d) => { delete d.entry.values.picture.alt; });
  invalid("value-image-alt-too-long", "alt text has at most 300 characters", `${VALUE("picture")}/alt`, "maxLength", (d) => { d.entry.values.picture.alt = "a".repeat(301); });
  invalid("value-image-id-space", "a media id is one word of its alphabet", `${VALUE("picture")}/mediaId`, "pattern", (d) => { d.entry.values.picture.mediaId = "dawn 01"; });
  invalid("value-image-caption", "an image value names nothing else", `${VALUE("picture")}/caption`, "additionalProperties", (d) => { d.entry.values.picture.caption = "At dawn"; });
  invalid("value-link-javascript", "a link follows a page's link rules", `${VALUE("booking")}/href`, "pattern", (d) => { d.entry.values.booking.href = "javascript:alert(1)"; });
  invalid("value-link-newline-then-https", "the line-anchor trap in a link", `${VALUE("booking")}/href`, "not", (d) => { d.entry.values.booking.href = `javascript:alert(1)${NEWLINE}https://ok.example`; });
  invalid("value-link-no-address", "a link goes somewhere", VALUE("booking"), "required", (d) => { delete d.entry.values.booking.href; });
  invalid("value-link-label-blank", "a link's words have a visible character", `${VALUE("booking")}/label`, "pattern", (d) => { d.entry.values.booking.label = NBSP; });
  invalid("value-link-label-too-long", "a link's words are at most 80 characters", `${VALUE("booking")}/label`, "maxLength", (d) => { d.entry.values.booking.label = "B".repeat(81); });
  invalid("value-link-target", "a link has its words and address, nothing else", `${VALUE("booking")}/target`, "additionalProperties", (d) => { d.entry.values.booking.target = "_blank"; });
  invalid("value-link-text", "a link is its words and its address, not an address alone", VALUE("booking"), "type", (d) => { d.entry.values.booking = "https://example.org/book"; });
  invalid("value-toggle-text", "a toggle is true or false", VALUE("members-only"), "type", (d) => { d.entry.values["members-only"] = "yes"; });
  invalid("value-toggle-null", "a toggle with no value has no key", VALUE("members-only"), "type", (d) => { d.entry.values["members-only"] = null; });
  invalid("value-choice-not-offered", "a choice is one of its options (a rule)", VALUE("level"), "enum", (d) => { d.entry.values.level = "Expert"; }, true);
  invalid("value-choice-other-case", "an option is matched exactly (a rule)", VALUE("level"), "enum", (d) => { d.entry.values.level = "beginner"; }, true);
  invalid("value-choice-number", "a choice is its option's words", VALUE("level"), "type", (d) => { d.entry.values.level = 1; });

  // ================================ INVALID: the text itself ========================
  invalidRaw("text-duplicate-value", "a value given twice: each parser would see another entry (a rule)", VALUE("place"), "duplicateKey",
    '"place": "The slipway at the north end",', '"place": "The slipway at the north end", "place": "The beach",');
  invalidRaw("text-lone-surrogate", "half of a surrogate pair in a value (a rule)", VALUE("place"), "wellFormed",
    '"place": "The slipway at the north end"', `"place": "The slipway ${uEscape("d83c")}"`);
  {
    add("invalid/text-byte-order-mark.json", Uint8Array.from([0xef, 0xbb, 0xbf, ...encoder.encode(BASE_TEXT)]), refused("a byte-order mark before the case (a rule)", "", "parse"));
    const [before, after] = BASE_TEXT.split("The slipway at the north end") as [string, string];
    add("invalid/text-invalid-utf8.json", Uint8Array.from([...encoder.encode(before), 0x54, 0xff, 0x65, ...encoder.encode(after)]), refused("a 0xFF byte is not UTF-8 (a rule)", "", "encoding"));
    // A value nested past the limit, under a key no field has: the JSON
    // rules stop it before any rule of the collection reads it. The case,
    // the entry and its values are three containers, and this member's
    // outer array the fourth: the 61st array inside that one is the first
    // past MAX_NESTING, and the one reported.
    const levels = 70;
    const deep = replaceOnce(BASE_TEXT, '"level": "Beginner"', `"level": "Beginner", "deep": ${"[".repeat(levels)}${"]".repeat(levels)}`, "text-nesting");
    add("invalid/text-nesting-70.json", encoder.encode(deep), refused("70 nested arrays: past the rules' 64 levels (a rule)", `${VALUE("deep")}${"/0".repeat(MAX_NESTING - 3)}`, "maxNesting"));
  }

  return { files, manifest };
}
