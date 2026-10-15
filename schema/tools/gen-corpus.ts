// Writes schema/corpus: valid/ and invalid/ documents and manifest.json.
//
// Every invalid file is the base page (valid/landing.json) with ONE change,
// and the manifest records the rule it breaks and where both validators
// must report it: the JSON pointer and the keyword. Files that need bytes
// JSON.stringify cannot write (a byte-order mark, invalid UTF-8, a duplicate
// key, an escape it would not use, 1e400) are written from the serialised
// base with a placeholder swapped for the raw text.
//
//   node gen-corpus.ts           write the corpus
//   node gen-corpus.ts --check   compare with what is on disk, write nothing;
//                                exit 1 on any difference
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { MAX_NESTING } from "./rules.ts";

const CORPUS = join(dirname(fileURLToPath(import.meta.url)), "..", "corpus");
const RULE_KEYWORDS = new Set(["encoding", "parse", "duplicateKey", "maxNesting", "wellFormed", "finite", "safeInteger", "uniqueId", "uniqueAnchor", "uniqueFieldName", "reservedClass"]);

// The corpus is built by mutation, so the tree is handled as plain JSON.
type J = any;
type Style = { base: J; tablet?: J; phone?: J };

// Invisible and look-alike characters are written by code point, so the
// source shows what each trap holds and no editor can quietly change it.
const cp = (...codes: number[]): string => String.fromCodePoint(...codes);
const NBSP = cp(0xa0);
const ZERO_WIDTH_SPACE = cp(0x200b);
const LINE_SEPARATOR = cp(0x2028);
const IDEOGRAPHIC_SPACE = cp(0x3000);
const COMBINING_ACUTE = cp(0x301);
const BELL = cp(0x07);
const TAB = cp(0x09);
const NEWLINE = cp(0x0a);
// JSON escapes in raw text are assembled from a backslash and the hex
// digits, for the same reason.
const BACKSLASH = cp(0x5c);
const uEscape = (hex: string): string => `${BACKSLASH}u${hex}`;

// --- blocks -------------------------------------------------------------------
const plain = (): Style => ({ base: {} });
const block = (id: string, type: string, props: J, children: J[] = [], style: Style = plain()): J => ({ id, type, props, children, style });
const section = (id: string, columns: J[], props: J = {}, style: Style = plain()): J => block(id, "section", props, columns, style);
const column = (id: string, widgets: J[], style: Style = plain()): J => block(id, "column", {}, widgets, style);
const heading = (id: string, level: number, text: string, style: Style = plain()): J => block(id, "heading", { level, text }, [], style);
const text = (id: string, doc: J, style: Style = plain()): J => block(id, "text", { doc }, [], style);
const image = (id: string, ref: J, style: Style = plain()): J => block(id, "image", ref, [], style);
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
const stats = (id: string, items: J[], style: Style = plain()): J => block(id, "stats", { items }, [], style);
const figure = (value: string, label: string): J => ({ value, label });
const form = (id: string, items: J[], submitLabel: string, confirmation: string): J => block(id, "form", { items, submitLabel, confirmation });
const field = (name: string, kind: string, label: string, required: boolean, maxLength?: number): J =>
  (maxLength === undefined ? { name, kind, label, required } : { name, kind, label, required, maxLength });
const logo = (id: string, name?: string, style: Style = plain()): J => block(id, "logo", name === undefined ? {} : { name }, [], style);
const menu = (id: string, label: string, items: J[], style: Style = plain()): J => block(id, "menu", { label, items }, [], style);
const menuLink = (label: string, href: string): J => ({ label, href });

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
        image("hero-image", { mediaId: "hero-dawn", alt: "The bay at dawn at slack water, with a line of buoys and three swimmers" },
          { base: { aspect: "1:1" }, tablet: { aspect: "16:9" }, phone: { aspect: "5:4" } }),
      ]),
    ], { label: "Hero", anchor: "top", columnWidths: "3:2" }, { base: { background: "soft", spaceAbove: "section-s", spaceBelow: "section-l" }, phone: { spaceAbove: "l", spaceBelow: "xxl" } }),
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
        stats("gallery-stats", [
          figure("12", "Years on the water"),
          figure("300+", "Swimmers each season"),
          figure("98%", "Who would come back"),
        ], { base: { color: "primary", align: "center" }, phone: { align: "left" } }),
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
          { question: "How cold is it?", answer: `Between 8 and 18 degrees depending on the month.${NEWLINE}We shorten swims in winter.` },
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
        form("join-form", [
          field("name", "text", "Name", true, 100),
          field("email", "email", "Email", true),
          field("swimming", "textarea", "Anything we should know?", false, 1000),
          field("distance", "checkbox", "I can swim 200 meters without stopping", true),
        ], "Send request", `Thank you. We reply within two days${NEWLINE}with the next trial date and what to bring.`),
      ]),
    ], { anchor: "join" }),
    section("site", [
      column("site-1", [logo("site-logo", "Slack Water", { base: { color: "primary" }, phone: { align: "center" } })], { base: { verticalAlign: "middle" } }),
      column("site-2", [
        menu("site-menu", "Footer", [
          menuLink("Swims", "/#swims"),
          menuLink("Winter series", "/winter-series"),
          menuLink("Write to us", "mailto:hello@slackwater.example"),
        ], { base: { align: "right", color: "text" }, tablet: { align: "center" }, phone: { visibility: "hidden" } }),
      ], { base: { verticalAlign: "middle" } }),
      column("site-3", [button("site-join", "Join", "#join"), logo("site-mark")]),
    ], { label: "Site band", columnWidths: "fit:1:fit", stack: "phone" }, { base: { spaceAbove: "m", spaceBelow: "m", spaceBetween: "l" }, phone: { spaceBetween: "s" } }),
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
const STATS = P("gallery-stats");
const JOIN = P("join");
const DIV = P("join-divider");
const SPC = P("join-spacer");
const FORM = P("join-form");
const SITE = P("site");
const LOGO = P("site-logo");
const MENU = P("site-menu");

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
  add(`invalid/${name}.json`, concat(encoder.encode(parts[0] as string), rawBytes, encoder.encode(parts[1] as string)), invalidEntry(rule, pointer, keyword));
}
const bytes = (...b: number[]): Uint8Array => Uint8Array.from(b);
function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, x) => n + x.length, 0));
  let o = 0;
  for (const x of parts) {
    out.set(x, o);
    o += x.length;
  }
  return out;
}
// Replaces one literal that must be there, so a change to the base page
// cannot silently turn a trap into a copy of the base.
function replaceOnce(s: string, from: string, to: string, name: string): string {
  if (s.split(from).length !== 2) throw new Error(`${name}: ${JSON.stringify(from)} is not in the text exactly once`);
  return s.replace(from, () => to);
}

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
valid("columns-widths-every-preset", "every column-width preset, each on a section with as many columns as it has parts, fit ones included", doc("Column widths", [
  ...["3:2", "2:3", "2:1", "1:2", "2:1:1", "1:2:1", "1:1:2", "fit:1", "1:fit", "fit:1:fit"].map((widths, k) =>
    section(`widths-${k}`, widths.split(":").map((_, c) => column(`widths-${k}-${c + 1}`, [])), { columnWidths: widths })),
]));
valid("columns-stack-every-value", "where columns stack, on two, three and four columns: on phones only, or never; with a preset, fit ones included, and without", doc("Stacking", [
  section("stack-2", [column("stack-2-1", []), column("stack-2-2", [])], { stack: "phone" }),
  section("stack-2-fit", [column("stack-2-fit-1", [logo("stack-2-logo", "Tide club")]), column("stack-2-fit-2", [])], { columnWidths: "fit:1", stack: "never" }),
  section("stack-3", [column("stack-3-1", []), column("stack-3-2", []), column("stack-3-3", [])], { columnWidths: "fit:1:fit", stack: "never" }),
  section("stack-3-phone", [column("stack-3-phone-1", []), column("stack-3-phone-2", []), column("stack-3-phone-3", [])], { columnWidths: "1:2:1", stack: "phone" }),
  section("stack-4", [column("stack-4-1", []), column("stack-4-2", []), column("stack-4-3", []), column("stack-4-4", [])], { stack: "never" }),
]));
valid("logo-and-menu", "a logo with and without a name, and menus: one link, twelve (the most), every link form, labels and names at their 40 characters, in code points too", doc("Logo and menu", [
  section("lm", [
    column("lm-1", [logo("lm-logo-named", "N".repeat(40)), logo("lm-logo-mark"), logo("lm-logo-emoji", cp(0x1f30a).repeat(40))]),
    column("lm-2", [
      menu("lm-menu-one", "Main", [menuLink("Home", "/")]),
      menu("lm-menu-twelve", "L".repeat(40), Array.from({ length: 12 }, (_, k) => menuLink(`${"L".repeat(38)}${String(k).padStart(2, "0")}`, `/#part-${k + 1}`))),
      menu("lm-menu-links", "Every link", [
        menuLink("Elsewhere", "https://example.org/tides?when=today#now"),
        menuLink("Plain", "http://example.org"),
        menuLink("Write", "mailto:swim@example.org"),
        menuLink("Call", "tel:+44-1234-567890"),
        menuLink("Winter", "/winter-series"),
        menuLink("Join", "/#join"),
        menuLink("Search", "?q=tides"),
        menuLink("Top", "#top"),
        menuLink(`e${COMBINING_ACUTE}`.repeat(20), "/accents"),
      ]),
    ]),
  ], { columnWidths: "fit:1" }),
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
valid("image-crop-every-aspect", "every crop an image may take, in base and in both overrides, original included as an override back to the image's own shape", doc("Crops", [
  section("crops", [column("crops-1", ["original", "16:9", "3:2", "4:3", "5:4", "1:1"].map((aspect, k, all) =>
    image(`crop-${k}`, { mediaId: `crop-${k}`, alt: `Cropped ${aspect}` }, {
      base: { aspect },
      tablet: { aspect: all[(k + 1) % all.length], visibility: "visible" },
      phone: { aspect: all[(k + 2) % all.length] },
    })))]),
]));
valid("hrefs-every-form", "every link form the href pattern allows", doc("Links", [
  section("links", [column("links-1", [
    button("l-https", "https", "https://example.com/a/b?q=1&r=two#top"),
    button("l-http-port", "http with a port", "http://localhost:8080/"),
    button("l-host-only", "host only", "https://example.com"),
    button("l-mailto", "mailto", "mailto:sales@example.com?subject=Hi%20there"),
    button("l-tel", "tel", "tel:+44-20-7946-0958"),
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
valid("section-anchors-apart-from-ids", "an anchor may be another block's id, since only anchors become ids on the page; sections without one never clash", doc("Anchors", [
  section("intro", [column("intro-1", [heading("intro-h", 2, "Intro")])], { anchor: "outro" }),
  section("outro", [column("outro-1", [])], { anchor: "intro" }),
  section("plain", [column("plain-1", [])]),
  section("plain-again", [column("plain-again-1", [])]),
]));
valid("classes-and-anchors", "every block may have classes of the site's own and an anchor: a section, a column and every kind of widget; eight names at most, each up to 40 characters, upper case and underscores too; an image's beside its image, a gallery's items with neither", doc("Classes and anchors", [
  section("ca", [
    block("ca-1", "column", { className: "side", anchor: "side" }, [
      block("ca-h", "heading", { level: 2, text: "Prices", className: "lede Big_2", anchor: "prices" }),
      block("ca-img", "image", { url: "https://example.com/swim.jpg", alt: "A swimmer at dawn", className: "photo", anchor: "photo" }),
      block("ca-div", "divider", { className: "rule-x" }),
      block("ca-gal", "gallery", { items: [{ url: "https://example.com/a.jpg", alt: "The bay" }], className: "strip", anchor: "strip" }),
      block("ca-btn", "button", { label: "Join", href: "#prices", className: `${"n".repeat(40)}` }),
    ]),
  ], { anchor: "top", className: "hero a b c d e f g" }),
]));
valid("header-sticky", "the site's header may stay at the top of the window: sticky is true, or absent", { ...doc("Header", [
  section("hd", [column("hd-1", [block("hd-logo", "logo", { name: "Slack Water" })])]),
]), sticky: true });
valid("rich-text", "the rich-text subset: nested lists three deep, every mark, hard break with marks, empty paragraph, numbered list attrs", doc("Rich text", [
  section("rt", [column("rt-1", [text("rt-text", rich(
    p(t("Plain, "), t("bold", [bold]), t(", "), t("italic", [italic]), t(", "), t("both", [bold, italic]), t(" and "), t("a link", [link("https://example.com/")]), t(".")),
    p(),
    p(t("Line one"), br([bold]), t("line two")),
    ul(li(p(t("one")), ul(li(p(t("one.a")), ol(3, li(p(t("one.a.iii"))), li(p(t("one.a.iv"))))))), li(p(t("two", [link("mailto:hello@example.com")])), p(t("a second paragraph in the item")))),
    ol(1, li(p(t("first"))), li(p(t("second")))),
  ))])]),
]));
valid("rich-text-every-mark-once", "all three marks on one text node and on one line break, in two orders: each type at most once is the rule, not a fixed order", doc("Marks", [
  section("mk", [column("mk-1", [text("mk-text", rich(
    p(t("bold, italic and a link", [bold, italic, link("/marks")]), br([link("#top"), italic, bold]), t("link first", [link("https://example.com/"), bold])),
  ))])]),
]));
valid("styles-every-token", "every style key and token value, with tablet and phone overrides", doc("Styles", [
  section("st", [
    column("st-1", [
      heading("st-h-display", 1, "Display", { base: { textSize: "display", color: "primary", align: "left" } }),
      heading("st-h-1", 2, "Heading 1", { base: { textSize: "heading-1", color: "text" }, tablet: { align: "center" }, phone: { align: "right" } }),
      heading("st-h-2", 2, "Heading 2", { base: { textSize: "heading-2", typeface: "body", color: "accent" } }),
      heading("st-h-3", 3, "Heading 3", { base: { textSize: "heading-3", color: "muted" } }),
      text("st-t-large", rich(p(t("Large"))), { base: { textSize: "large", typeface: "heading", color: "background" }, phone: { typeface: "body" } }),
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
  ], {}, { base: { background: "primary", spaceAbove: "section-s", spaceBelow: "section-l", spaceBetween: "m" }, tablet: { background: "muted", spaceBelow: "m" }, phone: { visibility: "hidden" } }),
]));
valid("section-space-every-step", "every value of spaceAbove and spaceBelow, spacing steps and section steps, in base and in both overrides", doc("Section space", [
  "none", "xs", "s", "m", "l", "xl", "xxl", "section-s", "section-l",
].map((step, k, all) => section(`space-${k}`, [column(`space-${k}-1`, [])], {}, {
  base: { spaceAbove: step, spaceBelow: all[all.length - 1 - k] },
  tablet: { spaceAbove: all[(k + 1) % all.length] },
  phone: { spaceBelow: all[(k + 2) % all.length] },
}))));
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
    quote("uni-q", `«Il mare d’inverno»${NEWLINE}non è un concetto.`, "Anonimo"),
    accordion("uni-a", [{ question: "¿Qué?", answer: "Ça va." }]),
    stats("uni-st", [figure("٣٤٥ €", "Größe des Vereins"), figure("約 40 分", "潮が止まる時間")]),
    iconbox("uni-ib", "globe", "Ünïcödé", "Ẅïth ẗrëmäs."),
    map("uni-m", 35.6812, 139.7671, 12, "東京駅"),
    form("uni-f", [field("nom", "text", "Prénom et nom", true, 80), field("accord", "checkbox", "J’accepte d’être rappelé·e ☎", false)], "Envoyer ✉", `Merci ! À bientôt.${NEWLINE}— Le club`),
    logo("uni-l", "Øresund Bådelaug"),
    menu("uni-n", "Menü", [menuLink("日本語の案内", "/"), menuLink("مرحبا", "/ar"), menuLink("Été ✓ 🌊", "/ete")]),
  ])]),
], "Ünïcödé désçription"));
valid("text-length-emoji-at-max", "200 emoji in a heading: 200 code points (400 UTF-16 units), maxLength 200", doc("Emoji", [
  section("em", [column("em-1", [heading("em-h", 2, cp(0x1f600).repeat(200))])]),
]));
valid("text-length-combining-at-max", "100 times e + U+0301: 200 code points, 100 visible letters, maxLength 200", doc("Combining", [
  section("cm", [column("cm-1", [heading("cm-h", 2, `e${COMBINING_ACUTE}`.repeat(100))])]),
]));
valid("form-fields-every-kind", "every kind of field, required and not; a line of text limited to 1 and to 300 characters, a longer text to 5000; names of one letter and of 40 characters, with digits and hyphens; twenty fields, the most a form holds; and a second form using the same names, since names are unique in a form, not on the page", doc("Forms", [
  section("fm", [column("fm-1", [
    form("fm-every", [
      field("a", "text", "One character", false, 1),
      field("b", "text", "Three hundred", true, 300),
      field("c", "email", "Email", false),
      field("d", "email", "Email, required", true),
      field("e", "textarea", "Five thousand", false, 5000),
      field("f", "textarea", "Short", true, 1),
      field("g", "checkbox", "Optional box", false),
      field("h", "checkbox", "Required box", true),
      field(`a${"-9".repeat(19)}b`, "text", "A name of 40 characters", false, 50),
      ...Array.from({ length: 11 }, (_, k) => field(`field-${k + 10}`, "text", `Field ${k + 10}`, false, 100)),
    ], "Send", "Sent."),
    form("fm-again", [field("a", "text", "The same name as the first form's", true, 10)], "Send this one", "This one is sent too."),
  ])]),
]));
valid("stats-figures", "a stats block of one figure and one of eight, the most it holds; a value of one character and of 24, in code points too, a label of one character and of 80; values written with signs and units as they are shown; a colour of the site's own and a figure's words aligned per device", doc("Stats", [
  section("sf", [column("sf-1", [
    stats("sf-one", [figure("1", "x")]),
    stats("sf-eight", [
      figure("12", "Years on the water"),
      figure("300+", "Swimmers each season"),
      figure("98%", "Who would come back"),
      figure("1,200 m", "From the slipway to the buoy line"),
      figure("-2 °C", "The coldest swim"),
      figure("9".repeat(24), "L".repeat(80)),
      figure(cp(0x1f30a).repeat(24), "Twenty-four waves: 24 code points, 48 UTF-16 units"),
      figure("1/2", "Half of us swim all winter"),
    ], { base: { color: "#1d4e6f", align: "center" }, tablet: { align: "right" }, phone: { color: "accent", align: "left", visibility: "hidden" } }),
  ])]),
]));
valid("text-inner-nbsp", "a no-break space inside text with visible letters is fine; only all-blank text is refused", doc("Nbsp", [
  section("nb", [column("nb-1", [image("nb-i", { mediaId: "nb", alt: `A${NBSP}photo` }), heading("nb-h", 2, `${NBSP}Leading no-break space`)])]),
]));
{
  // Integral floats, valid in both engines and normalised to integers; -0.0
  // and 1e-400 (which underflows) both become 0.
  const d = doc("Integral floats", [
    section("fl", [column("fl-1", [
      heading("fl-h", 2, "Level written as 2.0"),
      map("fl-m", 45, -0.5, 12, "Zoom written as 12.0"),
      text("fl-t", rich(ol(3, li(p(t("starts at 3.0")))))),
      map("fl-zero", 0, 0, 7, "Latitude written as -0.0, longitude as 1e-400"),
    ])]),
  ]);
  let s = serialise(d);
  for (const [from, to] of [
    ['"level": 2', '"level": 2.0'],
    ['"latitude": 45', '"latitude": 45.0'],
    ['"longitude": -0.5', '"longitude": -0.5e0'],
    ['"zoom": 12', '"zoom": 1.2e1'],
    ['"start": 3', '"start": 3.000'],
    ['"latitude": 0,', '"latitude": -0.0,'],
    ['"longitude": 0,', '"longitude": 1e-400,'],
  ] as const) s = replaceOnce(s, from, to, "integral-floats");
  add("valid/integral-floats.json", encoder.encode(s), {
    rule: "2.0, 45.0, 1.2e1 and 3.000 are integers to both engines, and -0.0 and 1e-400 are 0; the rules turn them into integers, so Ruby renders <h2>, not <h2.0>",
  });
}
{
  // Escapes the parsers must read the same way, including an escaped member name.
  const d = doc("Escapes", [section("esc", [column("esc-1", [text("esc-t", rich(p(t("__RAW__"))))])])]);
  const raw = `"quote ${BACKSLASH}" backslash ${BACKSLASH}${BACKSLASH} slash ${BACKSLASH}/ e-acute ${uEscape("00e9")} emoji ${uEscape("d83d")}${uEscape("de00")} A as ${uEscape("0041")}"`;
  let s = replaceOnce(serialise(d), '"__RAW__"', raw, "string-escapes");
  s = replaceOnce(s, '"type": "doc"', `"${uEscape("0074")}ype": "doc"`, "string-escapes");
  const read = JSON.parse(s);
  const want = `quote " backslash ${BACKSLASH} slash / e-acute ${cp(0xe9)} emoji ${cp(0x1f600)} A as A`;
  if (read.sections[0].children[0].children[0].props.doc.content[0].content[0].text !== want) throw new Error("string-escapes: unexpected text");
  if (read.sections[0].children[0].children[0].props.doc.type !== "doc") throw new Error("string-escapes: escaped member name not read as type");
  add("valid/string-escapes.json", encoder.encode(s), {
    rule: "JSON escapes: quote, backslash, slash, a letter and an accented letter as u-escapes, an emoji as a surrogate pair of two escapes, and the member name type spelled with an escaped t",
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
invalid("doc-title-newline", "title is one line", "/title", "not", (d) => { d.title = `Slack Water${NEWLINE}swimming club`; });
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
invalid("block-id-trailing-newline", "^...$ must not let a trailing newline through (Ruby's $ would)", `${H}/id`, "pattern", (d) => { at(d, H).id = `hero-heading${NEWLINE}`; });
invalid("block-id-leading-newline", "^...$ must not let a leading newline through (Ruby's ^ would match on the second line)", `${H}/id`, "pattern", (d) => { at(d, H).id = `${NEWLINE}hero-heading`; });
invalid("block-id-arabic-digits", "ids are ASCII: Arabic-Indic digits are not [0-9]", `${H}/id`, "pattern", (d) => { at(d, H).id = cp(0x663, 0x664, 0x665); });
invalid("block-id-fullwidth", "ids are ASCII: fullwidth letters are not [A-Za-z]", `${H}/id`, "pattern", (d) => { at(d, H).id = cp(0xff48, 0xff45, 0xff52, 0xff4f); });
invalid("block-id-non-ascii-letter", "ids are ASCII", `${H}/id`, "pattern", (d) => { at(d, H).id = `bl${cp(0xf6)}ck`; });
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
invalid("tree-section-at-column-level", "the page holds sections only", `/sections/${BASE.sections.length}/type`, "const", (d) => { d.sections.push(column("loose-col", [])); });
invalid("tree-section-no-columns", "a section has at least one column", `${HERO}/children`, "minItems", (d) => { at(d, HERO).children = []; });
invalid("tree-section-five-columns", "a section has at most four columns", `${HERO}/children`, "maxItems", (d) => {
  at(d, HERO).children.push(column("c3", []), column("c4", []), column("c5", []));
});
invalid("tree-heading-with-children", "widgets hold no blocks", `${H}/children`, "maxItems", (d) => { at(d, H).children.push(text("child", rich(p(t("x"))))); });
invalid("tree-column-props", "a column's props are its class and anchor alone: its width comes from the section's columnWidths", `${COL}/props/width`, "additionalProperties", (d) => { at(d, COL).props.width = 50; });
invalid("tree-section-widths-for-three-on-two", "a preset of three parts on a section of two columns", `${HERO}/props/columnWidths`, "enum", (d) => { at(d, HERO).props.columnWidths = "2:1:1"; });
invalid("tree-section-widths-free-ratio", "column widths are presets, not any ratio", `${HERO}/props/columnWidths`, "enum", (d) => { at(d, HERO).props.columnWidths = "60:40"; });
invalid("tree-section-widths-equal-written", "equal widths are the absence of a preset, never written", `${HERO}/props/columnWidths`, "enum", (d) => { at(d, HERO).props.columnWidths = "equal"; });
invalid("tree-section-widths-one-column", "a section of one column takes no preset", `${P("gallery")}/props`, "not", (d) => { at(d, P("gallery")).props.columnWidths = "3:2"; });
invalid("tree-section-anchor", "anchors are lowercase letters, digits and hyphens", `${HERO}/props/anchor`, "pattern", (d) => { at(d, HERO).props.anchor = "Join Us"; });
invalid("section-anchor-duplicate", "section anchors are unique on the page (a rule: the schema cannot say it): a link to #top would never reach a second section with it", `${JOIN}/props/anchor`, "uniqueAnchor", (d) => {
  at(d, JOIN).props.anchor = "top";
});
invalid("section-anchor-duplicate-first-changed", "the second section with an anchor, in page order, is the one refused, whichever of the two was changed", `${JOIN}/props/anchor`, "uniqueAnchor", (d) => {
  at(d, HERO).props.anchor = "join";
});
invalid("block-anchor-duplicate", "anchors are unique across every block of the page (a rule): a link to #top would never reach a button with it, the second in document order", `${BTN}/props/anchor`, "uniqueAnchor", (d) => {
  at(d, BTN).props.anchor = "top";
});
invalid("block-anchor-duplicate-section-second", "the second in document order is refused: a section's anchor after a heading's", `${JOIN}/props/anchor`, "uniqueAnchor", (d) => {
  at(d, H).props.anchor = "join";
});
invalid("column-anchor-pattern", "a column's anchor is an anchor like a section's", `${COL}/props/anchor`, "pattern", (d) => { at(d, COL).props.anchor = "Side"; });
invalid("class-name-mark", "a class name is a letter then letters, digits, hyphens or underscores", `${H}/props/className`, "pattern", (d) => { at(d, H).props.className = "hero!"; });
invalid("class-name-digit-first", "a class name starts with a letter", `${H}/props/className`, "pattern", (d) => { at(d, H).props.className = "2col"; });
invalid("class-name-two-spaces", "one space between two names, no more", `${H}/props/className`, "pattern", (d) => { at(d, H).props.className = "hero  big"; });
invalid("class-name-nine", "eight names at most", `${H}/props/className`, "pattern", (d) => { at(d, H).props.className = "a b c d e f g h i"; });
invalid("class-name-too-long", "a name has at most 40 characters", `${H}/props/className`, "pattern", (d) => { at(d, H).props.className = "n".repeat(41); });
invalid("class-name-empty", "no class is no className, never an empty one", `${H}/props/className`, "pattern", (d) => { at(d, H).props.className = ""; });
invalid("class-name-theme", "a class may not be one the theme uses (a rule): hide-desktop of the site's own would hide the block", `${H}/props/className`, "reservedClass", (d) => { at(d, H).props.className = "lede hide-desktop"; });
invalid("class-name-theme-any-case", "nor one of them in another case", `${COL}/props/className`, "reservedClass", (d) => { at(d, COL).props.className = "SW-Inner"; });
invalid("gallery-item-class", "a gallery's items are images alone: a class is the gallery's", `${GAL}/props/items/0/className`, "additionalProperties", (d) => { at(d, GAL).props.items[0].className = "photo"; });
invalid("document-sticky-false", "sticky is true or absent, never false", "/sticky", "const", (d) => { d.sticky = false; });
invalid("tree-section-label-too-long", "a section label has at most 60 characters", `${HERO}/props/label`, "maxLength", (d) => { at(d, HERO).props.label = "x".repeat(61); });
invalid("tree-section-unknown-prop", "section props are closed", `${HERO}/props/columns`, "additionalProperties", (d) => { at(d, HERO).props.columns = 2; });
invalid("tree-section-widths-fit-for-two-on-three", "a fit preset of two parts on a section of three columns", `${SITE}/props/columnWidths`, "enum", (d) => { at(d, SITE).props.columnWidths = "fit:1"; });
invalid("tree-section-widths-all-fit", "every column as wide as its content leaves nothing to take the rest: no such preset", `${HERO}/props/columnWidths`, "enum", (d) => { at(d, HERO).props.columnWidths = "fit:fit"; });
invalid("tree-section-widths-fit-on-four", "four columns take no preset, fit ones included", `${P("swims")}/props/columnWidths`, "enum", (d) => {
  at(d, P("swims")).children.push(column("swims-4", []));
  at(d, P("swims")).props.columnWidths = "fit:1:1:fit";
});
invalid("section-stack-unknown", "columns stack on phones only, or never; tablet is the absence of the setting, never written", `${HERO}/props/stack`, "enum", (d) => { at(d, HERO).props.stack = "tablet"; });
invalid("section-stack-boolean", "where to stack is a name, not true or false", `${SITE}/props/stack`, "enum", (d) => { at(d, SITE).props.stack = false; });
invalid("section-stack-one-column", "a section of one column has nothing to stack", `${P("gallery")}/props`, "not", (d) => { at(d, P("gallery")).props.stack = "never"; });
invalid("section-stack-in-style", "where columns stack is the section's, one setting for every device, not a style per device", `${SITE}/style/phone/stack`, "additionalProperties", (d) => { at(d, SITE).style.phone.stack = "never"; });

// =============================== INVALID: style =================================
invalid("style-null-value", "an absent key means inherit; null is not a value", `${HERO}/style/base/background`, "enum", (d) => { at(d, HERO).style.base.background = null; });
invalid("style-unknown-token", "values are token names", `${COL}/style/base/spaceInside`, "enum", (d) => { at(d, COL).style.base.spaceInside = "huge"; });
invalid("style-pixel-value", "block settings never use pixels", `${COL}/style/base/spaceInside`, "enum", (d) => { at(d, COL).style.base.spaceInside = 24; });
invalid("style-tone-not-slot", "blocks name palette slots, not tones", `${H}/style/base/color`, "enum", (d) => { at(d, H).style.base.color = "site-sea"; });
invalid("style-key-not-for-type", "a divider has no text size", `${DIV}/style/base/textSize`, "additionalProperties", (d) => { at(d, DIV).style.base.textSize = "large"; });
invalid("style-typeface-unknown", "a typeface is the body's or the headings', never a font's name", `${H}/style/base/typeface`, "enum", (d) => { at(d, H).style.base.typeface = "Archivo"; });
invalid("style-unknown-key", "a block's style is its listed settings, by token: CSS of the site's own is its custom CSS", `${H}/style/base/fontFamily`, "additionalProperties", (d) => { at(d, H).style.base.fontFamily = "Archivo"; });
invalid("style-empty-override", "an override with nothing in it is not stored", `${COL}/style/phone`, "minProperties", (d) => { at(d, COL).style.phone = {}; });
invalid("style-desktop-key", "desktop is base: there is no desktop key", `${H}/style/desktop`, "additionalProperties", (d) => { at(d, H).style.desktop = { textSize: "body" }; });
invalid("style-missing-base", "base is required", `${H}/style`, "required", (d) => { delete at(d, H).style.base; });
invalid("style-override-null", "a removed override is absent, not null", `${H}/style/phone`, "type", (d) => { at(d, H).style.phone = null; });
invalid("style-section-space-retired", "sectionSpace became spaceAbove and spaceBelow before any page was stored: the old key is unknown", `${HERO}/style/base/sectionSpace`, "additionalProperties", (d) => {
  at(d, HERO).style.base.sectionSpace = "section-s";
});
invalid("style-space-above-unknown", "the space above a section is a spacing step or a section step", `${HERO}/style/phone/spaceAbove`, "enum", (d) => { at(d, HERO).style.phone.spaceAbove = "section-m"; });
invalid("style-space-below-on-column", "only a section has space above and below", `${COL}/style/base/spaceBelow`, "additionalProperties", (d) => { at(d, COL).style.base.spaceBelow = "l"; });

// =============================== INVALID: heading ===============================
invalid("heading-level-5", "levels are 1 to 4", `${H}/props/level`, "maximum", (d) => { at(d, H).props.level = 5; });
invalidRaw("heading-level-5-written-5.0", "5.0 is the integer 5 to both engines, and still above 4", `${H}/props/level`, "maximum",
  (d) => { at(d, H).props.level = "__RAW__"; }, "5.0");
invalid("heading-level-0", "levels are 1 to 4", `${H}/props/level`, "minimum", (d) => { at(d, H).props.level = 0; });
invalid("heading-level-string", "the level is a number", `${H}/props/level`, "type", (d) => { at(d, H).props.level = "2"; });
invalid("heading-level-fraction", "2.5 is not an integer", `${H}/props/level`, "type", (d) => { at(d, H).props.level = 2.5; });
invalidRaw("heading-level-1e400", "1e400 reads as Infinity in both languages, and json_schemer raises on it (a rule)", `${H}/props/level`, "finite",
  (d) => { at(d, H).props.level = "__RAW__"; }, "1e400");
invalidRaw("heading-level-huge-integer", "a 20-digit integer is exact in Ruby and rounded in JavaScript (a rule)", `${H}/props/level`, "safeInteger",
  (d) => { at(d, H).props.level = "__RAW__"; }, "12345678901234567890");
invalid("heading-text-blank", "text has a visible character", `${H}/props/text`, "pattern", (d) => { at(d, H).props.text = "   "; });
invalid("heading-text-empty", "text has a visible character", `${H}/props/text`, "pattern", (d) => { at(d, H).props.text = ""; });
invalid("heading-text-nbsp-only", "no-break spaces are blank (Ruby's \\S would call them visible)", `${H}/props/text`, "pattern", (d) => { at(d, H).props.text = NBSP.repeat(2); });
invalid("heading-text-line-separator-only", "U+2028 is blank (json_schemer's \\s leaves it out)", `${H}/props/text`, "pattern", (d) => { at(d, H).props.text = LINE_SEPARATOR; });
invalid("heading-text-zero-width-only", "zero-width spaces are blank", `${H}/props/text`, "pattern", (d) => { at(d, H).props.text = ZERO_WIDTH_SPACE.repeat(2); });
invalid("heading-text-newline", "a heading is one line", `${H}/props/text`, "not", (d) => { at(d, H).props.text = `Swim at${NEWLINE}slack water`; });
invalid("heading-text-emoji-over-max", "201 emoji: 201 code points > maxLength 200", `${H}/props/text`, "maxLength", (d) => { at(d, H).props.text = cp(0x1f600).repeat(201); });
invalid("heading-text-combining-over-max", "100 visible letters but 201 code points > 200", `${H}/props/text`, "maxLength", (d) => { at(d, H).props.text = `e${COMBINING_ACUTE}`.repeat(100) + "x"; });
invalid("heading-href-javascript", "a heading link follows the link rules", `${H}/props/href`, "pattern", (d) => { at(d, H).props.href = "javascript:alert(1)"; });
invalid("heading-props-extra", "heading props are closed", `${H}/props/color`, "additionalProperties", (d) => { at(d, H).props.color = "red"; });
invalidRaw("heading-text-lone-surrogate", "a lone high surrogate: Ruby's parser refuses it, JavaScript's reads it (a rule)", `${H}/props/text`, "wellFormed",
  (d) => { at(d, H).props.text = "__RAW__"; }, `"Swim ${uEscape("d83d")} at slack water"`);
invalidRaw("heading-text-lone-low-surrogate", "a lone low surrogate (a rule)", `${H}/props/text`, "wellFormed",
  (d) => { at(d, H).props.text = "__RAW__"; }, `"Swim ${uEscape("dc00")} at slack water"`);

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
  at(d, RUN)[3].marks[0].attrs.href = `javascript:alert(1)${NEWLINE}https://ok.example/`;
});
invalid("text-link-twice", "two link marks on one text node would be one <a> inside another, which a browser splits in two", `${RUN}/3/marks`, "not", (d) => {
  at(d, RUN)[3].marks.push(link("/somewhere-else"));
});
invalid("text-bold-twice", "a mark type at most once on a node, bold included", `${RUN}/1/marks`, "not", (d) => { at(d, RUN)[1].marks.push(bold); });
invalid("text-break-italic-twice", "a line break's marks follow the same rule", `${RUN}/4/marks`, "not", (d) => { at(d, RUN)[4].marks = [italic, italic]; });
invalid("text-link-without-attrs", "a link mark has attrs with href", `${RUN}/3/marks/0`, "required", (d) => { delete at(d, RUN)[3].marks[0].attrs; });
invalid("text-empty-text-node", "text nodes are never empty", `${RUN}/0/text`, "minLength", (d) => { at(d, RUN)[0].text = ""; });
invalid("text-node-without-text", "a text node has text", `${RUN}/0`, "required", (d) => { delete at(d, RUN)[0].text; });
invalid("text-control-character", "no control characters in text", `${RUN}/0/text`, "not", (d) => { at(d, RUN)[0].text = `Dawn${BELL} swims, `; });
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
invalid("image-alt-nbsp-only", "no-break spaces are blank", `${IMG}/props/alt`, "pattern", (d) => { at(d, IMG).props.alt = NBSP; });
invalid("image-alt-line-separator-only", "U+2028 alone is blank", `${IMG}/props/alt`, "pattern", (d) => { at(d, IMG).props.alt = LINE_SEPARATOR; });
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
invalid("image-aspect-unknown", "a crop is one of the shapes of tokens.json, not any ratio", `${IMG}/style/tablet/aspect`, "enum", (d) => { at(d, IMG).style.tablet.aspect = "21:9"; });
invalid("image-aspect-in-props", "the crop is a style setting, per device, not a property", `${IMG}/props/aspect`, "additionalProperties", (d) => { at(d, IMG).props.aspect = "1:1"; });
invalid("image-aspect-on-gallery", "only an image takes a crop: the gallery crops its own", `${GAL}/style/base/aspect`, "additionalProperties", (d) => { at(d, GAL).style.base.aspect = "1:1"; });
const QURL = `${QIMG}/props/url`;
invalid("image-url-javascript", "no javascript: images", QURL, "pattern", (d) => { at(d, QIMG).props.url = "javascript:alert(1)"; });
invalid("image-url-data", "no data: images", QURL, "pattern", (d) => { at(d, QIMG).props.url = "data:image/png;base64,iVBORw0KGgo="; });
invalid("image-url-http", "external images are https: http would be mixed content", QURL, "pattern", (d) => { at(d, QIMG).props.url = "http://images.example.org/tea.jpg"; });
invalid("image-url-protocol-relative", "no //host addresses", QURL, "pattern", (d) => { at(d, QIMG).props.url = "//evil.example/tea.jpg"; });
invalid("image-url-backslash", "browsers read /\\host as //host", QURL, "pattern", (d) => { at(d, QIMG).props.url = `/${BACKSLASH}evil.example/tea.jpg`; });
invalid("image-url-newline", "a newline in a URL is caught by the unanchored check", QURL, "not", (d) => {
  at(d, QIMG).props.url = `https://images.example.org/tea.jpg${NEWLINE}javascript:alert(1)`;
});
invalid("image-url-userinfo", "no user info: the host would be evil.example", QURL, "pattern", (d) => { at(d, QIMG).props.url = "https://images.example.org@evil.example/tea.jpg"; });

// =============================== INVALID: button ================================
const HREF = `${BTN}/props/href`;
invalid("button-href-javascript-mixed-case", "no javascript:, in any case", HREF, "pattern", (d) => { at(d, BTN).props.href = "JaVaScRiPt:alert(1)"; });
invalid("button-href-newline-then-https", "the line-anchor trap", HREF, "not", (d) => { at(d, BTN).props.href = `javascript:alert(1)${NEWLINE}https://ok.example`; });
invalid("button-href-trailing-newline", "Ruby's $ matches before a final newline", HREF, "not", (d) => { at(d, BTN).props.href = `https://example.com/${NEWLINE}`; });
invalid("button-href-leading-space", "browsers strip a leading space and run what follows", HREF, "pattern", (d) => { at(d, BTN).props.href = " javascript:alert(1)"; });
invalid("button-href-tab-in-scheme", "browsers drop a tab inside the scheme", HREF, "not", (d) => { at(d, BTN).props.href = `java${TAB}script:alert(1)`; });
invalid("button-href-vbscript", "no vbscript:", HREF, "pattern", (d) => { at(d, BTN).props.href = "vbscript:msgbox(1)"; });
invalid("button-href-data", "no data: links", HREF, "pattern", (d) => { at(d, BTN).props.href = "data:text/html,<script>alert(1)</script>"; });
invalid("button-href-tel-arabic-digits", "tel: digits are ASCII", HREF, "pattern", (d) => { at(d, BTN).props.href = `tel:${cp(0x660, 0x661, 0x662, 0x663, 0x664, 0x665)}`; });
invalid("button-href-tel-fullwidth-digits", "tel: digits are ASCII", HREF, "pattern", (d) => { at(d, BTN).props.href = `tel:${cp(0xff11, 0xff12, 0xff13, 0xff14)}`; });
invalid("button-href-protocol-relative", "no //host links", HREF, "pattern", (d) => { at(d, BTN).props.href = "//evil.example/"; });
invalid("button-href-userinfo", "no user info", HREF, "pattern", (d) => { at(d, BTN).props.href = "https://example.com@evil.example/"; });
invalid("button-href-backslash", "browsers read /\\host as //host", HREF, "pattern", (d) => { at(d, BTN).props.href = `/${BACKSLASH}evil.example`; });
invalid("button-href-space-in-host", "no spaces", HREF, "pattern", (d) => { at(d, BTN).props.href = "https://exa mple.com/"; });
invalid("button-label-missing", "a button has a label", `${BTN}/props`, "required", (d) => { delete at(d, BTN).props.label; });
invalid("button-props-empty", "label and href both missing: ajv reports each key, json_schemer the object once", `${BTN}/props`, "required", (d) => { at(d, BTN).props = {}; });
invalid("button-label-too-long", "a label has at most 80 characters", `${BTN}/props/label`, "maxLength", (d) => { at(d, BTN).props.label = "x".repeat(81); });

// =============================== INVALID: divider, spacer =======================
invalid("divider-unknown-prop", "a divider has no props", `${DIV}/props/variant`, "additionalProperties", (d) => { at(d, DIV).props.variant = "dashed"; });
invalid("divider-children", "a divider holds no blocks", `${DIV}/children`, "maxItems", (d) => { at(d, DIV).children.push(spacer("divider-child", "s")); });
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
invalid("video-youtube-id-trailing-newline", "an id with a newline after it (Ruby's $ would accept it)", `${VID}/props/videoId`, "pattern", (d) => {
  at(d, VID).props.videoId = `Xk3d9Lp0qWe${NEWLINE}`;
});
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
invalid("iconbox-text-tab", "plain text allows a newline, no other control character", `${ICON}/props/text`, "not", (d) => { at(d, ICON).props.text = `Twice a week,${TAB}at first light.`; });

// =============================== INVALID: quote =================================
invalid("quote-text-blank", "a quote has a visible character", `${QUOTE}/props/text`, "pattern", (d) => { at(d, QUOTE).props.text = ` ${NEWLINE} `; });
invalid("quote-text-bell", "no control characters", `${QUOTE}/props/text`, "not", (d) => { at(d, QUOTE).props.text = `I came for the cold water${BELL}`; });
invalid("quote-attribution-newline", "the attribution is one line", `${QUOTE}/props/attribution`, "not", (d) => { at(d, QUOTE).props.attribution = `A member${NEWLINE}since last winter`; });
invalid("quote-text-too-long", "a quote has at most 500 characters", `${QUOTE}/props/text`, "maxLength", (d) => { at(d, QUOTE).props.text = "x".repeat(501); });

// =============================== INVALID: accordion =============================
invalid("accordion-no-items", "an accordion has at least one item", `${ACC}/props/items`, "minItems", (d) => { at(d, ACC).props.items = []; });
invalid("accordion-item-missing-answer", "every question has an answer", `${ACC}/props/items/0`, "required", (d) => { delete at(d, ACC).props.items[0].answer; });
invalid("accordion-item-extra-key", "items are closed: which one is open is not stored", `${ACC}/props/items/0/open`, "additionalProperties", (d) => { at(d, ACC).props.items[0].open = true; });
invalid("accordion-question-blank", "a question has a visible character", `${ACC}/props/items/1/question`, "pattern", (d) => { at(d, ACC).props.items[1].question = IDEOGRAPHIC_SPACE; });

// =============================== INVALID: stats =================================
const FIGURE = (k: number): string => `${STATS}/props/items/${k}`;
invalid("stats-no-figures", "a stats block has at least one figure", `${STATS}/props/items`, "minItems", (d) => { at(d, STATS).props.items = []; });
invalid("stats-9-figures", "a stats block has at most eight figures", `${STATS}/props/items`, "maxItems", (d) => {
  at(d, STATS).props.items.push(...Array.from({ length: 6 }, (_, k) => figure(`${k + 1}`, `More ${k + 1}`)));
});
invalid("stats-figure-null", "a figure is an object", FIGURE(0), "type", (d) => { at(d, STATS).props.items[0] = null; });
invalid("stats-value-missing", "every figure has a value", FIGURE(1), "required", (d) => { delete at(d, STATS).props.items[1].value; });
invalid("stats-label-missing", "every figure says what it counts: a number alone tells a reader nothing", FIGURE(2), "required", (d) => { delete at(d, STATS).props.items[2].label; });
invalid("stats-figure-extra-key", "a figure is a value and a label, nothing else: no link, no icon", `${FIGURE(0)}/href`, "additionalProperties", (d) => { at(d, STATS).props.items[0].href = "/about"; });
invalid("stats-value-number", "a value is text, written as it is shown (300+, 98%), never a number to format", `${FIGURE(0)}/value`, "type", (d) => { at(d, STATS).props.items[0].value = 12; });
invalid("stats-value-blank", "a value has a visible character", `${FIGURE(1)}/value`, "pattern", (d) => { at(d, STATS).props.items[1].value = `${NBSP}${ZERO_WIDTH_SPACE}`; });
invalid("stats-value-newline", "a value is one line", `${FIGURE(1)}/value`, "not", (d) => { at(d, STATS).props.items[1].value = `300${NEWLINE}+`; });
invalid("stats-value-too-long", "a value has at most 24 characters", `${FIGURE(2)}/value`, "maxLength", (d) => { at(d, STATS).props.items[2].value = "9".repeat(25); });
invalid("stats-label-too-long", "a label has at most 80 characters", `${FIGURE(0)}/label`, "maxLength", (d) => { at(d, STATS).props.items[0].label = "x".repeat(81); });
invalid("stats-label-tab", "a label is one line", `${FIGURE(2)}/label`, "not", (d) => { at(d, STATS).props.items[2].label = `Who would${TAB}come back`; });
invalid("stats-style-text-size", "the figures' size is the theme's", `${STATS}/style/base/textSize`, "additionalProperties", (d) => { at(d, STATS).style.base.textSize = "display"; });
invalid("stats-style-background", "a stats block takes the band's background", `${STATS}/style/phone/background`, "additionalProperties", (d) => { at(d, STATS).style.phone.background = "soft"; });
invalid("stats-with-children", "a stats block holds no blocks", `${STATS}/children`, "maxItems", (d) => { at(d, STATS).children.push(heading("in-stats", 2, "In the stats")); });

// =============================== INVALID: form ==================================
const FIELD = (k: number): string => `${FORM}/props/items/${k}`;
invalid("form-no-fields", "a form has at least one field", `${FORM}/props/items`, "minItems", (d) => { at(d, FORM).props.items = []; });
invalid("form-21-fields", "a form has at most twenty fields", `${FORM}/props/items`, "maxItems", (d) => {
  at(d, FORM).props.items.push(...Array.from({ length: 17 }, (_, k) => field(`extra-${k}`, "text", `Extra ${k}`, false, 10)));
});
invalid("form-name-duplicate", "field names are unique in a form (a rule: uniqueItems would compare whole fields): two fields with one name would write over each other's answers", `${FIELD(1)}/name`, "uniqueFieldName", (d) => {
  at(d, FORM).props.items[1].name = "name";
});
invalid("form-name-duplicate-first-changed", "the second field with a name, in order, is the one refused, whichever of the two was changed", `${FIELD(2)}/name`, "uniqueFieldName", (d) => {
  at(d, FORM).props.items[0].name = "swimming";
});
invalid("form-name-uppercase", "a field name is lowercase letters, digits and hyphens, starting with a letter", `${FIELD(0)}/name`, "pattern", (d) => { at(d, FORM).props.items[0].name = "Name"; });
invalid("form-name-space", "a field name has no spaces", `${FIELD(0)}/name`, "pattern", (d) => { at(d, FORM).props.items[0].name = "full name"; });
invalid("form-name-bracket", "a field name has no brackets, which would nest the answer in the request", `${FIELD(0)}/name`, "pattern", (d) => { at(d, FORM).props.items[0].name = "name]["; });
invalid("form-name-trailing-newline", "^...$ must not let a trailing newline through in a field name", `${FIELD(0)}/name`, "pattern", (d) => { at(d, FORM).props.items[0].name = `name${NEWLINE}`; });
invalid("form-name-too-long", "a field name has at most 40 characters", `${FIELD(0)}/name`, "pattern", (d) => { at(d, FORM).props.items[0].name = "n".repeat(41); });
invalid("form-name-missing", "every field has a name", FIELD(0), "required", (d) => { delete at(d, FORM).props.items[0].name; });
invalid("form-kind-unknown", "the kinds are text, email, textarea and checkbox: no hidden fields", `${FIELD(0)}/kind`, "enum", (d) => { at(d, FORM).props.items[0].kind = "hidden"; });
invalid("form-kind-file", "no file uploads", `${FIELD(0)}/kind`, "enum", (d) => { at(d, FORM).props.items[0].kind = "file"; });
invalid("form-required-missing", "whether a field must be filled in is always said", FIELD(1), "required", (d) => { delete at(d, FORM).props.items[1].required; });
invalid("form-required-string", "required is true or false", `${FIELD(1)}/required`, "type", (d) => { at(d, FORM).props.items[1].required = "yes"; });
invalid("form-label-blank", "a label has a visible character", `${FIELD(0)}/label`, "pattern", (d) => { at(d, FORM).props.items[0].label = `${NBSP}${ZERO_WIDTH_SPACE}`; });
invalid("form-label-newline", "a label is one line", `${FIELD(0)}/label`, "not", (d) => { at(d, FORM).props.items[0].label = `Name${NEWLINE}and surname`; });
invalid("form-label-too-long", "a label has at most 200 characters", `${FIELD(3)}/label`, "maxLength", (d) => { at(d, FORM).props.items[3].label = "x".repeat(201); });
invalid("form-text-without-limit", "a line of text says how long an answer may be", FIELD(0), "required", (d) => { delete at(d, FORM).props.items[0].maxLength; });
invalid("form-textarea-without-limit", "a longer text says how long an answer may be", FIELD(2), "required", (d) => { delete at(d, FORM).props.items[2].maxLength; });
invalid("form-text-limit-over", "a line of text takes at most 300 characters", `${FIELD(0)}/maxLength`, "maximum", (d) => { at(d, FORM).props.items[0].maxLength = 301; });
invalid("form-textarea-limit-over", "a longer text takes at most 5000 characters", `${FIELD(2)}/maxLength`, "maximum", (d) => { at(d, FORM).props.items[2].maxLength = 5001; });
invalid("form-limit-zero", "a limit is at least one character", `${FIELD(0)}/maxLength`, "minimum", (d) => { at(d, FORM).props.items[0].maxLength = 0; });
invalid("form-limit-fraction", "a limit is a whole number of characters", `${FIELD(2)}/maxLength`, "type", (d) => { at(d, FORM).props.items[2].maxLength = 100.5; });
invalid("form-email-with-limit", "an email address takes the standard's length: no limit of its own", FIELD(1), "not", (d) => { at(d, FORM).props.items[1].maxLength = 100; });
invalid("form-checkbox-with-limit", "a checkbox has no text to limit", FIELD(3), "not", (d) => { at(d, FORM).props.items[3].maxLength = 1; });
invalid("form-field-extra-key", "fields are closed: no placeholder or default value", `${FIELD(0)}/placeholder`, "additionalProperties", (d) => { at(d, FORM).props.items[0].placeholder = "Your name"; });
invalid("form-submit-label-blank", "the button's text has a visible character", `${FORM}/props/submitLabel`, "pattern", (d) => { at(d, FORM).props.submitLabel = " "; });
invalid("form-submit-label-too-long", "the button's text has at most 60 characters", `${FORM}/props/submitLabel`, "maxLength", (d) => { at(d, FORM).props.submitLabel = "x".repeat(61); });
invalid("form-confirmation-missing", "a form says what happens once it is sent", `${FORM}/props`, "required", (d) => { delete at(d, FORM).props.confirmation; });
invalid("form-confirmation-bell", "no control characters in the message", `${FORM}/props/confirmation`, "not", (d) => { at(d, FORM).props.confirmation = `Thank you.${BELL}`; });
invalid("form-confirmation-too-long", "the message has at most 500 characters", `${FORM}/props/confirmation`, "maxLength", (d) => { at(d, FORM).props.confirmation = "x".repeat(501); });
invalid("form-action-prop", "a form's address is the page's own: none is stored", `${FORM}/props/action`, "additionalProperties", (d) => { at(d, FORM).props.action = "https://elsewhere.example/collect"; });
invalid("form-style-color", "a form can only be hidden per device: it takes the theme's colours", `${FORM}/style/base/color`, "additionalProperties", (d) => { at(d, FORM).style.base.color = "primary"; });
invalid("form-with-children", "a form holds no blocks", `${FORM}/children`, "maxItems", (d) => { at(d, FORM).children.push(heading("in-form", 2, "In the form")); });

// =============================== INVALID: logo ==================================
invalid("logo-name-too-long", "a logo's name has at most 40 characters", `${LOGO}/props/name`, "maxLength", (d) => { at(d, LOGO).props.name = "N".repeat(41); });
invalid("logo-name-blank", "a name has a visible character: a logo without one leaves the name out", `${LOGO}/props/name`, "pattern", (d) => { at(d, LOGO).props.name = `${NBSP}${NBSP}`; });
invalid("logo-name-newline", "a name is one line", `${LOGO}/props/name`, "not", (d) => { at(d, LOGO).props.name = `Slack${NEWLINE}Water`; });
invalid("logo-name-number", "a name is text", `${LOGO}/props/name`, "type", (d) => { at(d, LOGO).props.name = 7; });
invalid("logo-href", "a logo with a name goes to the home page: no address is stored", `${LOGO}/props/href`, "additionalProperties", (d) => { at(d, LOGO).props.href = "https://elsewhere.example/"; });
invalid("logo-image", "the mark is the theme's drawing, never an image of the library", `${LOGO}/props/mediaId`, "additionalProperties", (d) => { at(d, LOGO).props.mediaId = "hero-dawn"; });
invalid("logo-style-text-size", "a logo's size is the theme's", `${LOGO}/style/base/textSize`, "additionalProperties", (d) => { at(d, LOGO).style.base.textSize = "display"; });
invalid("logo-with-children", "a logo holds no blocks", `${LOGO}/children`, "maxItems", (d) => { at(d, LOGO).children.push(heading("in-logo", 2, "In the logo")); });

// =============================== INVALID: menu ==================================
const MENU_LINK = (k: number): string => `${MENU}/props/items/${k}`;
invalid("menu-no-links", "a menu has at least one link", `${MENU}/props/items`, "minItems", (d) => { at(d, MENU).props.items = []; });
invalid("menu-13-links", "a menu has at most twelve links", `${MENU}/props/items`, "maxItems", (d) => {
  at(d, MENU).props.items.push(...Array.from({ length: 10 }, (_, k) => menuLink(`More ${k}`, `/more-${k}`)));
});
invalid("menu-label-missing", "a menu has a name for a screen reader", `${MENU}/props`, "required", (d) => { delete at(d, MENU).props.label; });
invalid("menu-label-too-long", "a menu's name has at most 40 characters", `${MENU}/props/label`, "maxLength", (d) => { at(d, MENU).props.label = "x".repeat(41); });
invalid("menu-label-blank", "a menu's name has a visible character", `${MENU}/props/label`, "pattern", (d) => { at(d, MENU).props.label = ZERO_WIDTH_SPACE.repeat(2); });
invalid("menu-link-null", "a link of a menu is a link", MENU_LINK(0), "type", (d) => { at(d, MENU).props.items[0] = null; });
invalid("menu-link-no-address", "a link has an address", MENU_LINK(0), "required", (d) => { delete at(d, MENU).props.items[0].href; });
invalid("menu-link-extra-member", "a link has a label and an address, nothing else: the page decides how it opens", `${MENU_LINK(0)}/target`, "additionalProperties", (d) => { at(d, MENU).props.items[0].target = "_blank"; });
invalid("menu-link-label-too-long", "a link's label has at most 40 characters", `${MENU_LINK(1)}/label`, "maxLength", (d) => { at(d, MENU).props.items[1].label = "L".repeat(41); });
invalid("menu-link-label-tab", "a link's label is one line", `${MENU_LINK(1)}/label`, "not", (d) => { at(d, MENU).props.items[1].label = `Winter${TAB}series`; });
invalid("menu-link-label-ideographic-space", "an ideographic space is blank", `${MENU_LINK(1)}/label`, "pattern", (d) => { at(d, MENU).props.items[1].label = IDEOGRAPHIC_SPACE; });
invalid("menu-link-href-javascript", "a menu's link follows a page's link rules", `${MENU_LINK(2)}/href`, "pattern", (d) => { at(d, MENU).props.items[2].href = "javascript:alert(1)"; });
invalid("menu-link-href-protocol-relative", "no //host address", `${MENU_LINK(2)}/href`, "pattern", (d) => { at(d, MENU).props.items[2].href = "//elsewhere.example/"; });
invalid("menu-link-href-newline-then-https", "the line-anchor trap", `${MENU_LINK(2)}/href`, "not", (d) => { at(d, MENU).props.items[2].href = `javascript:alert(1)${NEWLINE}https://ok.example`; });
invalid("menu-style-text-size", "a menu's size is the theme's: its fold is worked out at that size", `${MENU}/style/tablet/textSize`, "additionalProperties", (d) => { at(d, MENU).style.tablet.textSize = "large"; });
invalid("menu-style-background", "a menu takes the band's background", `${MENU}/style/base/background`, "additionalProperties", (d) => { at(d, MENU).style.base.background = "accent"; });
invalid("menu-with-children", "a menu holds no blocks", `${MENU}/children`, "maxItems", (d) => { at(d, MENU).children.push(button("in-menu", "In the menu", "/")); });

// =============================== INVALID: the text itself ======================
// Duplicate keys: JavaScript keeps the last value, Ruby's json 3 rejects the text.
invalidRaw("dup-key-type", "a block type given twice: each parser would see a different block (a rule)", `${H}/type`, "duplicateKey",
  (d) => { at(d, H).__RAW__ = 0; }, '"type": "image"');
invalidRaw("dup-key-escaped", "the second name spells type with an escaped t, and is still type (a rule)", `${H}/type`, "duplicateKey",
  (d) => { at(d, H).__RAW__ = 0; }, `"${uEscape("0074")}ype": "image"`);
invalidRaw("dup-key-title", "a duplicate at the top level (a rule)", "/title", "duplicateKey", (d) => { d.__RAW__ = 0; }, '"title": "Another title"');
invalidRaw("text-lone-surrogate-in-key", "a lone surrogate in a member name is reported on its object (a rule)", `${H}/props`, "wellFormed",
  (d) => { at(d, H).props.__RAW__ = 0; }, `"k${uEscape("d800")}": 1`);
{
  const s = serialise(BASE);
  const deepJunk = (levels: number): string => "[".repeat(levels) + "]".repeat(levels);
  const withJunk = replaceOnce(s, '"level": 1,', `"level": 1, "junk": ${deepJunk(200)},`, "nesting-200-levels");
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
const BASE_TEXT = serialise(BASE);
parseError("json-bom", "a byte-order mark before the document (a rule)", concat(bytes(0xef, 0xbb, 0xbf), TEXT_BYTES(BASE_TEXT)));
parseError("json-comment", "comments are not JSON (a rule)", TEXT_BYTES(replaceOnce(BASE_TEXT, '"schemaVersion": 1,', '"schemaVersion": 1, /* draft */', "json-comment")));
parseError("json-trailing-comma", "trailing commas are not JSON (a rule)", TEXT_BYTES(replaceOnce(BASE_TEXT, `"anchor": "join"${NEWLINE}`, `"anchor": "join",${NEWLINE}`, "json-trailing-comma")));
parseError("json-raw-tab-in-string", "a raw tab inside a string is not JSON; the escape is (a rule)", TEXT_BYTES(replaceOnce(BASE_TEXT, "Swim at slack water", `Swim at${TAB}slack water`, "json-raw-tab-in-string")));
parseError("json-nan", "NaN is not JSON (a rule)", TEXT_BYTES(replaceOnce(BASE_TEXT, '"zoom": 15', '"zoom": NaN', "json-nan")));
parseError("json-single-quotes", "single quotes are not JSON (a rule)", TEXT_BYTES(replaceOnce(BASE_TEXT, '"title": "Slack Water swimming club"', "'title': 'Slack Water swimming club'", "json-single-quotes")));
parseError("json-truncated", "a body cut short in transit (a rule)", TEXT_BYTES(BASE_TEXT.slice(0, 2000)));
parseError("json-two-documents", "text after the document (a rule)", TEXT_BYTES(BASE_TEXT + BASE_TEXT));
parseError("json-leading-zero", "numbers have no leading zero (a rule)", TEXT_BYTES(replaceOnce(BASE_TEXT, '"zoom": 15', '"zoom": 015', "json-leading-zero")));
{
  const [before, after] = BASE_TEXT.split("Swim at slack water") as [string, string];
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
// The corpus in corpus/, with its manifest.
const check = process.argv.includes("--check");
const same = (a: Uint8Array, b: Uint8Array): boolean => a.length === b.length && a.every((x, k) => x === b[k]);
function writeOrCheck(dir: string, corpusFiles: Map<string, Uint8Array>, corpusManifest: Record<string, ValidEntry | InvalidEntry>): string[] {
  const problems: string[] = [];
  const manifestText = JSON.stringify(Object.fromEntries([...Object.entries(corpusManifest)].sort(([a], [b]) => a.localeCompare(b))), null, 2) + "\n";
  for (const sub of ["valid", "invalid"]) {
    const folder = join(dir, sub);
    if (!existsSync(folder)) {
      if (check) problems.push(`missing folder ${sub}/`);
      else mkdirSync(folder, { recursive: true });
      continue;
    }
    for (const f of readdirSync(folder)) {
      if (!corpusFiles.has(`${sub}/${f}`)) {
        if (check) problems.push(`${sub}/${f} is on disk but not generated`);
        else rmSync(join(folder, f));
      }
    }
  }
  for (const [name, content] of [...corpusFiles, ["manifest.json", encoder.encode(manifestText)] as const]) {
    const path = join(dir, name);
    if (check) {
      if (!existsSync(path)) problems.push(`${name} is missing`);
      else if (!same(new Uint8Array(readFileSync(path)), content)) problems.push(`${name} differs from what the generator writes`);
    } else {
      writeFileSync(path, content);
    }
  }
  return problems;
}
const problems = writeOrCheck(CORPUS, files, manifest);
const counted = (corpusFiles: Map<string, Uint8Array>): string => {
  const nValid = [...corpusFiles.keys()].filter((f) => f.startsWith("valid/")).length;
  return `${corpusFiles.size} files (${nValid} valid, ${corpusFiles.size - nValid} invalid)`;
};
if (check) {
  for (const problem of problems) console.log(`  ${problem}`);
  console.log(problems.length === 0 ? `corpus is up to date: ${counted(files)}` : `corpus is NOT up to date: ${problems.length} difference(s)`);
  process.exit(problems.length === 0 ? 0 : 1);
}
console.log(`wrote ${counted(files)} and manifest.json`);
