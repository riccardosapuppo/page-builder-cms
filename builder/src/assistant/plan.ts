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
//
// Blocks a model would have to invent the facts of are not in it: a video
// (its id), a map (its coordinates), a gallery of pictures the site may
// not have; nor the header's and footer's logo and menu, which are parts
// of the site, not of a page. Images come from the site's library, by id.
import { ICON_NAMES, type IconName } from "../shared/document.ts";

export const PLAN_WIDTHS = ["equal", "3:2", "2:3", "2:1", "1:2", "2:1:1", "1:2:1", "1:1:2"] as const;
export type PlanWidths = (typeof PLAN_WIDTHS)[number];
export const PLAN_BACKGROUNDS = ["none", "background", "soft", "muted", "primary", "accent", "text"] as const;
export type PlanBackground = (typeof PLAN_BACKGROUNDS)[number];
export const PLAN_ALIGNS = ["left", "center"] as const;
export type PlanAlign = (typeof PLAN_ALIGNS)[number];
export const PLAN_FIELD_TYPES = ["text", "email", "longtext", "checkbox"] as const;
export type PlanFieldType = (typeof PLAN_FIELD_TYPES)[number];
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
  | { kind: "form"; fields: Array<{ type: PlanFieldType; label: string; required: boolean }>; submitLabel: string; confirmation: string }
  | { kind: "divider" };
export type PlanBlockKind = PlanBlock["kind"];

export interface PlanColumn {
  align: PlanAlign;
  blocks: PlanBlock[];
}

export interface PlanSection {
  label: string;
  anchor: string;
  background: PlanBackground;
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
      kind: kind("form"),
      fields: list(closed({ type: choice(PLAN_FIELD_TYPES, "text: a line; email; longtext: a message; checkbox: a yes the visitor ticks."), label: text("Up to 80 characters."), required: flag("true when the answer is needed.") }), "One to six fields."),
      submitLabel: text("The send button's words, up to 30 characters."),
      confirmation: text("What the visitor reads once it is sent, up to 200 characters."),
    }, "A form whose answers the site keeps. At most one on a page."),
    closed({ kind: kind("divider") }, "A line between blocks."),
  ],
};

export const PLAN_SCHEMA: Schema = closed({
  title: text("The page's title, for the browser's tab and search results, up to 60 characters."),
  description: text("One or two sentences for search results, up to 155 characters."),
  sections: list(closed({
    label: text("The section's name in the editor's outline, in one to three words."),
    anchor: text("A short name for links to the section, lowercase letters, digits and hyphens, starting with a letter; empty when nothing links to it."),
    background: choice(PLAN_BACKGROUNDS, "A colour of the site's palette behind the section, or none."),
    widths: choice(PLAN_WIDTHS, "How the columns share the width: equal, or a ratio with as many parts as there are columns."),
    columns: list(closed({
      align: choice(PLAN_ALIGNS, "How the column's blocks line up."),
      blocks: list(BLOCK, "The column's blocks, top to bottom."),
    }), "One to four columns, side by side on a wide screen."),
  }), "The page's sections, top to bottom, three to seven of them."),
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
    widths: one(section.widths, PLAN_WIDTHS, "equal"),
    columns,
  };
}
