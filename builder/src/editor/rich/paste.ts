// HTML pasted into a text (from a word processor, a web page, another
// editor), made ready for the editor's schema before the editor reads it.
// The editor's own rules (./extensions.ts) then keep paragraphs, line
// breaks, lists, bold, italic and links the URL policy takes; whatever
// else an element is, its words stay and its markup goes. Done here, before
// that, is what the editor would otherwise get wrong:
// - what is not words at all is taken out with everything in it: scripts,
//   styles, templates, images, frames, embedded objects, drawings, form
//   controls, and a word processor's own markers (the bullet it writes in
//   front of a list paragraph, styled mso-list:Ignore, and its empty
//   o:p elements);
// - a table becomes one paragraph per row, its cells side by side with a
//   space between them, so a row reads as a line rather than every cell
//   of the table running into one paragraph.
const DROPPED = new Set([
  "script", "style", "template", "noscript", "iframe", "frame", "frameset", "object", "embed", "applet", "svg", "math", "img", "picture", "video",
  "audio", "source", "track", "canvas", "map", "area", "input", "button", "select", "textarea", "head", "meta", "link", "title", "base", "xml", "o:p",
]);

export function cleanPastedHtml(html: string): string {
  const parsed = new DOMParser().parseFromString(html, "text/html");
  const body = parsed.body;
  for (const element of body.querySelectorAll("*")) {
    if (!element.isConnected) continue;
    const name = element.tagName.toLowerCase();
    if (DROPPED.has(name) || /mso-list\s*:\s*ignore/i.test(element.getAttribute("style") ?? "")) element.remove();
  }
  for (const table of body.querySelectorAll("table")) {
    // A table inside another was flattened with its outer one.
    if (!table.isConnected) continue;
    table.replaceWith(...rowsOf(table, parsed));
  }
  return body.innerHTML;
}

function rowsOf(table: HTMLTableElement, owner: Document): Node[] {
  const out: Node[] = [];
  const caption = table.querySelector(":scope > caption");
  if (caption) out.push(paragraphOf([...caption.childNodes], owner));
  for (const row of table.querySelectorAll("tr")) {
    if (row.closest("table") !== table) continue;
    const cells = [...row.children].filter((cell) => cell.tagName === "TD" || cell.tagName === "TH");
    const parts: Node[] = [];
    cells.forEach((cell, index) => {
      if (index > 0) parts.push(owner.createTextNode(" "));
      parts.push(...flatten(cell, owner));
    });
    out.push(paragraphOf(parts, owner));
  }
  return out;
}

// A cell's content as inline content: a nested table's rows run on in it,
// and the blocks a word processor puts in a cell (a paragraph per line)
// are joined by line breaks.
function flatten(cell: Element, owner: Document): Node[] {
  for (const inner of cell.querySelectorAll("table")) inner.replaceWith(...rowsOf(inner, owner));
  const isBlock = (node: Node) => node instanceof Element && /^(P|DIV|H[1-6]|LI|BLOCKQUOTE|PRE|UL|OL)$/.test(node.tagName);
  const nodes = [...cell.childNodes];
  if (!nodes.some(isBlock)) return nodes;
  // Lines: each block's content, and the words between blocks; the
  // spaces a source file leaves between its tags are no line.
  const lines: Node[][] = [];
  let loose: Node[] = [];
  const closeLoose = () => {
    if (loose.some((node) => !(node instanceof Text) || node.data.trim() !== "")) lines.push(loose);
    loose = [];
  };
  for (const node of nodes) {
    if (isBlock(node)) {
      closeLoose();
      lines.push([...node.childNodes]);
    } else {
      loose.push(node);
    }
  }
  closeLoose();
  return lines.flatMap((line, index) => (index === 0 ? line : [owner.createElement("br"), ...line]));
}

function paragraphOf(nodes: Node[], owner: Document): HTMLParagraphElement {
  const paragraph = owner.createElement("p");
  paragraph.append(...nodes);
  return paragraph;
}
