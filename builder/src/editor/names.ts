// How the interface names blocks and says where they are: the navigator's
// rows, the panel's title, the canvas's labels. Built on the history's own
// names (../document/labels.ts), so a block is called the same everywhere.
import { blockName, plural, tokenName, TYPE_NAMES } from "../document/labels.ts";
import { locate } from "../document/tree.ts";
import type { Block, PageDocument } from "../shared/document.ts";
import { flattenText, plainText } from "../widgets/text/plain.ts";

export { blockName };

// The panel's line under the name: "In Hero, column 1" for a widget, "In
// Hero, 2 columns" for a column, "Join, 2 columns" for a section.
export function placeLine(doc: PageDocument, id: string): string {
  const found = locate(doc, id);
  if (!found) return "";
  const { block, path } = found;
  const section = doc.sections[path[0] ?? -1];
  if (!section) return "";
  const columns = `${section.children.length} ${plural("column", section.children.length)}`;
  if (block.type === "section") return `${blockName(doc, block.id)}, ${columns}`;
  if (block.type === "column") return `In ${blockName(doc, section.id)}, ${columns}`;
  return `In ${blockName(doc, section.id)}, column ${(path[1] ?? 0) + 1}`;
}

// Where a block stands, for the sidebar while it is moved ("Moving, from
// Hero, column 1"): "Hero, column 1" for a widget, "Hero" for a column, "the
// page" for a section.
export function fromLine(doc: PageDocument, id: string): string {
  const found = locate(doc, id);
  const section = doc.sections[found?.path[0] ?? -1];
  if (!found || !section || found.block.type === "section") return "the page";
  return found.block.type === "column" ? blockName(doc, section.id) : `${blockName(doc, section.id)}, column ${(found.path[1] ?? 0) + 1}`;
}

// A section's count, a widget's own words: what the navigator shows after
// its name ("2 columns", "Swim at slack water").
export function excerpt(block: Block): string {
  switch (block.type) {
    case "section":
      return `${block.children.length} ${plural("column", block.children.length)}`;
    case "column":
      return "";
    case "heading":
      return block.props.text;
    case "text":
      return (plainText(block.props.doc) ?? flattenText(block.props.doc)).replace(/\s+/g, " ").trim();
    case "button":
      return block.props.label;
    case "image":
      return block.props.decorative === true ? "Decorative" : (block.props.alt ?? "");
    case "gallery":
      return `${block.props.items.length} ${block.props.items.length === 1 ? "image" : "images"}`;
    case "video":
      return block.props.title;
    case "map":
      return block.props.label;
    case "iconbox":
      return block.props.title;
    case "quote":
      return block.props.text.replace(/\s+/g, " ");
    case "accordion":
      return block.props.items[0]?.question ?? "";
    case "stats":
      // Its figures' values: "12, 300+, 98%".
      return block.props.items.map((item) => item.value).join(", ");
    case "steps":
      // Its steps' titles, in order: "Get in touch, Try it, Join".
      return block.props.items.map((item) => item.title).join(", ");
    case "form":
      // What its button says it does: "Send request".
      return block.props.submitLabel;
    case "logo":
      // The name beside the mark, or what the mark alone is.
      return block.props.name ?? "Mark only";
    case "menu":
      return `${block.props.items.length} ${block.props.items.length === 1 ? "link" : "links"}`;
    case "spacer":
      return tokenName(block.props.size);
    case "divider":
      return "";
  }
}

// What the canvas and the navigator call a block's kind.
export function kindName(block: Block): string {
  return TYPE_NAMES[block.type];
}
