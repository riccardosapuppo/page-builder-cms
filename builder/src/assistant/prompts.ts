// What the Assistant asks a model (./README.md), and the schemas of the
// answers it takes: a page's plan (./plan.ts), a text written again, an
// image described. The questions carry the site's own facts (its palette,
// its library, its pages, its icons) so that what comes back fits the
// site and names only what it has; and every one says the same thing about
// facts: the person's words are the only source, nothing is made up.
import type { PaletteSlot } from "../shared/document.ts";
import { ICON_NAMES, PALETTE_SLOTS } from "../shared/document.ts";
// What each of the site's icons shows, for a model to pick one.
import { ICON_WORDS } from "../widgets/iconbox/words.ts";
import type { Question } from "./providers.ts";
import { PLAN_SCHEMA } from "./plan.ts";

export interface SiteWords {
  palette: Readonly<Record<PaletteSlot, string>>;
  // Each image's size, where the library knows it, says its shape.
  media: ReadonlyArray<{ id: string; alt: string; width?: number | null; height?: number | null }>;
  pages: ReadonlyArray<{ path: string; title: string }>;
}

const FACTS = "Use only the facts the person gives: never make up a price, a date, a time, a name, an address, a number, a quotation or a review. Where a fact is missing, write around it.";

const listed = (rows: readonly string[], none: string): string => (rows.length === 0 ? `  (${none})` : rows.map((row) => `  - ${row}`).join("\n"));

// "wide, 1600 by 900": an image's shape, from its size, for a section's
// picture, which a wide one covers best.
function shapeOf(item: SiteWords["media"][number]): string {
  if (!item.width || !item.height) return "size unknown";
  const ratio = item.width / item.height;
  return `${ratio > 1.15 ? "wide" : ratio < 0.87 ? "tall" : "square"}, ${item.width} by ${item.height}`;
}

export function pageQuestion(model: string, brief: string, site: SiteWords): Question {
  const system = [
    "You plan one web page for a page builder, and you plan it as a designer would: a page with rhythm and life, never plain bands of text one after another. The builder turns your plan into sections of columns of blocks, and the person sees the page grow as you write it.",
    "Write the page's words in the language the person writes in.",
    "",
    "The site:",
    `- Its palette, the colours a section's background may be (the builder draws words in the colour that reads on each):\n${PALETTE_SLOTS.map((slot) => `  - ${slot}: ${site.palette[slot]}`).join("\n")}`,
    `- Its library of images, by id, with what each shows and its shape. Use only these ids, and an image, or a section's picture, only where what it shows fits the page:\n${listed(site.media.map((item) => `${item.id}: ${item.alt || "no description"} (${shapeOf(item)})`), "no images: use none, and no picture")}`,
    `- Its pages, by path: a button may lead to one of them.\n${listed(site.pages.map((page) => `${page.path}: ${page.title}`), "no other pages")}`,
    `- Its icons, for icon boxes, by name, with what each shows:\n${ICON_NAMES.map((name) => `  - ${name}: ${ICON_WORDS[name]}`).join("\n")}`,
    "",
    "How to plan the page:",
    "- Four to eight sections that read as one sequence, each with one job.",
    "- A strong opening: the page's one level 1 heading (display: true), a sentence or two on what the reader gets, and the page's call to action as a button. Behind it a picture of the library when one fits the page; else a strong band (primary or text) or soft.",
    "- Bands that alternate. A full band (a picture, primary, text or muted) after light ones (none, background or soft); a dense section (three or four columns side by side) after an airy one (one column, or two at 3:2 or 2:3). Never two sections in a row with the same background and the same number of columns, except a heading's section and the points it announces, which share their band.",
    "- Points side by side as icon boxes: three or four, each in a column of its own, each with the icon that fits it best, a title of a few words and one sentence. Announce them with a section of one column, aligned center, holding their level 2 heading and a sentence.",
    "- Figures and steps where the brief gives them: the brief's key numbers as stats, a process the reader goes through as steps.",
    "- One clear call to action: the opening's button, with the same words and the same target as the button of the last section, which ends the page on it. At most one other button between them.",
    "- Motion with restraint: rise or fade on two or three sections after the opening, zoom once at most, none on the opening, which is in view as the page opens, and none on the others.",
    "- A picture behind a section only from the library, and only where what it shows fits: at most two on a page, the opening's and perhaps the last one's. Its veil keeps the words over it readable: dark or text under light words, light under dark ones, strong where much text sits over it. Its focus is where its subject is.",
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
  return { model, system, text: `The page the person wants:\n\n${brief.trim()}`, schema: PLAN_SCHEMA, name: "page_plan", maxTokens: 32000, effort: "medium" };
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
