// The text widget's document as the canvas's text editor hands it over, and
// the command that keeps it. Pure: no editor, no DOM. The editor
// (../editor/rich/) runs TipTap, whose getJSON() is close to the schema's
// rich text but not the same:
// - its link mark writes every attribute it has (target, rel, class, title,
//   each null by default), where the schema takes href and a few nulls, and
//   no title at all;
// - its numbered list writes start 1 and type null on every list, and takes
//   any number or letter a pasted list carried (start="0", type="disc");
// - it orders marks by its own ranking, not as the stored text had them;
// - a line break keeps the marks typed before it;
// - a pasted plain text keeps its tabs and other control characters, which
//   the schema refuses in text.
//
// richTextFromEditor turns any of that into the schema's canonical form:
// marks bold, italic, link in that order, a link's href alone, a numbered
// list's start only from 2 and its type only a, A, i or I, a line break
// without marks, control characters as spaces, a text longer than the
// schema's 10000 characters in runs of 10000. A text the editor reads from
// the page and gives back untouched comes back the same, when it was
// stored in that form (../editor/rich/editor.test.ts holds the editor to it
// on random texts).
import type { BlockType, InlineNode, ListItem, Mark, PageDocument, Paragraph, RichTextBlock, RichTextDoc } from "../shared/document.ts";
import { refusal } from "./check.ts";
import { makeSetProps, type Made } from "./commands.ts";
import { isObject, type Json } from "./json.ts";
import { locate } from "./tree.ts";

// The marks, in the order the canonical form lists them.
export const MARK_ORDER = ["bold", "italic", "link"] as const satisfies readonly Mark["type"][];

// What the schema refuses in a run of text (lineControls): C0 and C1
// control characters, and the line and paragraph separators.
const CONTROLS = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g;
// The same, but for a line feed and a carriage return, which split pasted
// plain text into paragraphs before it becomes text.
const PASTED_CONTROLS = /[\u0000-\u0009\u000b\u000c\u000e-\u001f\u007f-\u009f\u2028\u2029]/g;
// The schema's longest run of text, in characters as it counts them.
export const MAX_TEXT_RUN = 10000;
const ORDERED_STYLES: readonly unknown[] = ["a", "A", "i", "I"];
const MAX_START = 100000;

// Plain text pasted into the editor, with every character the schema
// refuses in text made a space; line breaks stay, to split it.
export function cleanPastedText(text: string): string {
  return text.replace(PASTED_CONTROLS, " ");
}

// The editor's JSON as the schema's rich text: what the text widget stores.
export function richTextFromEditor(json: unknown): RichTextDoc {
  const content = isObject(json) && json.type === "doc" ? blocksOf(json.content) : [];
  return { type: "doc", content: content.length > 0 ? content : [{ type: "paragraph" }] };
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function blocksOf(nodes: unknown): RichTextBlock[] {
  return list(nodes).flatMap((node): RichTextBlock[] => {
    if (!isObject(node)) return [];
    switch (node.type) {
      case "paragraph":
        return [paragraphOf(node.content)];
      case "bulletList": {
        const items = itemsOf(node.content);
        return items.length > 0 ? [{ type: "bulletList", content: items }] : [];
      }
      case "orderedList": {
        const items = itemsOf(node.content);
        if (items.length === 0) return [];
        const attrs = orderedAttrs(node.attrs);
        return [attrs ? { type: "orderedList", attrs, content: items } : { type: "orderedList", content: items }];
      }
      default:
        // The editor's schema has no other block; anything else is left
        // out with what it holds, as the renderers leave it out.
        return [];
    }
  });
}

function paragraphOf(nodes: unknown): Paragraph {
  const content = inlineOf(nodes);
  return content.length > 0 ? { type: "paragraph", content } : { type: "paragraph" };
}

// A list item starts with a paragraph (the schema's prefixItems): one the
// editor would never leave out, given back empty if it did.
function itemsOf(nodes: unknown): ListItem[] {
  return list(nodes).flatMap((node): ListItem[] => {
    if (!isObject(node) || node.type !== "listItem") return [];
    const [first, ...rest] = blocksOf(node.content);
    if (first?.type === "paragraph") return [{ type: "listItem", content: [first, ...rest] }];
    return [{ type: "listItem", content: [{ type: "paragraph" }, ...(first ? [first] : []), ...rest] }];
  });
}

function orderedAttrs(attrs: unknown): { start?: number; type?: "a" | "A" | "i" | "I" } | null {
  if (!isObject(attrs)) return null;
  const out: { start?: number; type?: "a" | "A" | "i" | "I" } = {};
  const { start, type } = attrs;
  if (typeof start === "number" && Number.isInteger(start) && start >= 2) out.start = Math.min(start, MAX_START);
  if (ORDERED_STYLES.includes(type)) out.type = type as "a" | "A" | "i" | "I";
  return Object.keys(out).length > 0 ? out : null;
}

function inlineOf(nodes: unknown): InlineNode[] {
  return list(nodes).flatMap((node): InlineNode[] => {
    if (!isObject(node)) return [];
    if (node.type === "hardBreak") return [{ type: "hardBreak" }];
    if (node.type !== "text" || typeof node.text !== "string") return [];
    const text = node.text.replace(CONTROLS, " ");
    if (text === "") return [];
    const marks = marksOf(node.marks);
    return runs(text).map((run) => (marks.length > 0 ? { type: "text", text: run, marks: marks.map((m) => ({ ...m })) } : { type: "text", text: run }));
  });
}

// A text cut into runs the schema takes, never inside a pair of UTF-16
// halves, counted in characters as the schema counts them.
function runs(text: string): string[] {
  const characters = [...text];
  if (characters.length <= MAX_TEXT_RUN) return [text];
  const out: string[] = [];
  for (let at = 0; at < characters.length; at += MAX_TEXT_RUN) out.push(characters.slice(at, at + MAX_TEXT_RUN).join(""));
  return out;
}

function marksOf(marks: unknown): Mark[] {
  const found = new Map<Mark["type"], Mark>();
  for (const mark of list(marks)) {
    if (!isObject(mark) || found.has(mark.type as Mark["type"])) continue;
    if (mark.type === "bold") found.set("bold", { type: "bold" });
    else if (mark.type === "italic") found.set("italic", { type: "italic" });
    else if (mark.type === "link" && isObject(mark.attrs) && typeof mark.attrs.href === "string") {
      found.set("link", { type: "link", attrs: { href: mark.attrs.href } });
    }
  }
  return MARK_ORDER.flatMap((type) => {
    const mark = found.get(type);
    return mark ? [mark] : [];
  });
}

const RICH_TEXT_TYPES: readonly BlockType[] = ["text"];

// The command that keeps what the editor holds for a text block: the
// block's document replaced, as one change of its props. Its inverse puts
// back the document the page held, exactly as it was, whatever form it was
// stored in. Refused as "nothing" when the text is what the page holds.
export function makeTextEdit(doc: PageDocument, id: string, editorJson: unknown): Made {
  const found = locate(doc, id);
  if (!found) return { ok: false, error: refusal("unknown", `There is no block ${id} on the page.`) };
  if (!RICH_TEXT_TYPES.includes(found.block.type)) return { ok: false, error: refusal("invalid", `${found.block.type} holds no rich text.`) };
  const next = richTextFromEditor(editorJson);
  return makeSetProps(doc, id, { doc: next as unknown as Json });
}
