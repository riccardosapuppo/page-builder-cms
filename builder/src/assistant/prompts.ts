// What the Assistant asks a model (./README.md), and the schemas of the
// answers it takes: a page's plan (./plan.ts), a text written again, an
// image described. The questions carry the site's own facts (its palette,
// its library, its pages, its icons) so that what comes back fits the
// site and names only what it has; and every one says the same thing about
// facts: the person's words are the only source, nothing is made up.
import type { IconName, PaletteSlot } from "../shared/document.ts";
import { ICON_NAMES, PALETTE_SLOTS } from "../shared/document.ts";
import type { Question } from "./providers.ts";
import { PLAN_SCHEMA } from "./plan.ts";

export interface SiteWords {
  palette: Readonly<Record<PaletteSlot, string>>;
  media: ReadonlyArray<{ id: string; alt: string }>;
  pages: ReadonlyArray<{ path: string; title: string }>;
}

// What each of the site's icons shows, for a model to pick one.
const ICON_WORDS: Readonly<Record<IconName, string>> = {
  sunrise: "a sunrise: mornings, a start, a new season",
  buoys: "buoys on the water: the sea, swimming, a route",
  cup: "a cup: a drink, a café, a pause",
  calendar: "a calendar: a date, an event, a season",
  clock: "a clock: a time, opening hours, how long",
  pin: "a map pin: a place, an address, where to meet",
  globe: "a globe: the world, travel, languages",
  info: "an i: information, a note, anything else",
};

const FACTS = "Use only the facts the person gives: never make up a price, a date, a time, a name, an address, a number, a quotation or a review. Where a fact is missing, write around it.";

const listed = (rows: readonly string[], none: string): string => (rows.length === 0 ? `  (${none})` : rows.map((row) => `  - ${row}`).join("\n"));

export function pageQuestion(model: string, brief: string, site: SiteWords): Question {
  const system = [
    "You plan one web page for a page builder. The builder turns your plan into sections of columns of blocks, and the person sees the page grow as you write it.",
    "Write the page's words in the language the person writes in.",
    "",
    "The site:",
    `- Its palette, the colours a section's background may be (the builder draws words in the colour that reads on each):\n${PALETTE_SLOTS.map((slot) => `  - ${slot}: ${site.palette[slot]}`).join("\n")}`,
    `- Its library of images, by id, with what each shows. Use only these ids, and an image only where it helps:\n${listed(site.media.map((item) => `${item.id}: ${item.alt || "no description"}`), "no images: use none")}`,
    `- Its pages, by path: a button may lead to one of them.\n${listed(site.pages.map((page) => `${page.path}: ${page.title}`), "no other pages")}`,
    `- Its icons, for icon boxes:\n${ICON_NAMES.map((name) => `  - ${name}: ${ICON_WORDS[name]}`).join("\n")}`,
    "",
    "How to plan:",
    "- Three to seven sections. Open with what the page is for, in its one level 1 heading (display: true); end with what the reader can do next.",
    `- ${FACTS}`,
    "- Words for people: short sentences, concrete, nothing to fill space, no placeholder text.",
    "- Headings: level 1 once, first; level 2 for each section; level 3 below.",
    "- A button leads to a section of this plan (#its-anchor), to one of the site's pages (its path), or to an address the person gives. Nothing else.",
    "- At most one form, with only the fields its purpose needs, and only if the page asks the reader to send something.",
    "- One to four columns in a section: two or three for things side by side; widths with as many parts as there are columns, or equal.",
    "- Backgrounds: mostly none or background; soft or muted to set a section apart; primary, accent or text for one section that must stand out.",
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
