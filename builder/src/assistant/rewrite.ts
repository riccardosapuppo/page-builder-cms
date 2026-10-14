// A text of the page written again, and an image described, by the
// person's model (./prompts.ts): the words sent from what the page holds,
// and the answer read back into what the page takes, without trusting it
// (./build.ts, line). A heading is one line; a text, its paragraphs and
// lists, as plain words: bold, italic and links are not sent, and the
// interface says they are not kept before the person takes the new text.
import type { ListItem, RichTextBlock, RichTextDoc } from "../shared/document.ts";
import { line } from "./build.ts";

// The schema's lengths: a heading's text, a text's paragraph, an alt text.
const HEADING = 200;
const PARAGRAPH = 2000;
const ALT = 300;

const inline = (block: { content?: ReadonlyArray<{ type: string; text?: string }> }): string =>
  (block.content ?? []).map((node) => (node.type === "text" ? node.text ?? "" : node.type === "hardBreak" ? " " : "")).join("");

// A list's items, each its first paragraph's words, nested lists flattened.
function itemWords(items: readonly ListItem[]): string[] {
  return items.flatMap((item) => item.content.flatMap((part): string[] => (part.type === "paragraph" ? [inline(part)] : itemWords(part.content))));
}

// A text's words as a model reads them: paragraphs apart, a list's items
// as "- " or "1. " lines.
export function textWords(doc: RichTextDoc): string {
  return doc.content.map((block) => {
    if (block.type === "paragraph") return inline(block);
    const items = itemWords(block.content);
    return items.map((item, index) => (block.type === "orderedList" ? `${index + 1}. ${item}` : `- ${item}`)).join("\n");
  }).filter((words) => words.trim() !== "").join("\n\n");
}

// Whether the text has bold, italic or links, which the new text loses.
export function hasMarks(doc: RichTextDoc): boolean {
  const marked = (value: unknown): boolean => {
    if (Array.isArray(value)) return value.some(marked);
    if (typeof value !== "object" || value === null) return false;
    const node = value as { marks?: unknown[]; content?: unknown };
    return (node.marks?.length ?? 0) > 0 || marked(node.content);
  };
  return marked(doc.content);
}

const record = (value: unknown): Record<string, unknown> | null => (typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null);

// The heading's new words, or null when the answer holds none.
export function headingFrom(answer: unknown): string | null {
  const text = record(answer)?.text;
  const words = typeof text === "string" ? line(text.replace(/^["“'‘]+|["”'’]+$/g, ""), HEADING) : "";
  return words === "" ? null : words;
}

// The text's new document, or null when the answer holds no words.
export function textFrom(answer: unknown): RichTextDoc | null {
  const blocks = record(answer)?.blocks;
  if (!Array.isArray(blocks)) return null;
  const content: RichTextBlock[] = [];
  for (const raw of blocks.slice(0, 50)) {
    const block = record(raw);
    const lines = Array.isArray(block?.lines) ? block.lines.filter((value): value is string => typeof value === "string").map((value) => line(value, PARAGRAPH)).filter((value) => value !== "") : [];
    if (lines.length === 0) continue;
    const paragraph = (text: string) => ({ type: "paragraph" as const, content: [{ type: "text" as const, text }] });
    if (block?.kind === "bullets" || block?.kind === "numbers") {
      const items = lines.slice(0, 100).map((text): ListItem => ({ type: "listItem", content: [paragraph(text)] }));
      content.push(block.kind === "bullets" ? { type: "bulletList", content: items } : { type: "orderedList", content: items });
    } else content.push(...lines.map(paragraph));
  }
  return content.length === 0 ? null : { type: "doc", content };
}

// An image's new alt text, or its being decorative; null when the answer
// holds neither.
export function imageTextFrom(answer: unknown): { alt: string } | { decorative: true } | null {
  const found = record(answer);
  if (found?.decorative === true) return { decorative: true };
  const alt = typeof found?.alt === "string" ? line(found.alt, ALT) : "";
  return alt === "" ? null : { alt };
}
