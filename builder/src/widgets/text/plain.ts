// The text widget's document as plain text and back, for the panel's text
// area: a blank line between paragraphs, a line break inside one. Only a
// document of plain paragraphs reads as plain text: one with bold, italic,
// links or lists does not, so the panel never drops formatting it cannot
// show unless the person asks it to.
import type { InlineNode, Paragraph, RichTextBlock, RichTextDoc } from "../../shared/document.ts";

// The text, or null when the document holds more than plain paragraphs.
export function plainText(doc: RichTextDoc): string | null {
  const paragraphs: string[] = [];
  for (const block of doc.content) {
    if (block.type !== "paragraph") return null;
    const line = inlineText(block.content ?? [], false);
    if (line === null) return null;
    paragraphs.push(line);
  }
  return paragraphs.join("\n\n");
}

// The words of any document, formatting dropped: list items each on a
// line of their own. What "Edit as plain text" starts from.
export function flattenText(doc: RichTextDoc): string {
  const lines: string[] = [];
  const walk = (blocks: readonly RichTextBlock[], depth: number): void => {
    for (const block of blocks) {
      if (block.type === "paragraph") lines.push(inlineText(block.content ?? [], true) ?? "");
      else for (const item of block.content) walk(item.content, depth + 1);
    }
  };
  walk(doc.content, 0);
  return lines.join("\n\n");
}

function inlineText(nodes: readonly InlineNode[], dropMarks: boolean): string | null {
  let text = "";
  for (const node of nodes) {
    if (!dropMarks && node.marks && node.marks.length > 0) return null;
    text += node.type === "text" ? node.text : "\n";
  }
  return text;
}

// Plain text as the widget's document: paragraphs split at a blank line,
// line breaks inside them kept as breaks.
export function docFromPlain(text: string): RichTextDoc {
  const content: Paragraph[] = text.replaceAll("\r\n", "\n").split("\n\n").map((paragraph) => {
    const nodes: InlineNode[] = [];
    paragraph.split("\n").forEach((line, index) => {
      if (index > 0) nodes.push({ type: "hardBreak" });
      if (line !== "") nodes.push({ type: "text", text: line });
    });
    return nodes.length === 0 ? { type: "paragraph" } : { type: "paragraph", content: nodes };
  });
  return { type: "doc", content };
}
