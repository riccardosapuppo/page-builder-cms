// Writes schema/corpus: valid/ and invalid/ documents and manifest.json.
//
// Every invalid file is the base page (valid/landing.json) with ONE change,
// and the manifest records the rule it breaks and where both validators
// must report it: the JSON pointer and the keyword. Files that need bytes
// JSON.stringify cannot write (a byte-order mark, invalid UTF-8, a duplicate
// key, 1e400) are written from the serialised base with a placeholder
// swapped for the raw text.
//
//   node gen-corpus.ts           write the corpus
//   node gen-corpus.ts --check   compare with what is on disk, write nothing;
//                                exit 1 on any difference
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { MAX_NESTING } from "./rules.ts";

const CORPUS = join(dirname(fileURLToPath(import.meta.url)), "..", "corpus");
const RULE_KEYWORDS = new Set(["encoding", "parse", "duplicateKey", "maxNesting", "wellFormed", "finite", "safeInteger", "uniqueId"]);

// The corpus is built by mutation, so the tree is handled as plain JSON.
type J = any;
type Style = { base: J; tablet?: J; phone?: J };

// --- blocks -------------------------------------------------------------------
const plain = (): Style => ({ base: {} });
const block = (id: string, type: string, props: J, children: J[] = [], style: Style = plain()): J => ({ id, type, props, children, style });
const section = (id: string, columns: J[], props: J = {}, style: Style = plain()): J => block(id, "section", props, columns, style);
const column = (id: string, widgets: J[], style: Style = plain()): J => block(id, "column", {}, widgets, style);
const heading = (id: string, level: number, text: string, style: Style = plain()): J => block(id, "heading", { level, text }, [], style);
const text = (id: string, doc: J, style: Style = plain()): J => block(id, "text", { doc }, [], style);
const image = (id: string, ref: J): J => block(id, "image", ref);
const button = (id: string, label: string, href: string, style: Style = plain()): J => block(id, "button", { label, href }, [], style);
const divider = (id: string): J => block(id, "divider", {});
const spacer = (id: string, size: string): J => block(id, "spacer", { size });
const gallery = (id: string, items: J[]): J => block(id, "gallery", { items });
const video = (id: string, provider: string, videoId: string, title: string): J => block(id, "video", { provider, videoId, title });
const map = (id: string, latitude: number, longitude: number, zoom: number, label: string): J =>
  block(id, "map", { latitude, longitude, zoom, label });
const iconbox = (id: string, icon: string, title: string, body: string): J => block(id, "iconbox", { icon, title, text: body });
const quote = (id: string, body: string, attribution?: string): J =>
  block(id, "quote", attribution === undefined ? { text: body } : { text: body, attribution });
const accordion = (id: string, items: J[]): J => block(id, "accordion", { items });

// --- rich text ------------------------------------------------------------------
const t = (s: string, marks?: J[]): J => (marks ? { type: "text", text: s, marks } : { type: "text", text: s });
const br = (marks?: J[]): J => (marks ? { type: "hardBreak", marks } : { type: "hardBreak" });
const p = (...content: J[]): J => (content.length > 0 ? { type: "paragraph", content } : { type: "paragraph" });
const li = (...content: J[]): J => ({ type: "listItem", content });
const ul = (...items: J[]): J => ({ type: "bulletList", content: items });
const ol = (start: number, ...items: J[]): J => ({ type: "orderedList", attrs: { start, type: null }, content: items });
const rich = (...content: J[]): J => ({ type: "doc", content });
const bold: J = { type: "bold" };
const italic: J = { type: "italic" };
const link = (href: string): J => ({ type: "link", attrs: { href, target: null, rel: "noopener noreferrer nofollow", class: null } });

const doc = (title: string, sections: J[], description?: string): J =>
  description === undefined ? { schemaVersion: 1, title, sections } : { schemaVersion: 1, title, description, sections };

// --- the base page: every widget type, with style overrides ----------------------
function landing(): J {
  return doc("Slack Water swimming club", [
    section("hero", [
      column("hero-1", [
        heading("hero-heading", 1, "Swim at slack water", { base: { textSize: "display", color: "primary" }, phone: { textSize: "heading-1" } }),
        text("hero-text", rich(p(
          t("Dawn swims, "), t("beginners’ courses", [bold]), t(" and a "), t("winter series", [link("/winter-series")]),
          br(), t("timed to the one quiet hour the tide gives us.", [italic]),
        ))),
        button("hero-button", "Join a trial swim", "#join", { base: { background: "accent", color: "text" } }),
      ], { base: { spaceInside: "none", spaceBetween: "l" }, tablet: { spaceInside: "l" } }),
      column("hero-2", [
        image("hero-image", { mediaId: "hero-dawn", alt: "The bay at dawn at slack water, with a line of buoys and three swimmers" }),
      ]),
    ], { label: "Hero", anchor: "top" }, { base: { background: "soft", sectionSpace: "section-l" }, phone: { sectionSpace: "section-s" } }),
    section("swims", [
      column("swims-1", [iconbox("swims-dawn", "sunrise", "Dawn swims", "Twice a week, at first light, when the bay is flat.")]),
      column("swims-2", [iconbox("swims-course", "buoys", "Beginners’ course", "Four sessions from the shallows to the buoy line.")]),
      column("swims-3", [iconbox("swims-winter", "cup", "Winter series", "Short, cold, and followed by very hot tea.")]),
    ], { anchor: "swims" }),
    section("gallery", [
      column("gallery-1", [
        heading("gallery-heading", 2, "From the water"),
        gallery("gallery-images", [
          { mediaId: "g-horizon", alt: "A flat horizon at first light" },
          { mediaId: "g-caps", alt: "Three swim caps at the waterline" },
          { url: "https://images.example.org/bay/buoys.jpg", alt: "The buoy line across the bay" },
          { mediaId: "g-wake", decorative: true },
        ]),
      ]),
    ], { anchor: "gallery" }),
    section("meet", [
      column("meet-1", [
        heading("meet-heading", 2, "See the bay before you join"),
        video("meet-video", "youtube", "Xk3d9Lp0qWe", "Watch a dawn swim"),
      ], { base: { verticalAlign: "bottom" } }),
      column("meet-2", [
        text("meet-text", rich(
          p(t("We meet twenty minutes before slack water. Bring:")),
          ul(li(p(t("a bright cap")), ol(1, li(p(t("goggles"))), li(p(t("something warm"))))), li(p(t("a towel")))),
        )),
        map("meet-map", 54.4851, -0.6157, 15, "Meeting point: the slipway at the north end of the beach"),
      ]),
    ], { anchor: "meet" }),
    section("quote", [
      column("quote-1", [quote("quote-text", "I came for the cold water and stayed for the tea.", "A member since last winter")]),
      column("quote-2", [image("quote-image", { url: "https://images.example.org/bay/tea.jpg", alt: "A flask and two cups of tea on a rock after a swim" })]),
    ], {}, { base: {}, tablet: { visibility: "hidden" } }),
    section("questions", [
      column("questions-1", [
        heading("questions-heading", 2, "Before your first swim"),
        text("questions-text", rich(p(t("Ask us anything at the slipway, or "), t("send a request", [link("#join")]), t(".")))),
      ]),
      column("questions-2", [
        accordion("questions-list", [
          { question: "How cold is it?", answer: "Between 8 and 18 degrees depending on the month.\nWe shorten swims in winter." },
          { question: "Do I need a wetsuit?", answer: "No. Many members swim without one; the course covers both." },
          { question: "What if the sea is rough?", answer: "We cancel by 6 am and post it on this page." },
        ]),
      ]),
    ], { anchor: "questions" }),
    section("join", [
      column("join-1", [
        divider("join-divider"),
        spacer("join-spacer", "l"),
        button("join-button", "Write to us", "mailto:hello@slackwater.example?subject=Trial%20swim"),
      ]),
    ], { anchor: "join" }),
  ], "Dawn swims, beginners’ courses and a winter series, timed to slack water.");
}

// --- pointers -------------------------------------------------------------------
function pointerOfId(d: J, id: string): string {
  const walk = (list: J[], base: string): string | null => {
    for (let k = 0; k < list.length; k++) {
      const here = `${base}/${k}`;
      if (list[k].id === id) return here;
      const found = walk(list[k].children ?? [], `${here}/children`);
      if (found) return found;
    }
    return null;
  };
  const found = walk(d.sections, "/sections");
  if (!found) throw new Error(`no block ${id}`);
  return found;
}
function at(d: J, pointer: string): J {
  let cur = d;
  for (const seg of pointer.split("/").slice(1)) {
    cur = cur[seg.replace(/~1/g, "/").replace(/~0/g, "~")];
    if (cur === undefined) throw new Error(`nothing at ${pointer}`);
  }
  return cur;
}
const BASE = landing();
const P = (id: string): string => pointerOfId(BASE, id);
const HERO = P("hero");
const COL = P("hero-1");
const H = P("hero-heading");
const TXT = P("hero-text");
const BTN = P("hero-button");
const IMG = P("hero-image");
const ICON = P("swims-dawn");
const GAL = P("gallery-images");
const VID = P("meet-video");
const LIST = P("meet-text");
const MAP = P("meet-map");
const QUOTE = P("quote-text");
const QIMG = P("quote-image");
const ACC = P("questions-list");
const DIV = P("join-divider");
const SPC = P("join-spacer");

// --- output ---------------------------------------------------------------------
interface ValidEntry { rule: string }
interface InvalidEntry { rule: string; pointer: string; keyword: string; layer: "rules" | "schema" }
const manifest: Record<string, ValidEntry | InvalidEntry> = {};
const files = new Map<string, Uint8Array>();

const encoder = new TextEncoder();
const serialise = (d: J): string => JSON.stringify(d, null, 2) + "\n";

function add(name: string, bytes: Uint8Array, entry: ValidEntry | InvalidEntry): void {
  if (files.has(name)) throw new Error(`duplicate corpus file ${name}`);
  files.set(name, bytes);
  manifest[name] = entry;
}
function valid(name: string, rule: string, d: J): void {
  add(`valid/${name}.json`, encoder.encode(serialise(d)), { rule });
}
function invalidEntry(rule: string, pointer: string, keyword: string): InvalidEntry {
  return { rule, pointer, keyword, layer: RULE_KEYWORDS.has(keyword) ? "rules" : "schema" };
}
// One change to the base page.
function invalid(name: string, rule: string, pointer: string, keyword: string, mutate: (d: J) => void): void {
  const d = structuredClone(BASE);
  mutate(d);
  add(`invalid/${name}.json`, encoder.encode(serialise(d)), invalidEntry(rule, pointer, keyword));
}
// One change that JSON.stringify cannot write: `mutate` puts the string
// "__RAW__" where the raw text goes (a value, or a member "__RAW__": 0).
function invalidRaw(name: string, rule: string, pointer: string, keyword: string, mutate: (d: J) => void, raw: string | Uint8Array): void {
  const d = structuredClone(BASE);
  mutate(d);
  const s = serialise(d);
  const needle = s.includes('"__RAW__": 0') ? '"__RAW__": 0' : '"__RAW__"';
  const parts = s.split(needle);
  if (parts.length !== 2) throw new Error(`${name}: placeholder found ${parts.length - 1} times`);
  const rawBytes = typeof raw === "string" ? encoder.encode(raw) : raw;
  const before = encoder.encode(parts[0] as string);
  const after = encoder.encode(parts[1] as string);
  const out = new Uint8Array(before.length + rawBytes.length + after.length);
  out.set(before, 0);
  out.set(rawBytes, before.length);
  out.set(after, before.length + rawBytes.length);
  add(`invalid/${name}.json`, out, invalidEntry(rule, pointer, keyword));
}
const bytes = (...b: number[]): Uint8Array => Uint8Array.from(b);
const concat = (...parts: Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(parts.reduce((n, x) => n + x.length, 0));
  let o = 0;
  for (const x of parts) {
    out.set(x, o);
    o += x.length;
  }
  return out;
};

// =============================== VALID =========================================
valid("landing", "the base page: every widget type, style overrides on every device; each invalid file changes one thing in it", BASE);
valid("minimal", "the smallest document: no description, no sections", doc("New page", []));
valid("readme-example", "the example in schema/README.md, checked by the lint", doc("Winter series", [
  section("s1", [column("s1c1", [heading("h1", 1, "Winter series", { base: { textSize: "display" }, phone: { textSize: "heading-1" } })])]),
], "Short, cold swims from November to March."));
valid("columns-one-to-four", "sections with one, two, three and four columns, and an empty column", doc("Columns", [
  section("one", [column("one-1", [heading("one-h", 2, "One column")])]),
  section("two", [column("two-1", []), column("two-2", [spacer("two-s", "xxl")])]),
  section("three", [column("three-1", []), column("three-2", []), column("three-3", [divider("three-d")])]),
  section("four", [column("four-1", []), column("four-2", []), column("four-3", []), column("four-4", [heading("four-h", 4, "Four")])]),
]));
valid("image-sources", "library image, external https image, site path, decorative image without alt", doc("Images", [
  section("imgs", [column("imgs-1", [
    image("img-library", { mediaId: "M_01-x", alt: "A library image" }),
    image("img-external", { url: "https://cdn.example.net:8443/a/b.png?w=800&h=600#x", alt: "An external image" }),
    image("img-path", { url: "/media/2026/10/photo.jpg", alt: "An image on this site" }),
    image("img-decorative", { mediaId: "rule-wave", decorative: true }),
    image("img-decorative-url", { url: "https://cdn.example.net/wave.svg", decorative: true }),
  ])]),
]));
valid("hrefs-every-form", "every link form the href pattern allows", doc("Links", [
  section("links", [column("links-1", [
    button("l-https", "https", "https://example.com/a/b?q=1&r=two#top"),
    button("l-http-port", "http with a port", "http://localhost:8080/"),
    button("l-host-only", "host only", "https://example.com"),
    button("l-mailto", "mailto", "mailto:sales@example.com?subject=Hi%20there"),
    button("l-tel", "tel", "tel:+39-06-1234567"),
    button("l-path", "site path", "/pricing/plans?ref=hero"),
    button("l-root", "root", "/"),
    button("l-query", "query", "?page=2"),
    button("l-fragment", "fragment", "#contact"),
    button("l-percent", "percent-encoded", "https://example.com/caf%C3%A9"),
    button("l-subdomain", "subdomains and hyphens", "https://a-b.c-d.example.co.uk/x_y~z"),
  ])]),
]));
valid("heading-link", "a heading may carry a link, as in the approved mock", doc("Heading link", [
  section("hl", [column("hl-1", [block("hl-h", "heading", { level: 2, text: "Read the rules", href: "/rules" })])]),
]));
valid("rich-text", "the rich-text subset: nested lists three deep, every mark, hard break with marks, empty paragraph, numbered list attrs", doc("Rich text", [
  section("rt", [column("rt-1", [text("rt-text", rich(
    p(t("Plain, "), t("bold", [bold]), t(", "), t("italic", [italic]), t(", "), t("both", [bold, italic]), t(" and "), t("a link", [link("https://example.com/")]), t(".")),
    p(),
    p(t("Line one"), br([bold]), t("line two")),
    ul(li(p(t("one")), ul(li(p(t("one.a")), ol(3, li(p(t("one.a.iii"))), li(p(t("one.a.iv"))))))), li(p(t("two", [link("mailto:hello@example.com")])), p(t("a second paragraph in the item")))),
    ol(1, li(p(t("first"))), li(p(t("second")))),
  ))])]),
]));
valid("styles-every-token", "every style key and token value, with tablet and phone overrides", doc("Styles", [
  section("st", [
    column("st-1", [
      heading("st-h-display", 1, "Display", { base: { textSize: "display", color: "primary", align: "left" } }),
      heading("st-h-1", 2, "Heading 1", { base: { textSize: "heading-1", color: "text" }, tablet: { align: "center" }, phone: { align: "right" } }),
      heading("st-h-2", 2, "Heading 2", { base: { textSize: "heading-2", color: "accent" } }),
      heading("st-h-3", 3, "Heading 3", { base: { textSize: "heading-3", color: "muted" } }),
      text("st-t-large", rich(p(t("Large"))), { base: { textSize: "large", color: "background" } }),
      text("st-t-body", rich(p(t("Body"))), { base: { textSize: "body", color: "soft" } }),
      text("st-t-small", rich(p(t("Small"))), { base: { textSize: "small" }, phone: { visibility: "hidden" } }),
      button("st-b", "Primary", "/go", { base: { background: "primary", color: "background" }, phone: { background: "none" } }),
    ], {
      base: { background: "none", spaceInside: "xs", spaceBetween: "s", textSize: "body", color: "text", align: "left", verticalAlign: "top", visibility: "visible" },
      tablet: { spaceInside: "m", spaceBetween: "xl", verticalAlign: "middle" },
      phone: { spaceInside: "xxl", spaceBetween: "none", align: "center", verticalAlign: "bottom" },
    }),
    column("st-2", [
      divider("st-d"),
      gallery("st-g", [{ mediaId: "a", alt: "A" }]),
      accordion("st-a", [{ question: "Q?", answer: "A." }]),
      iconbox("st-i", "info", "Info", "Text."),
      quote("st-q", "Quoted."),
    ].map((w: J) => ({ ...w, style: { base: { visibility: "visible" } } }))),
  ], {}, { base: { background: "primary", sectionSpace: "section-s", spaceBetween: "m" }, tablet: { background: "muted" }, phone: { visibility: "hidden" } }),
]));
valid("every-icon-and-provider", "every icon name, both video providers, map extremes", doc("Icons", [
  section("ic", [column("ic-1", [
    ...["sunrise", "buoys", "cup", "calendar", "clock", "pin", "globe", "info"].map((icon) => iconbox(`ic-${icon}`, icon, icon, `The ${icon} icon.`)),
    video("ic-youtube", "youtube", "A_b-C1d2E3f", "A video"),
    video("ic-vimeo", "vimeo", "123456789", "Another video"),
    map("ic-map-north", 90, 180, 19, "North-east corner"),
    map("ic-map-south", -90, -180, 1, "South-west corner"),
  ])]),
]));
valid("ids-edge", "ids: 64 characters, digits only, underscores and hyphens", doc("Ids", [
  section("_", [column("0123456789", [heading("a".repeat(64), 2, "Ids"), heading("A-b_C-9", 2, "More ids")])]),
]));
valid("unicode-text", "non-ASCII text in every plain-text field and in rich text", doc("Città ٣٤٥ 東京 עברית", [
  section("uni", [column("uni-1", [
    heading("uni-h", 2, "Ñandú, Ελλάδα, 日本語, العربية"),
    text("uni-t", rich(p(t("À bientôt — 👋 "), t("emoji: 👨‍👩‍👧‍👦", [bold])))),
    image("uni-i", { mediaId: "uni", alt: "Caffè ☕ e cornetto" }),
    button("uni-b", "Più info", "/info"),
    quote("uni-q", "«Il mare d’inverno»\nnon è un concetto.", "Anonimo"),
    accordion("uni-a", [{ question: "¿Qué?", answer: "Ça va." }]),
    iconbox("uni-ib", "globe", "Ünïcödé", "Ẅïth ẗrëmäs."),
    map("uni-m", 35.6812, 139.7671, 12, "東京駅"),
  ])]),
], "Ünïcödé désçription"));
valid("text-length-emoji-at-max", "200 emoji in a heading: 200 code points (400 UTF-16 units), maxLength 200", doc("Emoji", [
  section("em", [column("em-1", [heading("em-h", 2, "😀".repeat(200))])]),
]));
valid("text-length-combining-at-max", "100 times e + U+0301: 200 code points, 100 visible letters, maxLength 200", doc("Combining", [
  section("cm", [column("cm-1", [heading("cm-h", 2, "é".repeat(100))])]),
]));
valid("text-inner-nbsp", "a no-break space inside text with visible letters is fine; only all-blank text is refused", doc("Nbsp", [
  section("nb", [column("nb-1", [image("nb-i", { mediaId: "nb", alt: "A photo" }), heading("nb-h", 2, " Leading no-break space")])]),
]));
{
  // Integral floats: valid in both engines, and normalised to integers.
  const d = doc("Integral floats", [
    section("fl", [column("fl-1", [
      heading("fl-h", 2, "Level written as 2.0"),
      map("fl-m", 45, -0.5, 12, "Zoom written as 12.0"),
      text("fl-t", rich(ol(3, li(p(t("starts at 3.0")))))),
    ])]),
  ]);
  const s = serialise(d)
    .replace('"level": 2', '"level": 2.0')
    .replace('"latitude": 45', '"latitude": 45.0')
    .replace('"longitude": -0.5', '"longitude": -0.5e0')
    .replace('"zoom": 12', '"zoom": 1.2e1')
    .replace('"start": 3', '"start": 3.000');
  for (const lit of ["2.0", "45.0", "-0.5e0", "1.2e1", "3.000"]) if (!s.includes(lit)) throw new Error(`integral-floats: ${lit} missing`);
  add("valid/integral-floats.json", encoder.encode(s), {
    rule: "2.0, 45.0, 1.2e1 and 3.000 are integers to both engines; the rules turn them into integers, so Ruby renders <h2>, not <h2.0>",
  });
}
{
  // Escapes the parsers must read the same way, including an escaped member name.
  const d = doc("Escapes", [section("esc", [column("esc-1", [text("esc-t", rich(p(t("__RAW__"))))])])]);
  const s = serialise(d)
    .replace('"__RAW__"', String.raw`"quote \" backslash \\ slash \/ e-acute é emoji 😀"`)
    .replace('"type": "doc"', String.raw`"type": "doc"`);
  add("valid/string-escapes.json", encoder.encode(s), {
    rule: "JSON escapes, a surrogate pair written as two escapes, and a member name written with an escape (\\u0074ype is type)",
  });
}
{
  // Rich text nested to exactly MAX_NESTING levels of JSON.
  const deepList = (levels: number, marks?: J[]): J => {
    let inner: J = ul(li(p(t("deepest", marks))));
    for (let k = 1; k < levels; k++) inner = ul(li(p(t(`level ${k}`)), inner));
    return inner;
  };
  const atLimit = doc("Deep lists", [section("dl", [column("dl-1", [text("dl-t", rich(deepList(12, [link("/deep")])))])])]);
  if (jsonDepth(atLimit) !== MAX_NESTING) throw new Error(`deep list at limit has depth ${jsonDepth(atLimit)}`);
  valid("nesting-at-limit", `rich text with 12 nested lists: exactly ${MAX_NESTING} levels of JSON nesting, the most the rules allow`, atLimit);
  const over = doc("Deep lists", [section("dl", [column("dl-1", [text("dl-t", rich(deepList(13)))])])]);
  if (jsonDepth(over) !== MAX_NESTING + 1) throw new Error(`deep list over limit has depth ${jsonDepth(over)}`);
  add("invalid/nesting-over-limit.json", encoder.encode(serialise(over)), invalidEntry(
    `rich text with 13 nested lists: ${MAX_NESTING + 1} levels of JSON nesting`, firstTooDeep(over), "maxNesting"));
}
{
  // 500 blocks: 20 sections, each with 4 columns of 5 widgets.
  const kinds = [
    (id: string) => heading(id, 2, `Heading ${id}`),
    (id: string) => text(id, rich(p(t(`Paragraph ${id} with `), t("bold", [bold]), t(" and a "), t("link", [link(`/p/${id}`)])))),
    (id: string) => image(id, { mediaId: `m-${id}`, alt: `Image ${id}` }),
    (id: string) => button(id, `Go ${id}`, `/go/${id}`),
    (id: string) => iconbox(id, "pin", `Box ${id}`, "Text."),
  ];
  const sections: J[] = [];
  for (let s = 0; s < 20; s++) {
    sections.push(section(`s${s}`, [0, 1, 2, 3].map((c) => column(`s${s}c${c}`, kinds.map((make, w) => make(`s${s}c${c}w${w}`))))));
  }
  const d = doc("Five hundred blocks", sections);
  const count = (list: J[]): number => list.reduce((n: number, b: J) => n + 1 + count(b.children), 0);
  if (count(d.sections) !== 500) throw new Error(`large document has ${count(d.sections)} blocks`);
  valid("large-500-blocks", "exactly 500 blocks: 20 sections of 4 columns of 5 widgets", d);
}

// =============================== INVALID: document ==============================
invalid("doc-missing-schema-version", "schemaVersion is required", "", "required", (d) => { delete d.schemaVersion; });
invalid("doc-schema-version-2", "schemaVersion is 1", "/schemaVersion", "const", (d) => { d.schemaVersion = 2; });
invalid("doc-schema-version-string", "schemaVersion is the number 1, not the string", "/schemaVersion", "const", (d) => { d.schemaVersion = "1"; });
invalid("doc-extra-key", "the document is closed: the address is not part of it", "/slug", "additionalProperties", (d) => { d.slug = "home"; });
invalid("doc-proto-key", "a member named __proto__ is an ordinary unknown member to both engines", "/__proto__", "additionalProperties", (d) => {
  Object.defineProperty(d, "__proto__", { value: { polluted: true }, enumerable: true, configurable: true, writable: true });
});
invalid("doc-title-missing", "title is required", "", "required", (d) => { delete d.title; });
invalid("doc-title-blank", "title has a visible character", "/title", "pattern", (d) => { d.title = "   "; });
invalid("doc-title-newline", "title is one line", "/title", "not", (d) => { d.title = "Slack Water\nswimming club"; });
invalid("doc-description-too-long", "description is at most 160 characters", "/description", "maxLength", (d) => { d.description = "x".repeat(161); });
invalid("doc-description-empty", "an empty description is left out, not stored", "/description", "pattern", (d) => { d.description = ""; });
invalid("doc-sections-object", "sections is an array", "/sections", "type", (d) => { d.sections = {}; });
add("invalid/doc-top-level-array.json", encoder.encode(serialise([BASE])), invalidEntry("the document is an object", "", "type"));

// =============================== INVALID: blocks ================================
invalid("block-extra-key", "a block has exactly five keys", `${H}/parentId`, "additionalProperties", (d) => { at(d, H).parentId = "hero-1"; });
invalid("block-missing-style", "style is required on every block", H, "required", (d) => { delete at(d, H).style; });
invalid("block-missing-props", "props is required on every block", DIV, "required", (d) => { delete at(d, DIV).props; });
invalid("block-props-null", "props is an object", `${DIV}/props`, "type", (d) => { at(d, DIV).props = null; });
invalid("block-children-null", "children is an array", `${DIV}/children`, "type", (d) => { at(d, DIV).children = null; });
invalid("block-type-unknown", "type is one of the known block types", `${DIV}/type`, "enum", (d) => { at(d, DIV).type = "carousel"; });
invalid("block-type-missing", "type is required", DIV, "required", (d) => { delete at(d, DIV).type; });
invalid("block-type-number", "type is a string from the list", `${DIV}/type`, "enum", (d) => { at(d, DIV).type = 3; });
invalid("block-id-trailing-newline", "^...$ must not let a trailing newline through (Ruby's $ would)", `${H}/id`, "pattern", (d) => { at(d, H).id = "hero-heading\n"; });
invalid("block-id-arabic-digits", "ids are ASCII: Arabic-Indic digits are not [0-9]", `${H}/id`, "pattern", (d) => { at(d, H).id = "٣٤٥"; });
invalid("block-id-fullwidth", "ids are ASCII: fullwidth letters are not [A-Za-z]", `${H}/id`, "pattern", (d) => { at(d, H).id = "ｈｅｒｏ"; });
invalid("block-id-non-ascii-letter", "ids are ASCII", `${H}/id`, "pattern", (d) => { at(d, H).id = "blöck"; });
invalid("block-id-empty", "ids have 1 to 64 characters", `${H}/id`, "pattern", (d) => { at(d, H).id = ""; });
invalid("block-id-too-long", "ids have 1 to 64 characters", `${H}/id`, "pattern", (d) => { at(d, H).id = "a".repeat(65); });
invalid("block-id-space", "ids have no spaces", `${H}/id`, "pattern", (d) => { at(d, H).id = "hero heading"; });
invalid("block-id-number", "ids are strings", `${H}/id`, "type", (d) => { at(d, H).id = 7; });
invalid("block-id-duplicate", "block ids are unique across the page (a rule: the schema cannot say it)", `${SPC}/id`, "uniqueId", (d) => { at(d, SPC).id = "join-divider"; });
invalid("block-id-duplicate-across-sections", "a widget may not reuse a section's id", `${H}/id`, "uniqueId", (d) => {
  // The section comes first in document order, so the heading is the repeat.
  at(d, H).id = "hero";
});

// =============================== INVALID: hierarchy =============================
invalid("tree-widget-in-section", "a section holds columns only", `${HERO}/children/2/type`, "const", (d) => { at(d, HERO).children.push(heading("stray", 2, "Stray")); });
invalid("tree-section-in-column", "a column holds widgets only", `${COL}/children/3/type`, "enum", (d) => {
  at(d, COL).children.push(section("nested-section", [column("nested-col", [])]));
});
invalid("tree-column-in-column", "columns do not nest", `${COL}/children/3/type`, "enum", (d) => { at(d, COL).children.push(column("nested-col", [])); });
invalid("tree-section-at-column-level", "the page holds sections only", "/sections/7/type", "const", (d) => { d.sections.push(column("loose-col", [])); });
invalid("tree-section-no-columns", "a section has at least one column", `${HERO}/children`, "minItems", (d) => { at(d, HERO).children = []; });
invalid("tree-section-five-columns", "a section has at most four columns", `${HERO}/children`, "maxItems", (d) => {
  at(d, HERO).children.push(column("c3", []), column("c4", []), column("c5", []));
});
invalid("tree-heading-with-children", "widgets hold no blocks", `${H}/children`, "maxItems", (d) => { at(d, H).children.push(text("child", rich(p(t("x"))))); });
invalid("tree-column-props", "a column has no properties: its width follows from the count", `${COL}/props/width`, "additionalProperties", (d) => { at(d, COL).props.width = 50; });
invalid("tree-section-anchor", "anchors are lowercase letters, digits and hyphens", `${HERO}/props/anchor`, "pattern", (d) => { at(d, HERO).props.anchor = "Join Us"; });
invalid("tree-section-label-too-long", "a section label has at most 60 characters", `${HERO}/props/label`, "maxLength", (d) => { at(d, HERO).props.label = "x".repeat(61); });
invalid("tree-section-unknown-prop", "section props are closed", `${HERO}/props/columns`, "additionalProperties", (d) => { at(d, HERO).props.columns = 2; });

// =============================== INVALID: style =================================
invalid("style-null-value", "an absent key means inherit; null is not a value", `${HERO}/style/base/background`, "enum", (d) => { at(d, HERO).style.base.background = null; });
invalid("style-unknown-token", "values are token names", `${COL}/style/base/spaceInside`, "enum", (d) => { at(d, COL).style.base.spaceInside = "huge"; });
invalid("style-pixel-value", "block settings never use pixels", `${COL}/style/base/spaceInside`, "enum", (d) => { at(d, COL).style.base.spaceInside = 24; });
invalid("style-tone-not-slot", "blocks name palette slots, not tones", `${H}/style/base/color`, "enum", (d) => { at(d, H).style.base.color = "site-sea"; });
invalid("style-key-not-for-type", "a divider has no text size", `${DIV}/style/base/textSize`, "additionalProperties", (d) => { at(d, DIV).style.base.textSize = "large"; });
invalid("style-unknown-key", "no free CSS: only the listed settings", `${H}/style/base/fontFamily`, "additionalProperties", (d) => { at(d, H).style.base.fontFamily = "Archivo"; });
invalid("style-empty-override", "an override with nothing in it is not stored", `${COL}/style/phone`, "minProperties", (d) => { at(d, COL).style.phone = {}; });
invalid("style-desktop-key", "desktop is base: there is no desktop key", `${H}/style/desktop`, "additionalProperties", (d) => { at(d, H).style.desktop = { textSize: "body" }; });
invalid("style-missing-base", "base is required", `${H}/style`, "required", (d) => { delete at(d, H).style.base; });
invalid("style-override-null", "a removed override is absent, not null", `${H}/style/phone`, "type", (d) => { at(d, H).style.phone = null; });

// =============================== INVALID: heading ===============================
invalid("heading-level-5", "levels are 1 to 4", `${H}/props/level`, "maximum", (d) => { at(d, H).props.level = 5; });
invalid("heading-level-0", "levels are 1 to 4", `${H}/props/level`, "minimum", (d) => { at(d, H).props.level = 0; });
invalid("heading-level-string", "the level is a number", `${H}/props/level`, "type", (d) => { at(d, H).props.level = "2"; });
invalid("heading-level-fraction", "2.5 is not an integer", `${H}/props/level`, "type", (d) => { at(d, H).props.level = 2.5; });
invalidRaw("heading-level-1e400", "1e400 reads as Infinity in both languages, and json_schemer raises on it (a rule)", `${H}/props/level`, "finite",
  (d) => { at(d, H).props.level = "__RAW__"; }, "1e400");
invalidRaw("heading-level-huge-integer", "a 20-digit integer is exact in Ruby and rounded in JavaScript (a rule)", `${H}/props/level`, "safeInteger",
  (d) => { at(d, H).props.level = "__RAW__"; }, "12345678901234567890");
invalid("heading-text-blank", "text has a visible character", `${H}/props/text`, "pattern", (d) => { at(d, H).props.text = "   "; });
invalid("heading-text-empty", "text has a visible character", `${H}/props/text`, "pattern", (d) => { at(d, H).props.text = ""; });
invalid("heading-text-nbsp-only", "no-break spaces are blank (Ruby's \\S would call them visible)", `${H}/props/text`, "pattern", (d) => { at(d, H).props.text = "  "; });
invalid("heading-text-line-separator-only", "U+2028 is blank (json_schemer's \\s leaves it out)", `${H}/props/text`, "pattern", (d) => { at(d, H).props.text = " "; });
invalid("heading-text-zero-width-only", "zero-width spaces are blank", `${H}/props/text`, "pattern", (d) => { at(d, H).props.text = "​​"; });
invalid("heading-text-newline", "a heading is one line", `${H}/props/text`, "not", (d) => { at(d, H).props.text = "Swim at\nslack water"; });
invalid("heading-text-emoji-over-max", "201 emoji: 201 code points > maxLength 200", `${H}/props/text`, "maxLength", (d) => { at(d, H).props.text = "😀".repeat(201); });
invalid("heading-text-combining-over-max", "100 visible letters but 201 code points > 200", `${H}/props/text`, "maxLength", (d) => { at(d, H).props.text = "é".repeat(100) + "x"; });
invalid("heading-href-javascript", "a heading link follows the link rules", `${H}/props/href`, "pattern", (d) => { at(d, H).props.href = "javascript:alert(1)"; });
invalid("heading-props-extra", "heading props are closed", `${H}/props/color`, "additionalProperties", (d) => { at(d, H).props.color = "red"; });
invalidRaw("heading-text-lone-surrogate", "a lone high surrogate: Ruby's parser refuses it, JavaScript's reads it (a rule)", `${H}/props/text`, "wellFormed",
  (d) => { at(d, H).props.text = "__RAW__"; }, String.raw`"Swim \ud83d at slack water"`);
invalidRaw("heading-text-lone-low-surrogate", "a lone low surrogate (a rule)", `${H}/props/text`, "wellFormed",
  (d) => { at(d, H).props.text = "__RAW__"; }, String.raw`"Swim \udc00 at slack water"`);

// =============================== INVALID: text (rich text) ======================
const RUN = `${TXT}/props/doc/content/0/content`;
invalid("text-heading-node", "no headings inside rich text: the heading widget does that", `${TXT}/props/doc/content/1/type`, "enum", (d) => {
  at(d, TXT).props.doc.content.push({ type: "heading", attrs: { level: 2 }, content: [t("x")] });
});
invalid("text-underline-mark", "marks are bold, italic and link only", `${RUN}/1/marks/0/type`, "enum", (d) => { at(d, RUN)[1].marks = [{ type: "underline" }]; });
invalid("text-link-javascript", "a link mark follows the link rules", `${RUN}/3/marks/0/attrs/href`, "pattern", (d) => { at(d, RUN)[3].marks[0].attrs.href = "javascript:alert(document.cookie)"; });
invalid("text-link-data", "no data: links", `${RUN}/3/marks/0/attrs/href`, "pattern", (d) => {
  at(d, RUN)[3].marks[0].attrs.href = "data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==";
});
invalid("text-link-newline-then-https", "the line-anchor trap: a second line that would satisfy ^https:// in Ruby", `${RUN}/3/marks/0/attrs/href`, "not", (d) => {
  at(d, RUN)[3].marks[0].attrs.href = "javascript:alert(1)\nhttps://ok.example/";
});
invalid("text-link-without-attrs", "a link mark has attrs with href", `${RUN}/3/marks/0`, "required", (d) => { delete at(d, RUN)[3].marks[0].attrs; });
invalid("text-empty-text-node", "text nodes are never empty", `${RUN}/0/text`, "minLength", (d) => { at(d, RUN)[0].text = ""; });
invalid("text-node-without-text", "a text node has text", `${RUN}/0`, "required", (d) => { delete at(d, RUN)[0].text; });
invalid("text-control-character", "no control characters in text", `${RUN}/0/text`, "not", (d) => { at(d, RUN)[0].text = "Dawn\u0007 swims, "; });
invalid("text-paragraph-attrs", "paragraphs have no attributes in the subset", `${TXT}/props/doc/content/0/attrs`, "additionalProperties", (d) => {
  at(d, TXT).props.doc.content[0].attrs = { textAlign: "center" };
});
invalid("text-wrong-root", "the root node is doc", `${TXT}/props/doc/type`, "const", (d) => { at(d, TXT).props.doc.type = "document"; });
invalid("text-empty-doc", "a doc has at least one node", `${TXT}/props/doc/content`, "minItems", (d) => { at(d, TXT).props.doc.content = []; });
invalid("text-list-item-starts-with-list", "a list item starts with a paragraph", `${LIST}/props/doc/content/1/content/0/content/0/type`, "const", (d) => {
  at(d, LIST).props.doc.content[1].content[0].content = [ul(li(p(t("orphan"))))];
});
invalid("text-ordered-start-zero", "a numbered list starts at 1 or later", `${LIST}/props/doc/content/1/content/0/content/1/attrs/start`, "minimum", (d) => {
  at(d, LIST).props.doc.content[1].content[0].content[1].attrs.start = 0;
});

// =============================== INVALID: image =================================
invalid("image-missing-alt", "alt is required unless the image is decorative", `${IMG}/props`, "required", (d) => { delete at(d, IMG).props.alt; });
invalid("image-alt-blank", "alt has a visible character", `${IMG}/props/alt`, "pattern", (d) => { at(d, IMG).props.alt = "   "; });
invalid("image-alt-nbsp-only", "no-break spaces are blank", `${IMG}/props/alt`, "pattern", (d) => { at(d, IMG).props.alt = " "; });
invalid("image-alt-line-separator-only", "U+2028 alone is blank", `${IMG}/props/alt`, "pattern", (d) => { at(d, IMG).props.alt = " "; });
invalid("image-alt-and-decorative", "a decorative image has no alt text", `${IMG}/props`, "not", (d) => { at(d, IMG).props.decorative = true; });
invalid("image-decorative-false", "decorative is stored only as true", `${IMG}/props/decorative`, "const", (d) => {
  const props = at(d, IMG).props;
  delete props.alt;
  props.decorative = false;
});
invalid("image-two-sources", "an image is from the library or from a URL, never both", `${IMG}/props`, "not", (d) => { at(d, IMG).props.url = "https://images.example.org/a.jpg"; });
invalid("image-no-source", "an image has a source", `${IMG}/props`, "required", (d) => { delete at(d, IMG).props.mediaId; });
invalid("image-media-id-path", "a media id is an id, not a path", `${IMG}/props/mediaId`, "pattern", (d) => { at(d, IMG).props.mediaId = "../etc/passwd"; });
invalid("image-props-extra", "image props are closed", `${IMG}/props/width`, "additionalProperties", (d) => { at(d, IMG).props.width = 800; });
const QURL = `${QIMG}/props/url`;
invalid("image-url-javascript", "no javascript: images", QURL, "pattern", (d) => { at(d, QIMG).props.url = "javascript:alert(1)"; });
invalid("image-url-data", "no data: images", QURL, "pattern", (d) => { at(d, QIMG).props.url = "data:image/png;base64,iVBORw0KGgo="; });
invalid("image-url-http", "external images are https: http would be mixed content", QURL, "pattern", (d) => { at(d, QIMG).props.url = "http://images.example.org/tea.jpg"; });
invalid("image-url-protocol-relative", "no //host addresses", QURL, "pattern", (d) => { at(d, QIMG).props.url = "//evil.example/tea.jpg"; });
invalid("image-url-backslash", "browsers read /\\host as //host", QURL, "pattern", (d) => { at(d, QIMG).props.url = "/\\evil.example/tea.jpg"; });
invalid("image-url-newline", "a newline in a URL is caught by the unanchored check", QURL, "not", (d) => {
  at(d, QIMG).props.url = "https://images.example.org/tea.jpg\njavascript:alert(1)";
});
invalid("image-url-userinfo", "no user info: the host would be evil.example", QURL, "pattern", (d) => { at(d, QIMG).props.url = "https://images.example.org@evil.example/tea.jpg"; });

// =============================== INVALID: button ================================
const HREF = `${BTN}/props/href`;
invalid("button-href-javascript-mixed-case", "no javascript:, in any case", HREF, "pattern", (d) => { at(d, BTN).props.href = "JaVaScRiPt:alert(1)"; });
invalid("button-href-newline-then-https", "the line-anchor trap", HREF, "not", (d) => { at(d, BTN).props.href = "javascript:alert(1)\nhttps://ok.example"; });
invalid("button-href-trailing-newline", "Ruby's $ matches before a final newline", HREF, "not", (d) => { at(d, BTN).props.href = "https://example.com/\n"; });
invalid("button-href-leading-space", "browsers strip a leading space and run what follows", HREF, "pattern", (d) => { at(d, BTN).props.href = " javascript:alert(1)"; });
invalid("button-href-tab-in-scheme", "browsers drop a tab inside the scheme", HREF, "not", (d) => { at(d, BTN).props.href = "java\tscript:alert(1)"; });
invalid("button-href-vbscript", "no vbscript:", HREF, "pattern", (d) => { at(d, BTN).props.href = "vbscript:msgbox(1)"; });
invalid("button-href-data", "no data: links", HREF, "pattern", (d) => { at(d, BTN).props.href = "data:text/html,<script>alert(1)</script>"; });
invalid("button-href-tel-arabic-digits", "tel: digits are ASCII", HREF, "pattern", (d) => { at(d, BTN).props.href = "tel:٠١٢٣٤٥"; });
invalid("button-href-tel-fullwidth-digits", "tel: digits are ASCII", HREF, "pattern", (d) => { at(d, BTN).props.href = "tel:１２３４"; });
invalid("button-href-protocol-relative", "no //host links", HREF, "pattern", (d) => { at(d, BTN).props.href = "//evil.example/"; });
invalid("button-href-userinfo", "no user info", HREF, "pattern", (d) => { at(d, BTN).props.href = "https://example.com@evil.example/"; });
invalid("button-href-backslash", "browsers read /\\host as //host", HREF, "pattern", (d) => { at(d, BTN).props.href = "/\\evil.example"; });
invalid("button-href-space-in-host", "no spaces", HREF, "pattern", (d) => { at(d, BTN).props.href = "https://exa mple.com/"; });
invalid("button-label-missing", "a button has a label", `${BTN}/props`, "required", (d) => { delete at(d, BTN).props.label; });
invalid("button-label-too-long", "a label has at most 80 characters", `${BTN}/props/label`, "maxLength", (d) => { at(d, BTN).props.label = "x".repeat(81); });

// =============================== INVALID: divider, spacer =======================
invalid("divider-unknown-prop", "a divider has no props", `${DIV}/props/variant`, "additionalProperties", (d) => { at(d, DIV).props.variant = "dashed"; });
invalid("spacer-size-pixels", "the size is a spacing step, not pixels", `${SPC}/props/size`, "enum", (d) => { at(d, SPC).props.size = 24; });
invalid("spacer-size-unknown", "the size is a spacing step", `${SPC}/props/size`, "enum", (d) => { at(d, SPC).props.size = "xxxl"; });
invalid("spacer-size-missing", "a spacer has a size", `${SPC}/props`, "required", (d) => { delete at(d, SPC).props.size; });

// =============================== INVALID: gallery ===============================
invalid("gallery-no-items", "a gallery has at least one image", `${GAL}/props/items`, "minItems", (d) => { at(d, GAL).props.items = []; });
invalid("gallery-too-many-items", "a gallery has at most 24 images", `${GAL}/props/items`, "maxItems", (d) => {
  at(d, GAL).props.items = Array.from({ length: 25 }, (_, k) => ({ mediaId: `g${k}`, alt: `Image ${k}` }));
});
invalid("gallery-item-missing-alt", "every gallery image has alt text or is decorative", `${GAL}/props/items/0`, "required", (d) => { delete at(d, GAL).props.items[0].alt; });
invalid("gallery-item-url-javascript", "gallery URLs follow the image URL rules", `${GAL}/props/items/2/url`, "pattern", (d) => { at(d, GAL).props.items[2].url = "javascript:alert(1)"; });
invalid("gallery-item-two-sources", "one source per image", `${GAL}/props/items/0`, "not", (d) => { at(d, GAL).props.items[0].url = "https://images.example.org/a.jpg"; });

// =============================== INVALID: video =================================
invalid("video-provider-unknown", "providers come from a fixed list", `${VID}/props/provider`, "enum", (d) => { at(d, VID).props.provider = "dailymotion"; });
invalid("video-id-is-url", "a video is stored as an id, never as a URL", `${VID}/props/videoId`, "pattern", (d) => {
  at(d, VID).props.videoId = "https://www.youtube.com/watch?v=Xk3d9Lp0qWe";
});
invalid("video-youtube-id-short", "a YouTube id has 11 characters", `${VID}/props/videoId`, "pattern", (d) => { at(d, VID).props.videoId = "Xk3d9Lp0qW"; });
invalid("video-vimeo-id-letters", "a Vimeo id is digits", `${VID}/props/videoId`, "pattern", (d) => {
  at(d, VID).props.provider = "vimeo";
  at(d, VID).props.videoId = "123456789a";
});
invalid("video-url-prop", "no URL property: the renderer builds the address", `${VID}/props/url`, "additionalProperties", (d) => {
  at(d, VID).props.url = "https://www.youtube.com/embed/Xk3d9Lp0qWe";
});
invalid("video-title-missing", "the player needs an accessible name", `${VID}/props`, "required", (d) => { delete at(d, VID).props.title; });

// =============================== INVALID: map ===================================
invalid("map-latitude-91", "latitude is -90 to 90", `${MAP}/props/latitude`, "maximum", (d) => { at(d, MAP).props.latitude = 91; });
invalid("map-longitude-string", "coordinates are numbers", `${MAP}/props/longitude`, "type", (d) => { at(d, MAP).props.longitude = "-0.6157"; });
invalid("map-zoom-fraction", "zoom is an integer", `${MAP}/props/zoom`, "type", (d) => { at(d, MAP).props.zoom = 12.5; });
invalid("map-zoom-0", "zoom is 1 to 19", `${MAP}/props/zoom`, "minimum", (d) => { at(d, MAP).props.zoom = 0; });
invalid("map-zoom-20", "zoom is 1 to 19", `${MAP}/props/zoom`, "maximum", (d) => { at(d, MAP).props.zoom = 20; });
invalid("map-label-blank", "a map has a label", `${MAP}/props/label`, "pattern", (d) => { at(d, MAP).props.label = "  "; });
invalid("map-zoom-missing", "zoom is required", `${MAP}/props`, "required", (d) => { delete at(d, MAP).props.zoom; });
invalidRaw("map-latitude-minus-1e400", "-1e400 is -Infinity (a rule)", `${MAP}/props/latitude`, "finite", (d) => { at(d, MAP).props.latitude = "__RAW__"; }, "-1e400");
invalidRaw("map-zoom-1e300", "1e300 is an integer far beyond 2^53 (a rule)", `${MAP}/props/zoom`, "safeInteger", (d) => { at(d, MAP).props.zoom = "__RAW__"; }, "1e300");

// =============================== INVALID: icon box ==============================
invalid("iconbox-icon-unknown", "icons come from the project's set", `${ICON}/props/icon`, "enum", (d) => { at(d, ICON).props.icon = "rocket"; });
invalid("iconbox-icon-markup", "an icon is a name, never markup", `${ICON}/props/icon`, "enum", (d) => { at(d, ICON).props.icon = "<svg onload=alert(1)>"; });
invalid("iconbox-title-missing", "an icon box has a title", `${ICON}/props`, "required", (d) => { delete at(d, ICON).props.title; });
invalid("iconbox-text-too-long", "the text has at most 300 characters", `${ICON}/props/text`, "maxLength", (d) => { at(d, ICON).props.text = "x".repeat(301); });
invalid("iconbox-text-tab", "plain text allows a newline, no other control character", `${ICON}/props/text`, "not", (d) => { at(d, ICON).props.text = "Twice a week,\tat first light."; });

// =============================== INVALID: quote =================================
invalid("quote-text-blank", "a quote has a visible character", `${QUOTE}/props/text`, "pattern", (d) => { at(d, QUOTE).props.text = " \n "; });
invalid("quote-text-bell", "no control characters", `${QUOTE}/props/text`, "not", (d) => { at(d, QUOTE).props.text = "I came for the cold water\u0007"; });
invalid("quote-attribution-newline", "the attribution is one line", `${QUOTE}/props/attribution`, "not", (d) => { at(d, QUOTE).props.attribution = "A member\nsince last winter"; });
invalid("quote-text-too-long", "a quote has at most 500 characters", `${QUOTE}/props/text`, "maxLength", (d) => { at(d, QUOTE).props.text = "x".repeat(501); });

// =============================== INVALID: accordion =============================
invalid("accordion-no-items", "an accordion has at least one item", `${ACC}/props/items`, "minItems", (d) => { at(d, ACC).props.items = []; });
invalid("accordion-item-missing-answer", "every question has an answer", `${ACC}/props/items/0`, "required", (d) => { delete at(d, ACC).props.items[0].answer; });
invalid("accordion-item-extra-key", "items are closed: which one is open is not stored", `${ACC}/props/items/0/open`, "additionalProperties", (d) => { at(d, ACC).props.items[0].open = true; });
invalid("accordion-question-blank", "a question has a visible character", `${ACC}/props/items/1/question`, "pattern", (d) => { at(d, ACC).props.items[1].question = "　"; });

// =============================== INVALID: the text itself ======================
// Duplicate keys: JavaScript keeps the last value, Ruby's json 3 rejects the text.
invalidRaw("dup-key-type", "a block type given twice: each parser would see a different block (a rule)", `${H}/type`, "duplicateKey",
  (d) => { at(d, H).__RAW__ = 0; }, '"type": "image"');
invalidRaw("dup-key-escaped", "the second name is written \\u0074ype and is still type (a rule)", `${H}/type`, "duplicateKey",
  (d) => { at(d, H).__RAW__ = 0; }, String.raw`"type": "image"`);
invalidRaw("dup-key-title", "a duplicate at the top level (a rule)", "/title", "duplicateKey", (d) => { d.__RAW__ = 0; }, '"title": "Another title"');
invalidRaw("text-lone-surrogate-in-key", "a lone surrogate in a member name is reported on its object (a rule)", `${H}/props`, "wellFormed",
  (d) => { at(d, H).props.__RAW__ = 0; }, String.raw`"k\ud800": 1`);
{
  const s = serialise(BASE);
  const deepJunk = (levels: number): string => "[".repeat(levels) + "]".repeat(levels);
  const withJunk = s.replace('"level": 1,', `"level": 1, "junk": ${deepJunk(200)},`);
  if (withJunk === s) throw new Error("deep junk not inserted");
  // junk sits at depth 9 (document, sections, section, children, column,
  // children, heading, props, junk), so its 56th nested array is the first
  // container past 64.
  const pointer = firstTooDeep(JSON.parse(withJunk));
  if (pointer !== `${H}/props/junk` + "/0".repeat(56)) throw new Error(`nesting-200-levels: unexpected pointer ${pointer}`);
  add("invalid/nesting-200-levels.json", encoder.encode(withJunk), invalidEntry(
    "200 nested arrays inside props: past the rules' 64 and Ruby's own 100; the scanner stops first", pointer, "maxNesting"));
}
const TEXT_BYTES = (s: string): Uint8Array => encoder.encode(s);
const parseError = (name: string, rule: string, text: Uint8Array): void => add(`invalid/${name}.json`, text, invalidEntry(rule, "", "parse"));
parseError("json-bom", "a byte-order mark before the document (a rule)", concat(bytes(0xef, 0xbb, 0xbf), TEXT_BYTES(serialise(BASE))));
parseError("json-comment", "comments are not JSON (a rule)", TEXT_BYTES(serialise(BASE).replace('"schemaVersion": 1,', '"schemaVersion": 1, /* draft */')));
parseError("json-trailing-comma", "trailing commas are not JSON (a rule)", TEXT_BYTES(serialise(BASE).replace('"anchor": "join"\n', '"anchor": "join",\n')));
parseError("json-raw-tab-in-string", "a raw tab inside a string is not JSON; \\t is (a rule)", TEXT_BYTES(serialise(BASE).replace("Swim at slack water", "Swim at\tslack water")));
parseError("json-nan", "NaN is not JSON (a rule)", TEXT_BYTES(serialise(BASE).replace('"zoom": 15', '"zoom": NaN')));
parseError("json-single-quotes", "single quotes are not JSON (a rule)", TEXT_BYTES(serialise(BASE).replace('"title": "Slack Water swimming club"', "'title': 'Slack Water swimming club'")));
parseError("json-truncated", "a body cut short in transit (a rule)", TEXT_BYTES(serialise(BASE).slice(0, 2000)));
parseError("json-two-documents", "text after the document (a rule)", TEXT_BYTES(serialise(BASE) + serialise(BASE)));
parseError("json-leading-zero", "numbers have no leading zero (a rule)", TEXT_BYTES(serialise(BASE).replace('"zoom": 15', '"zoom": 015')));
{
  const s = serialise(BASE);
  const [before, after] = s.split("Swim at slack water") as [string, string];
  const encodingError = (name: string, rule: string, raw: Uint8Array): void =>
    add(`invalid/${name}.json`, concat(TEXT_BYTES(before), raw, TEXT_BYTES(after)), invalidEntry(rule, "", "encoding"));
  encodingError("utf8-invalid-byte", "a 0xFF byte is not UTF-8: Ruby's parser reads it and json_schemer then raises (a rule)", concat(TEXT_BYTES("Swim "), bytes(0xff), TEXT_BYTES(" at slack water")));
  encodingError("utf8-surrogate-bytes", "a surrogate encoded as UTF-8 bytes (ED A0 80) is not UTF-8 (a rule)", concat(TEXT_BYTES("Swim "), bytes(0xed, 0xa0, 0x80), TEXT_BYTES(" at slack water")));
  encodingError("utf8-overlong", "an overlong encoding of / (C0 AF) is not UTF-8 (a rule)", concat(TEXT_BYTES("Swim "), bytes(0xc0, 0xaf), TEXT_BYTES(" at slack water")));
}

// --- helpers used above ----------------------------------------------------------
function jsonDepth(value: J): number {
  if (value === null || typeof value !== "object") return 0;
  const children: J[] = Array.isArray(value) ? value : Object.values(value);
  return 1 + children.reduce((m: number, c: J) => Math.max(m, jsonDepth(c)), 0);
}
// The first container (in document order) deeper than MAX_NESTING: where the
// scanner stops.
function firstTooDeep(value: J): string {
  const visit = (v: J, pointer: string, depth: number): string | null => {
    if (v === null || typeof v !== "object") return null;
    if (depth + 1 > MAX_NESTING) return pointer;
    const entries: Array<[string, J]> = Array.isArray(v) ? v.map((c, k) => [String(k), c]) : Object.entries(v);
    for (const [k, c] of entries) {
      const found = visit(c, `${pointer}/${k.replace(/~/g, "~0").replace(/\//g, "~1")}`, depth + 1);
      if (found) return found;
    }
    return null;
  };
  const found = visit(value, "", 0);
  if (!found) throw new Error("nothing too deep");
  return found;
}

// =============================== write or check =================================
const manifestText = JSON.stringify(Object.fromEntries([...Object.entries(manifest)].sort(([a], [b]) => a.localeCompare(b))), null, 2) + "\n";
const check = process.argv.includes("--check");
const problems: string[] = [];
for (const sub of ["valid", "invalid"]) {
  const dir = join(CORPUS, sub);
  if (!existsSync(dir)) {
    if (check) problems.push(`missing folder ${sub}/`);
    else mkdirSync(dir, { recursive: true });
    continue;
  }
  for (const f of readdirSync(dir)) {
    if (!files.has(`${sub}/${f}`)) {
      if (check) problems.push(`${sub}/${f} is on disk but not generated`);
      else rmSync(join(dir, f));
    }
  }
}
const same = (a: Uint8Array, b: Uint8Array): boolean => a.length === b.length && a.every((x, k) => x === b[k]);
for (const [name, content] of [...files, ["manifest.json", encoder.encode(manifestText)] as const]) {
  const path = join(CORPUS, name);
  if (check) {
    if (!existsSync(path)) problems.push(`${name} is missing`);
    else if (!same(new Uint8Array(readFileSync(path)), content)) problems.push(`${name} differs from what the generator writes`);
  } else {
    writeFileSync(path, content);
  }
}
const nValid = [...files.keys()].filter((f) => f.startsWith("valid/")).length;
if (check) {
  for (const problem of problems) console.log(`  ${problem}`);
  console.log(problems.length === 0 ? `corpus is up to date: ${files.size} files (${nValid} valid, ${files.size - nValid} invalid)` : `corpus is NOT up to date: ${problems.length} difference(s)`);
  process.exit(problems.length === 0 ? 0 : 1);
}
console.log(`wrote ${files.size} files (${nValid} valid, ${files.size - nValid} invalid) and manifest.json`);
