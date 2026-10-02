// Rich text, the text widget's document (TipTap's JSON, cut down by the
// schema to paragraphs, line breaks, bullet and numbered lists, bold, italic
// and links), drawn as React elements: the twin of
// cms/app/helpers/rich_text_helper.rb.
//
// TipTap's static renderer draws it, from a mapping of nodes and marks to
// components built once, here, when the module loads: its ProseMirror path
// would build a schema from the extensions on every call, which was most
// of the time of a React render of 500 blocks. The contract test renders
// through this same mapping.
//
// Before the renderer sees a document, `cleanRichText` keeps exactly what
// the server's helper would draw, so the two agree on documents the schema
// refuses too:
// - a node the schema does not know (a heading, an image) is left out with
//   everything it holds;
// - a mark it does not know (underline) is dropped and its text kept;
// - a link whose address the URL policy refuses is dropped and its text
//   kept; a link keeps its href only, never a target, rel or class;
// - marks on a line break are ignored, as the server writes a bare <br>;
// - text that is not a string is empty, and content that is not a list
//   is nothing.
// Marks nest in the order they are stored, the first innermost, and a
// numbered list writes start only when it does not start at 1, and type
// only for a, A, i and I.
import { Fragment, type ReactNode } from "react";
import { renderJSONContentToReactElement } from "@tiptap/static-renderer/json/react";
import { isObject } from "../document/json.ts";
import { linkHref } from "./policy.ts";

export type CleanMark = { type: "bold" } | { type: "italic" } | { type: "link"; attrs: { href: string } };

export interface CleanNode {
  type: "doc" | "paragraph" | "bulletList" | "orderedList" | "listItem" | "hardBreak" | "text";
  content?: CleanNode[];
  attrs?: { start?: number; type?: OrderedStyle };
  text?: string;
  marks?: CleanMark[];
}

type OrderedStyle = "a" | "A" | "i" | "I";
const ORDERED_TYPES: readonly unknown[] = ["a", "A", "i", "I"] satisfies OrderedStyle[];
const CONTAINERS = ["paragraph", "bulletList", "listItem"] as const;

// What the server would draw of a stored rich-text value, or null when it
// draws nothing at all (not a doc).
export function cleanRichText(doc: unknown): CleanNode | null {
  if (!isObject(doc) || doc.type !== "doc") return null;
  return { type: "doc", content: cleanNodes(doc.content) };
}

function cleanNodes(nodes: unknown): CleanNode[] {
  // Ruby's Array() of anything but a list gives nothing that is a node.
  return Array.isArray(nodes) ? nodes.flatMap(cleanNode) : [];
}

function cleanNode(node: unknown): CleanNode[] {
  if (!isObject(node)) return [];
  const type = node.type;
  if ((CONTAINERS as readonly unknown[]).includes(type)) return [{ type: type as (typeof CONTAINERS)[number], content: cleanNodes(node.content) }];
  if (type === "orderedList") {
    const attrs: { start?: number; type?: OrderedStyle } = {};
    if (isObject(node.attrs)) {
      const { start, type: style } = node.attrs;
      if (Number.isInteger(start) && (start as number) > 1) attrs.start = start as number;
      if (ORDERED_TYPES.includes(style)) attrs.type = style as OrderedStyle;
    }
    return [{ type: "orderedList", attrs, content: cleanNodes(node.content) }];
  }
  if (type === "hardBreak") return [{ type: "hardBreak" }];
  if (type === "text") {
    const marks = cleanMarks(node.marks);
    const text = typeof node.text === "string" ? node.text : "";
    return [marks.length > 0 ? { type: "text", text, marks } : { type: "text", text }];
  }
  return [];
}

function cleanMarks(marks: unknown): CleanMark[] {
  if (!Array.isArray(marks)) return [];
  return marks.flatMap((mark): CleanMark[] => {
    if (!isObject(mark)) return [];
    if (mark.type === "bold") return [{ type: "bold" }];
    if (mark.type === "italic") return [{ type: "italic" }];
    if (mark.type === "link") {
      const href = linkHref(isObject(mark.attrs) ? mark.attrs.href : undefined);
      return href === null ? [] : [{ type: "link", attrs: { href } }];
    }
    return [];
  });
}

interface NodeView {
  node: CleanNode;
  children?: ReactNode;
}
interface MarkView {
  mark: CleanMark;
  children?: ReactNode;
}

// The mapping, built once for the session.
const renderClean = renderJSONContentToReactElement<CleanMark, CleanNode>({
  nodeMapping: {
    doc: ({ children }: NodeView) => <Fragment>{children}</Fragment>,
    paragraph: ({ children }: NodeView) => <p>{children}</p>,
    bulletList: ({ children }: NodeView) => <ul>{children}</ul>,
    orderedList: ({ node, children }: NodeView) => <ol start={node.attrs?.start} type={node.attrs?.type}>{children}</ol>,
    listItem: ({ children }: NodeView) => <li>{children}</li>,
    hardBreak: () => <br />,
    text: ({ node }: NodeView) => node.text ?? "",
  },
  markMapping: {
    bold: ({ children }: MarkView) => <strong>{children}</strong>,
    italic: ({ children }: MarkView) => <em>{children}</em>,
    link: ({ mark, children }: MarkView) => <a href={mark.type === "link" ? mark.attrs.href : undefined}>{children}</a>,
  },
});

// A rich-text value as React elements; nothing for a value that is not a doc.
export function renderRichText(doc: unknown): ReactNode {
  const clean = cleanRichText(doc);
  return clean === null ? null : renderClean({ content: clean });
}
