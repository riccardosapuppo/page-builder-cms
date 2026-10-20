// The Assistant's plan of a page (./README.md): what a model is asked to
// write when a page is made from a brief. It has a schema of its own,
// PLAN_SCHEMA, smaller than the page's (schema/block-document.schema.json)
// and in words a model writes well: sections of columns of blocks, each
// block a kind and its words. ./build.ts turns a plan into the page's
// blocks, and the page's own validator decides as each one goes in.
//
// The schema is the subset of JSON Schema both providers hold a model's
// answer to (Anthropic's output_config.format, OpenAI's strict
// response_format): every object closed and every key required, enums of
// one value where a constant is meant, no counts or patterns, no
// references. What it cannot say, the reader below and ./build.ts check.
// No object of it is deeper than a form's field, five objects down from
// the plan: what a block holds in more depth is flattened into it.
//
// Blocks a model would have to invent the facts of are not in it: a video
// (its id), a map (its coordinates), a gallery of pictures the site may
// not have; nor the header's and footer's logo and menu, which are parts
// of the site, not of a page. Images come from the site's library, by id,
// a section's picture too; figures and prices only from the brief, which
// the question says.
//
// A section's picture says where it comes from (`source`): none, or the
// library, by id. A picture made for the page (a later step) is one more
// source of the same choice, read and built beside the library's.
import { FOCUS_TOKENS, ICON_NAMES, MOTION_TOKENS, type FocusToken, type IconName, type MotionToken } from "../shared/document.ts";

export const PLAN_WIDTHS = ["equal", "3:2", "2:3", "2:1", "1:2", "2:1:1", "1:2:1", "1:1:2"] as const;
export type PlanWidths = (typeof PLAN_WIDTHS)[number];
export const PLAN_BACKGROUNDS = ["none", "background", "soft", "muted", "primary", "accent", "text"] as const;
export type PlanBackground = (typeof PLAN_BACKGROUNDS)[number];
export const PLAN_ALIGNS = ["left", "center"] as const;
export type PlanAlign = (typeof PLAN_ALIGNS)[number];
export const PLAN_FIELD_TYPES = ["text", "email", "longtext", "checkbox"] as const;
export type PlanFieldType = (typeof PLAN_FIELD_TYPES)[number];
// A plan's picture always has a veil, at a strength words read through:
// the page's own settings take none and light too, by hand.
export const PLAN_VEILS = ["dark", "light", "text"] as const;
export type PlanVeil = (typeof PLAN_VEILS)[number];
export const PLAN_STRENGTHS = ["medium", "strong"] as const;
export type PlanStrength = (typeof PLAN_STRENGTHS)[number];
const LEVELS = [1, 2, 3, 4] as const;

export type PlanBlock =
  | { kind: "heading"; level: 1 | 2 | 3 | 4; text: string; display: boolean }
  | { kind: "text"; paragraphs: string[] }
  | { kind: "list"; ordered: boolean; items: string[] }
  | { kind: "button"; label: string; target: string }
  | { kind: "image"; mediaId: string; alt: string }
  | { kind: "iconbox"; icon: IconName; title: string; text: string }
  | { kind: "quote"; text: string; attribution: string }
  | { kind: "questions"; items: Array<{ question: string; answer: string }> }
  | { kind: "stats"; figures: Array<{ value: string; label: string }> }
  | { kind: "steps"; steps: Array<{ title: string; text: string }> }
  | { kind: "pricing"; plans: PlanOffer[] }
  | { kind: "form"; fields: Array<{ type: PlanFieldType; label: string; required: boolean }>; submitLabel: string; confirmation: string }
  | { kind: "divider" };
export type PlanBlockKind = PlanBlock["kind"];

// One plan of a pricing block, as a model writes it. Its button is two of
// its keys, not an object of its own, so the plan nests no deeper than a
// form's field; it leads where a button block's may (./build.ts).
export interface PlanOffer {
  name: string;
  price: string;
  period: string;
  text: string;
  features: string[];
  buttonLabel: string;
  buttonTarget: string;
  featured: boolean;
  badge: string;
}

export interface PlanColumn {
  align: PlanAlign;
  blocks: PlanBlock[];
}

// A section's picture: none, or one of the library's by id, with the veil
// that keeps its words readable, the veil's strength, and the point of it
// kept in view.
export type PlanPicture =
  | { source: "none" }
  | { source: "library"; mediaId: string; veil: PlanVeil; strength: PlanStrength; focus: FocusToken };

export interface PlanSection {
  label: string;
  anchor: string;
  background: PlanBackground;
  picture: PlanPicture;
  motion: MotionToken;
  widths: PlanWidths;
  columns: PlanColumn[];
}

export interface Plan {
  title: string;
  description: string;
  sections: PlanSection[];
}

// ------------------------------------------------------------- the schema

type Schema = Record<string, unknown>;
const text = (description: string): Schema => ({ type: "string", description });
const choice = (values: readonly string[], description: string): Schema => ({ type: "string", enum: [...values], description });
const flag = (description: string): Schema => ({ type: "boolean", description });
const list = (items: Schema, description: string): Schema => ({ type: "array", items, description });
const closed = (properties: Record<string, Schema>, description?: string): Schema => ({
  type: "object",
  additionalProperties: false,
  required: Object.keys(properties),
  properties,
  ...(description ? { description } : {}),
});
const kind = (name: PlanBlockKind): Schema => ({ type: "string", enum: [name] });

const BLOCK: Schema = {
  anyOf: [
    closed({
      kind: kind("heading"),
      level: { type: "integer", enum: [...LEVELS], description: "1 for the page's one main heading, 2 for a section's, 3 and 4 below those." },
      text: text("The heading's words, up to 80 characters."),
      display: flag("true only for the page's first heading, drawn larger."),
    }, "A heading."),
    closed({ kind: kind("text"), paragraphs: list(text("One paragraph of plain text, up to 600 characters."), "One to four paragraphs.") }, "Paragraphs of text."),
    closed({ kind: kind("list"), ordered: flag("true for steps in order, false for points."), items: list(text("One item, up to 160 characters."), "Two to eight items.") }, "A list."),
    closed({
      kind: kind("button"),
      label: text("What the button does, in two to four words."),
      target: text("Where it goes: #anchor of a section of this plan, the path of a page of the site listed, or an address the brief gives. Nothing else."),
    }, "A button."),
    closed({
      kind: kind("image"),
      mediaId: text("The id of an image of the site's library listed, as written there."),
      alt: text("What the image shows, for someone who cannot see it, up to 150 characters; empty when it only decorates."),
    }, "An image of the site's library."),
    closed({ kind: kind("iconbox"), icon: choice(ICON_NAMES, "The site's icon that fits."), title: text("Up to 60 characters."), text: text("Up to 200 characters.") }, "An icon with a short title and text, for points side by side."),
    closed({ kind: kind("quote"), text: text("Up to 300 characters."), attribution: text("Who said it, or empty.") }, "A quotation."),
    closed({
      kind: kind("questions"),
      items: list(closed({ question: text("Up to 120 characters."), answer: text("Up to 600 characters.") }), "Two to eight questions and their answers."),
    }, "Questions and answers, each opening on its own."),
    closed({
      kind: kind("stats"),
      figures: list(closed({
        value: text("The figure as the brief gives it, written as it is shown (12, 300+, 98%), up to 16 characters."),
        label: text("What it counts, up to 60 characters."),
      }), "Two to four figures, each one the brief gives."),
    }, "Key figures side by side, each a value and what it counts: only figures the brief gives."),
    closed({
      kind: kind("steps"),
      steps: list(closed({ title: text("Up to 60 characters."), text: text("What the step means, up to 300 characters.") }), "Two to six steps, in order."),
    }, "Numbered steps of a process the reader goes through, in order."),
    closed({
      kind: kind("pricing"),
      plans: list(closed({
        name: text("The plan's name, up to 40 characters."),
        price: text("Its price as the brief writes it, with its currency, or Free, up to 16 characters."),
        period: text("What the price is for (a month, a session), up to 30 characters; empty when the brief says none."),
        text: text("A sentence on the plan, from what the brief says of it, up to 200 characters; empty when it says nothing more."),
        features: list(text("One thing the plan includes, up to 80 characters."), "What the plan includes, as the brief says it: up to eight, or none."),
        buttonLabel: text("What the plan's button does, in two to four words."),
        buttonTarget: text("Where the plan's button goes, as a button's: #anchor of a section of this plan, the path of a page of the site listed, or an address the brief gives. Nothing else."),
        featured: flag("true for the one plan the brief puts forward, if it puts one forward."),
        badge: text("A few words on the featured plan's card, up to 20 characters, only as the brief says them; empty otherwise."),
      }), "One to four plans, as the brief gives them."),
    }, "Plans side by side with their prices: only when the brief gives the prices."),
    closed({
      kind: kind("form"),
      fields: list(closed({ type: choice(PLAN_FIELD_TYPES, "text: a line; email; longtext: a message; checkbox: a yes the visitor ticks."), label: text("Up to 80 characters."), required: flag("true when the answer is needed.") }), "One to six fields."),
      submitLabel: text("The send button's words, up to 30 characters."),
      confirmation: text("What the visitor reads once it is sent, up to 200 characters."),
    }, "A form whose answers the site keeps. At most one on a page."),
    closed({ kind: kind("divider") }, "A line between blocks."),
  ],
};

// A section's picture: one choice of objects, by where it comes from.
const PICTURE: Schema = {
  anyOf: [
    closed({ source: { type: "string", enum: ["none"] } }, "No picture behind the section."),
    closed({
      source: { type: "string", enum: ["library"] },
      mediaId: text("The id of an image of the site's library listed whose description fits this section, as written there."),
      veil: choice(PLAN_VEILS, "The layer over the picture that keeps the words readable: dark (light words), light (dark words), or text, the site's text colour (light words)."),
      strength: choice(PLAN_STRENGTHS, "How much of the picture the veil hides: medium, or strong where much text sits over it."),
      focus: choice(FOCUS_TOKENS, "The part of the picture kept in view where the section crops it: center, an edge or a corner."),
    }, "A picture of the site's library behind the section, covering it, under a veil."),
  ],
  description: "A picture behind the section, from the site's library, or none.",
};

export const PLAN_SCHEMA: Schema = closed({
  title: text("The page's title, for the browser's tab and search results, up to 60 characters."),
  description: text("One or two sentences for search results, up to 155 characters."),
  sections: list(closed({
    label: text("The section's name in the editor's outline, in one to three words."),
    anchor: text("A short name for links to the section, lowercase letters, digits and hyphens, starting with a letter; empty when nothing links to it."),
    background: choice(PLAN_BACKGROUNDS, "A colour of the site's palette behind the section, or none."),
    picture: PICTURE,
    motion: choice(MOTION_TOKENS, "How the section comes into view as the reader scrolls to it: none, rise (up from a little below), fade, or zoom (from a little smaller)."),
    widths: choice(PLAN_WIDTHS, "How the columns share the width: equal, or a ratio with as many parts as there are columns."),
    columns: list(closed({
      align: choice(PLAN_ALIGNS, "How the column's blocks line up."),
      blocks: list(BLOCK, "The column's blocks, top to bottom."),
    }), "One to four columns, side by side on a wide screen."),
  }), "The page's sections, top to bottom, four to eight of them."),
});

// ------------------------------------------------------------- the reader

// What a model sent, read without trusting it: each value checked as the
// schema says, anything else left out. A block of a kind the plan does not
// have, or with a value that does not fit, is null; so is a section with
// no column left. ./build.ts takes what is left.
const isText = (value: unknown): value is string => typeof value === "string";
const word = (value: unknown): string => (isText(value) ? value : "");
const one = <T extends string>(value: unknown, values: readonly T[], otherwise: T): T => (values.includes(value as T) ? (value as T) : otherwise);
const items = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const record = (value: unknown): Record<string, unknown> | null => (typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null);

export function readBlock(value: unknown): PlanBlock | null {
  const block = record(value);
  if (!block) return null;
  switch (block.kind) {
    case "heading":
      return { kind: "heading", level: LEVELS.includes(block.level as 1) ? (block.level as 1 | 2 | 3 | 4) : 2, text: word(block.text), display: block.display === true };
    case "text":
      return { kind: "text", paragraphs: items(block.paragraphs).filter(isText) };
    case "list":
      return { kind: "list", ordered: block.ordered === true, items: items(block.items).filter(isText) };
    case "button":
      return { kind: "button", label: word(block.label), target: word(block.target) };
    case "image":
      return { kind: "image", mediaId: word(block.mediaId), alt: word(block.alt) };
    case "iconbox":
      return { kind: "iconbox", icon: one(block.icon, ICON_NAMES, "info"), title: word(block.title), text: word(block.text) };
    case "quote":
      return { kind: "quote", text: word(block.text), attribution: word(block.attribution) };
    case "questions":
      return {
        kind: "questions",
        items: items(block.items).map(record).filter((item) => item !== null).map((item) => ({ question: word(item.question), answer: word(item.answer) })),
      };
    case "stats":
      return {
        kind: "stats",
        figures: items(block.figures).map(record).filter((figure) => figure !== null).map((figure) => ({ value: word(figure.value), label: word(figure.label) })),
      };
    case "steps":
      return {
        kind: "steps",
        steps: items(block.steps).map(record).filter((step) => step !== null).map((step) => ({ title: word(step.title), text: word(step.text) })),
      };
    case "pricing":
      return {
        kind: "pricing",
        plans: items(block.plans).map(record).filter((plan) => plan !== null).map((plan) => ({
          name: word(plan.name), price: word(plan.price), period: word(plan.period), text: word(plan.text), features: items(plan.features).filter(isText),
          buttonLabel: word(plan.buttonLabel), buttonTarget: word(plan.buttonTarget), featured: plan.featured === true, badge: word(plan.badge),
        })),
      };
    case "form":
      return {
        kind: "form",
        fields: items(block.fields).map(record).filter((field) => field !== null)
          .map((field) => ({ type: one(field.type, PLAN_FIELD_TYPES, "text"), label: word(field.label), required: field.required === true })),
        submitLabel: word(block.submitLabel),
        confirmation: word(block.confirmation),
      };
    case "divider":
      return { kind: "divider" };
    default:
      return null;
  }
}

// A section's picture: one of the library's, with a veil the plan offers,
// or none for anything else (a plan written before pictures, a source the
// plan does not have).
export function readPicture(value: unknown): PlanPicture {
  const picture = record(value);
  if (picture?.source !== "library") return { source: "none" };
  return {
    source: "library",
    mediaId: word(picture.mediaId),
    veil: one(picture.veil, PLAN_VEILS, "dark"),
    strength: one(picture.strength, PLAN_STRENGTHS, "medium"),
    focus: one(picture.focus, FOCUS_TOKENS, "center"),
  };
}

export function readSection(value: unknown): PlanSection | null {
  const section = record(value);
  if (!section) return null;
  const columns = items(section.columns).map(record).filter((column) => column !== null).map((column) => ({
    align: one(column.align, PLAN_ALIGNS, "left"),
    blocks: items(column.blocks).map(readBlock).filter((block) => block !== null),
  }));
  if (columns.length === 0) return null;
  return {
    label: word(section.label),
    anchor: word(section.anchor),
    background: one(section.background, PLAN_BACKGROUNDS, "none"),
    picture: readPicture(section.picture),
    motion: one(section.motion, MOTION_TOKENS, "none"),
    widths: one(section.widths, PLAN_WIDTHS, "equal"),
    columns,
  };
}
