// What the Assistant asks a model (./README.md), and the schemas of the
// answers it takes: a page's plan (./plan.ts), a new site's direction
// (./direction.ts), a text written again, an image described, an
// illustration drawn. The questions carry the site's own facts (its
// palette, its library, its pages, its icons) so that what comes back
// fits the site and names only what it has, and a new site's pages its
// direction too; and every one says the same thing about facts: the
// person's words are the only source, nothing is made up. A picture made
// for a page never holds words and never shows a real person or a brand,
// whoever makes it.
import type { PaletteSlot } from "../shared/document.ts";
import { ICON_NAMES, PALETTE_SLOTS } from "../shared/document.ts";
import type { SiteStyle } from "../storage/adapter.ts";
// What each of the site's icons shows, for a model to pick one.
import { ICON_WORDS } from "../widgets/iconbox/words.ts";
import { directionSchema, SITE_PAGES_LEAST, SITE_PAGES_MOST, SLOT_USES, slotsOf, type DirectionColor, type DirectionMotion } from "./direction.ts";
import type { PictureKind } from "./pictures.ts";
import { VIEW_BOXES } from "./pictures.ts";
import type { Question } from "./providers.ts";
import { PLAN_MADE_MOST, PLAN_SCHEMA, PLAN_SCHEMA_MADE, type PlanMade } from "./plan.ts";

export interface SiteWords {
  palette: Readonly<Record<PaletteSlot, string>>;
  // Each image's size, where the library knows it, says its shape.
  media: ReadonlyArray<{ id: string; alt: string; width?: number | null; height?: number | null }>;
  pages: ReadonlyArray<{ path: string; title: string }>;
}

const FACTS = "Use only the facts the person gives: never make up a price, a date, a time, a name, an address, a number, a quotation or a review. Where a fact is missing, write around it.";
// What a picture made for a page never holds, whoever makes it.
const NO_WORDS = "Never text in a picture: no words, letters, numbers, signs or logos. The page's words carry those.";
const NO_ONE_REAL = "People in a picture, if any, are generic and unnamed: never a real person, a brand or a trademark.";
// How each kind of picture is made, in the question's words.
const MADE_WORDS: Readonly<Record<PictureKind, string>> = {
  photo: "photographs, natural light on real places, people and things, as a photographer would take them for this page",
  illustration: "flat vector illustrations in the site's palette, simple shapes, as a designer would draw them for this page",
};

const listed = (rows: readonly string[], none: string): string => (rows.length === 0 ? `  (${none})` : rows.map((row) => `  - ${row}`).join("\n"));

// "wide, 1600 by 900": an image's shape, from its size, for a section's
// picture, which a wide one covers best.
function shapeOf(item: SiteWords["media"][number]): string {
  if (!item.width || !item.height) return "size unknown";
  const ratio = item.width / item.height;
  return `${ratio > 1.15 ? "wide" : ratio < 0.87 ? "tall" : "square"}, ${item.width} by ${item.height}`;
}

// A page of a new site, as its direction (./direction.ts) sets it: the
// site's name, voice, colours with their roles, imagery and motion, its
// call to action, this page's title and purpose, and how many pictures may
// be made for it (`most`), the site's budget shared among its pages.
export interface PageDirection {
  name: string;
  voice: string;
  palette: Readonly<Record<string, DirectionColor>>;
  imagery: string;
  motion: DirectionMotion;
  action: string;
  page: { title: string; purpose: string; path: string; home: boolean };
  // The site's pages, this one among them, each with its purpose.
  pages: ReadonlyArray<{ path: string; title: string; purpose: string }>;
  most: number;
}

// How the sections move, by the direction's motion; with none given, the
// rule of a page of the site as it is.
const MOTION_WORDS: Readonly<Record<DirectionMotion, string>> = {
  none: "- No motion: every section's motion is none.",
  little: "- A little motion: rise or fade on one or two sections after the opening, none on the opening, which is in view as the page opens, and none on the others.",
  some: "- Motion with restraint: rise or fade on two or three sections after the opening, zoom once at most, none on the opening, which is in view as the page opens, and none on the others.",
};

// The page's question. With `pictures`, the kind the person's provider
// makes, a section's picture and an image may be made for the page (the
// plan's schema with made pictures), at most PLAN_MADE_MOST, or the most
// a new site's direction leaves this page. With `direction`, the page is
// one of a new site's: written to its direction, its links among the new
// site's pages.
export function pageQuestion(model: string, brief: string, site: SiteWords, pictures: PictureKind | null = null, direction: PageDirection | null = null): Question {
  const made = pictures !== null;
  const most = direction?.most ?? PLAN_MADE_MOST;
  const library = made
    ? "Use only these ids for the library's images, and one only where what it shows fits the page; where none fits, a picture may be made for the page instead"
    : "Use only these ids, and an image, or a section's picture, only where what it shows fits the page";
  const palette = PALETTE_SLOTS.map((slot) => {
    const role = direction?.palette[slot]?.role ?? "";
    return `  - ${slot}: ${site.palette[slot]}${role === "" ? "" : ` (${role})`}`;
  }).join("\n");
  const pages = direction
    ? listed(direction.pages.map((page) => `${page.path}: ${page.title}${page.path === direction.page.path ? " (this page)" : ""}${page.purpose === "" ? "" : `: ${page.purpose}`}`), "no other pages")
    : listed(site.pages.map((page) => `${page.path}: ${page.title}`), "no other pages");
  const system = [
    direction
      ? "You plan one page of a new web site for a page builder, and you plan it as a designer would: a page with rhythm and life, never plain bands of text one after another. The builder turns your plan into sections of columns of blocks, and the person sees the page grow as you write it."
      : "You plan one web page for a page builder, and you plan it as a designer would: a page with rhythm and life, never plain bands of text one after another. The builder turns your plan into sections of columns of blocks, and the person sees the page grow as you write it.",
    "Write the page's words in the language the person writes in.",
    ...(direction ? [
      "",
      "The new site, as its direction sets it:",
      `- Its name: ${direction.name}. Its voice: ${direction.voice || "plain and warm"} Write every word in it.`,
      `- This page: “${direction.page.title}”, at ${direction.page.path}${direction.page.purpose === "" ? "." : `: ${direction.page.purpose}`}${direction.page.home ? " It is the site's home page: its opening says what the site is and offers." : ""} Write this page only: the site's other pages hold the rest, and a button may lead to them.`,
      `- Its call to action: “${direction.action}”. The page's call to action uses these words where they fit, and leads to where it happens: a section of this page, or the site's page for it.`,
      ...(made && direction.imagery !== "" ? [`- Its imagery: ${direction.imagery}`] : []),
    ] : []),
    "",
    "The site:",
    `- Its palette, the colours a section's background may be (the builder draws words in the colour that reads on each):\n${palette}`,
    `- Its library of images, by id, with what each shows and its shape. ${library}:\n${listed(site.media.map((item) => `${item.id}: ${item.alt || "no description"} (${shapeOf(item)})`), made ? "no images: make the pictures the page needs" : "no images: use none, and no picture")}`,
    `- Its pages, by path: a button may lead to one of them.\n${pages}`,
    `- Its icons, for icon boxes, by name, with what each shows:\n${ICON_NAMES.map((name) => `  - ${name}: ${ICON_WORDS[name]}`).join("\n")}`,
    "",
    "How to plan the page:",
    "- Four to eight sections that read as one sequence, each with one job.",
    made
      ? "- A strong opening: the page's one level 1 heading (display: true), a sentence or two on what the reader gets, and the page's call to action as a button. Behind it a picture: the library's when one fits the page, else one made for it."
      : "- A strong opening: the page's one level 1 heading (display: true), a sentence or two on what the reader gets, and the page's call to action as a button. Behind it a picture of the library when one fits the page; else a strong band (primary or text) or soft.",
    "- Bands that alternate. A full band (a picture, primary, text or muted) after light ones (none, background or soft); a dense section (three or four columns side by side) after an airy one (one column, or two at 3:2 or 2:3). Never two sections in a row with the same background and the same number of columns, except a heading's section and the points it announces, which share their band.",
    "- Points side by side as icon boxes: three or four, each in a column of its own, each with the icon that fits it best, a title of a few words and one sentence. Announce them with a section of one column, aligned center, holding their level 2 heading and a sentence.",
    "- Figures and steps where the brief gives them: the brief's key numbers as stats, a process the reader goes through as steps.",
    "- One clear call to action: the opening's button, with the same words and the same target as the button of the last section, which ends the page on it. At most one other button between them.",
    MOTION_WORDS[direction?.motion ?? "some"],
    made
      ? "- A picture behind a section from the library where one fits, else made for the page, and only where it serves the section: at most two on a page, the opening's and perhaps the last one's. Its veil keeps the words over it readable: dark or text under light words, light under dark ones, strong where much text sits over it. Its focus is where its subject is."
      : "- A picture behind a section only from the library, and only where what it shows fits: at most two on a page, the opening's and perhaps the last one's. Its veil keeps the words over it readable: dark or text under light words, light under dark ones, strong where much text sits over it. Its focus is where its subject is.",
    ...(made ? [
      `- Pictures made for this page (source made) are ${MADE_WORDS[pictures]}${direction && direction.imagery !== "" ? `, in the site's imagery` : ""}. At most ${most} on the page, where they matter: the opening's picture, a band that shows what the page offers, cards side by side (an image above each card's words). Each one costs the person: make none where the page does not need it.`,
      "- For each picture made: a prompt that says what it shows (its subject, its setting, its light and its framing, in one to three sentences, in English); its alt text, in the page's language; its shape, landscape (3:2) behind a section or across a column, square or portrait (2:3) for cards.",
      `- ${NO_WORDS}`,
      `- ${NO_ONE_REAL}`,
    ] : []),
    `- ${FACTS}`,
    "- Words for people: short sentences, concrete, nothing to fill space, no placeholder text.",
    "- Headings: level 1 once, first; level 2 for each section; level 3 below. Steps and plans are titled at level 3: give their section its level 2 heading first.",
    "- A button, a plan's too, leads to a section of this plan (#its-anchor), to one of the site's pages (its path), or to an address the person gives. Nothing else.",
    "- At most one form, with only the fields its purpose needs, and only if the page asks the reader to send something.",
    "- Stats only for a few key figures the brief gives, each its value and what it counts; never a figure the brief does not hold.",
    "- Steps for a process the reader goes through, in order, each a title and a short text.",
    "- Pricing only when the brief gives prices: its plans, each with its price and period as the brief writes them, what it includes and a button; one plan featured at most. Never a plan, a price or a feature the brief does not hold.",
    "- One to four columns in a section: two or three for things side by side; widths with as many parts as there are columns, or equal.",
    "- Backgrounds: the full bands for the sections that must stand out, the light ones between them. Buttons, a plan's too, are drawn in the accent colour and a form's send key in the primary one: never put a button or pricing on accent, or a form on primary.",
  ].join("\n");
  return { model, system, text: `The page the person wants:\n\n${brief.trim()}`, schema: made ? PLAN_SCHEMA_MADE : PLAN_SCHEMA, name: "page_plan", maxTokens: 32000, effort: "medium" };
}

// ------------------------------------------------------------ a new site

// A new site's direction (./direction.ts), asked first, from the brief
// alone: its name, voice, colours with their roles, type, imagery, motion,
// call to action and pages, in a schema made for the site style, which
// holds the colours to its slots and the type to its choices. The kind of
// pictures the person's provider makes is said, for the imagery.
export function directionQuestion(model: string, brief: string, style: Pick<SiteStyle, "choices">, pictures: PictureKind | null): Question {
  const slots = slotsOf(style);
  const kind = pictures === null ? "the library's, as no picture is made for it" : pictures === "photo" ? "photographs" : "flat vector illustrations";
  const system = [
    "You set the direction of a new web site from the person's brief, as an art director would: its name, its voice, its colours, its type, its imagery, its motion, its call to action and its pages. A page builder then gives the site this style, builds its header and its footer from it, and writes each page to it.",
    "Write in the language the person writes in: the name, the tagline and the pages' titles too.",
    "",
    "- The name: the one the brief gives; else two or three words made from what the brief says, never a real brand's or a real person's.",
    "- The tagline: one short line that says what the site offers.",
    "- The voice: how the site's words sound, in one sentence.",
    `- The colours: one for each slot of the site's palette, as #rrggbb, each with its role on this site. What the site does with each slot:\n${slots.map((slot) => `  - ${slot}: ${SLOT_USES[slot as PaletteSlot] ?? "a colour of the site's"}`).join("\n")}`,
    "- A palette of the site's own, chosen for this brief, whose colours read on each other: body text on the background, the background's colour on primary and on muted, the text's on accent and on soft, each at 4.5 to 1 at least (WCAG's AA). A colour that does not is changed before it is used.",
    "- The type: a type scale and a letter width for the headings, among the choices the schema gives.",
    `- The imagery: one sentence on the style of the site's pictures, which are ${kind}: what they show, their light, their colours, their framing.`,
    "- The motion: none, little or some, as the brief's tone asks.",
    "- The call to action: what a visitor does first, in two to four words.",
    `- The pages: ${SITE_PAGES_LEAST} or ${SITE_PAGES_MOST}, the first the home page, and only those the brief gives the matter for. Each a title of one to three words (it is the page's link in the menu), a short address (lowercase letters, digits and hyphens; the home page's is the site's name as an address), and its purpose in one sentence.`,
    `- ${FACTS} The direction itself names no price, date, address or review: the pages take those from the brief, where it gives them.`,
  ].join("\n");
  return { model, system, text: `The site the person wants:\n\n${brief.trim()}`, schema: directionSchema(style), name: "site_direction", maxTokens: 8000, effort: "medium" };
}

// ------------------------------------------------------- pictures made

// What the Images API is asked for a photo: what the plan says it shows,
// the style of a new site's imagery where its direction gives one, and the
// two rules every picture made for a page keeps.
export function photoPrompt(made: Pick<PlanMade, "prompt">, imagery = ""): string {
  const style = imagery.trim() === "" ? "" : `\n\nThe site's imagery: ${imagery.trim()}`;
  return `${made.prompt.trim()}${style}\n\nA photograph for a web page. ${NO_WORDS} ${NO_ONE_REAL}`;
}

// An illustration: one SVG document, in a small schema of its own.
export const SVG_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["svg"],
  properties: { svg: { type: "string", description: "The illustration: one SVG document, its svg element the root, nothing before or after it." } },
} as const;

// One illustration drawn by the model the person chose (./svg.ts says what
// it may hold), in the site's palette, given as hex, in the style of a new
// site's imagery where its direction gives one.
export function illustrationQuestion(model: string, made: Pick<PlanMade, "prompt" | "shape">, palette: Readonly<Record<PaletteSlot, string>>, imagery = ""): Question {
  const viewBox = VIEW_BOXES[made.shape];
  const system = [
    "You draw one illustration for a web page, as an SVG document written by hand: flat, simple vector art, like a poster or a print, never a photograph.",
    `- Its colours are the site's palette, as hex, and white or black where needed: ${PALETTE_SLOTS.map((slot) => `${slot} ${palette[slot]}`).join(", ")}. Flat fills; a gradient or two at most.`,
    ...(imagery.trim() === "" ? [] : [`- The site's imagery, which it keeps to as far as flat shapes can: ${imagery.trim()}`]),
    `- ${NO_WORDS}`,
    `- ${NO_ONE_REAL} Draw people as simple figures.`,
    `- The root is <svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">, with no width or height. Its first shape is a rect that fills the whole viewBox in one of the palette's colours.`,
    "- Only these elements: svg, g, defs, path, rect, circle, ellipse, line, polyline, polygon, linearGradient, radialGradient, stop.",
    "- Only these attributes: the shapes' geometry (x, y, width, height, rx, ry, cx, cy, r, x1, y1, x2, y2, points, d), fill, stroke, stroke-width, stroke-linecap, stroke-linejoin, opacity, fill-opacity, stroke-opacity, transform with numbers; on a gradient its id and coordinates, and on a stop offset, stop-color and stop-opacity. A gradient is used as fill=\"url(#its-id)\".",
    "- Nothing else: no style, class, script, text, image, use, href, filter, mask, clipPath, pattern, animation or foreignObject, no comments, no entities.",
    "- Small: a few kilobytes, about thirty shapes at most, coordinates in whole numbers.",
  ].join("\n");
  // Asked once, as every picture is: never tried again behind the person's back.
  return { model, system, text: `The illustration shows: ${made.prompt.trim()}`, schema: SVG_SCHEMA, name: "illustration", maxTokens: 16000, effort: "low", once: true };
}

// ------------------------------------------------------- written again

export const REWRITES = [
  { id: "shorter", name: "Shorter", asks: "Make it about half as long, keeping what matters most." },
  { id: "longer", name: "Longer", asks: "Develop it a little, about half as long again, saying more of what it already says." },
  { id: "simpler", name: "Simpler", asks: "Use plainer words and shorter sentences." },
  { id: "warmer", name: "Warmer", asks: "Make the tone warmer and more personal." },
  { id: "formal", name: "More formal", asks: "Make the tone more formal." },
  { id: "fix", name: "Fix spelling", asks: "Correct the spelling, grammar and punctuation only, and change nothing else." },
] as const;
export type RewriteId = (typeof REWRITES)[number]["id"];

// A heading: one line back.
export const LINE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["text"],
  properties: { text: { type: "string", description: "The words written again, one line, no quotation marks around them." } },
} as const;

// A text: its paragraphs and lists back, in order. Bold, italic and links
// are not kept (the interface says so before the person takes it).
export const TEXT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["blocks"],
  properties: {
    blocks: {
      type: "array",
      description: "The text's paragraphs and lists, in order.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["kind", "lines"],
        properties: {
          kind: { type: "string", enum: ["paragraph", "bullets", "numbers"], description: "A paragraph, a list of points, or a list of steps in order." },
          lines: { type: "array", items: { type: "string" }, description: "A paragraph's one line, or a list's items." },
        },
      },
    },
  },
} as const;

export function rewriteQuestion(model: string, asks: string, words: string, what: "heading" | "text", page: string): Question {
  const system = [
    "You write one text of a web page again, as the person asks.",
    `- ${FACTS} Keep every fact and the meaning; add none.`,
    "- Keep the text's language unless the person asks for another.",
    what === "heading" ? "- It is a heading: keep it a heading, one line." : "- Keep its paragraphs and lists as paragraphs and lists, unless the person asks otherwise.",
    "- Plain words only: no markdown, no quotation marks around the whole.",
  ].join("\n");
  return {
    model,
    system,
    text: `What the person asks: ${asks.trim()}\n\nThe ${what} (on the page “${page}”):\n\n${words}`,
    schema: what === "heading" ? LINE_SCHEMA : TEXT_SCHEMA,
    name: what === "heading" ? "heading_text" : "text_blocks",
    maxTokens: 8000,
    effort: "low",
  };
}

// ------------------------------------------------------ an image described

export const IMAGE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["decorative", "alt"],
  properties: {
    decorative: { type: "boolean", description: "true when the image only decorates and says nothing the page needs." },
    alt: { type: "string", description: "What the image shows that matters on this page, in one sentence of up to 125 characters; empty when decorative." },
  },
} as const;

export function describeQuestion(model: string, image: { mediaType: string; base64: string }, near: { page: string; words: string; library: string }): Question {
  const system = [
    "You write the alternative text of an image on a web page, for a person who cannot see it.",
    "- Say what the image shows that matters here, in one sentence of up to 125 characters, in the page's language.",
    "- Do not begin with “Image of” or “Picture of”; do not guess at names, places or text you cannot read in it.",
    "- When the image only decorates and the page loses nothing without it, set decorative and leave alt empty.",
  ].join("\n");
  const text = [
    `The page: “${near.page}”.`,
    near.words ? `Next to the image: ${near.words}` : "",
    near.library ? `The site's library describes it as: ${near.library}` : "",
  ].filter(Boolean).join("\n");
  return { model, system, text, image, schema: IMAGE_SCHEMA, name: "image_text", maxTokens: 4000, effort: "low" };
}
