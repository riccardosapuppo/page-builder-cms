// How the render contract and the rule-9 check compare two renders of a
// page: the server's HTML (a golden, or a page it serves) and the React
// renderer's. Each is parsed by parse5, an HTML parser that is neither
// side's, as a browser would parse it inside the page's <main>; then the
// two trees are written out in one canonical form, one node a line, and
// compared line by line.
//
// The normalization, all of it (contract/README.md says the same):
// 1. The "\n" the server writes after each block's root element (every
//    partial ends with a line break) is dropped: a text node that is
//    exactly "\n" right after an element with data-block-id. React writes
//    none, and between blocks, in the grid and flex boxes that hold them,
//    it draws nothing.
// 2. Attributes are compared as a set: their order means nothing in HTML.
// 3. A boolean attribute (open, allowfullscreen...) is compared by its
//    presence: the server writes open="open", React open="", and HTML
//    reads any value as true.
// Nothing else: every element, attribute value, class list and character
// of text is compared as it is, white space included.
import { parse, parseFragment, type DefaultTreeAdapterMap } from "parse5";

type Node = DefaultTreeAdapterMap["node"];
type Element = DefaultTreeAdapterMap["element"];
type ParentNode = DefaultTreeAdapterMap["parentNode"];

export type Canonical = Array<{ line: string; block: string }>;

const BOOLEAN_ATTRIBUTES = new Set([
  "allowfullscreen", "async", "autofocus", "autoplay", "checked", "controls", "default", "defer", "disabled", "formnovalidate",
  "hidden", "inert", "ismap", "itemscope", "loop", "multiple", "muted", "nomodule", "novalidate", "open", "playsinline",
  "readonly", "required", "reversed", "selected",
]);
const HTML_NS = "http://www.w3.org/1999/xhtml";

const isElement = (node: Node): node is Element => "tagName" in node;

// <main>, the element the page's sections sit in, to parse a fragment in.
function mainElement(): Element {
  const document = parse("<!doctype html><html><body><main></main></body></html>");
  const found = findElement(document, (element) => element.tagName === "main");
  if (!found) throw new Error("parse5 gave no <main>");
  return found;
}
const MAIN = mainElement();

export function findElement(root: ParentNode, test: (element: Element) => boolean): Element | undefined {
  for (const child of root.childNodes) {
    if (!isElement(child)) continue;
    if (test(child)) return child;
    const found = findElement(child, test);
    if (found) return found;
  }
  return undefined;
}

// The nodes of an HTML fragment, as parsed inside <main>.
export function parseSections(html: string): Node[] {
  return parseFragment(MAIN, html, {}).childNodes;
}

// The children of the <main> of a whole page the server served, without the
// line breaks its templates write around what the renderer writes: the
// layout's after <main id="main"> and before </main>
// (cms/app/views/layouts/public.html.erb), and the one that ends the page's
// view (cms/app/views/pages/show.html.erb). Anything else there is the
// renderer's, and is compared.
export function mainOfPage(html: string): Node[] {
  const main = findElement(parse(html), (element) => element.tagName === "main");
  if (!main) throw new Error("the page has no <main>");
  const nodes = [...main.childNodes];
  const trim = (index: number, cut: (value: string) => string | null) => {
    const node = nodes[index];
    if (node?.nodeName !== "#text") throw new Error("the page's <main> does not start and end with its templates' line breaks");
    const value = cut((node as DefaultTreeAdapterMap["textNode"]).value);
    if (value === null) throw new Error("the page's <main> does not start and end with its templates' line breaks");
    if (value === "") nodes.splice(index, 1);
    else nodes[index] = { ...node, value } as typeof node;
  };
  trim(0, (value) => (value.startsWith("\n") ? value.slice(1) : null));
  trim(nodes.length - 1, (value) => (value.endsWith("\n\n") ? value.slice(0, -2) : null));
  return nodes;
}

function attributeLine(element: Element): string {
  const html = element.namespaceURI === HTML_NS;
  return [...element.attrs]
    .map((a) => {
      const name = a.prefix ? `${a.prefix}:${a.name}` : a.name;
      return [name, html && BOOLEAN_ATTRIBUTES.has(name) ? "" : a.value] as const;
    })
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([name, value]) => ` ${name}=${JSON.stringify(value)}`)
    .join("");
}

const blockIdOf = (node: Node): string | undefined => (isElement(node) ? node.attrs.find((a) => a.name === "data-block-id")?.value : undefined);

// The canonical form: one line per node, indented by depth, each with the
// id of the block it belongs to (for the message when two differ).
export function canonical(nodes: readonly Node[]): Canonical {
  const out: Canonical = [];
  const walk = (list: readonly Node[], depth: number, block: string) => {
    let text: string | null = null;
    const flush = () => {
      if (text !== null && text !== "") out.push({ line: `${"  ".repeat(depth)}#text ${JSON.stringify(text)}`, block });
      text = null;
    };
    list.forEach((node, index) => {
      if (node.nodeName === "#text") {
        const value = (node as DefaultTreeAdapterMap["textNode"]).value;
        const previous = index > 0 ? list[index - 1] : undefined;
        if (value === "\n" && previous !== undefined && blockIdOf(previous) !== undefined) return;
        text = (text ?? "") + value;
        return;
      }
      flush();
      if (node.nodeName === "#comment") {
        out.push({ line: `${"  ".repeat(depth)}#comment ${JSON.stringify((node as DefaultTreeAdapterMap["commentNode"]).data)}`, block });
        return;
      }
      if (!isElement(node)) {
        out.push({ line: `${"  ".repeat(depth)}${node.nodeName}`, block });
        return;
      }
      const own = blockIdOf(node) ?? block;
      const ns = node.namespaceURI === HTML_NS ? "" : `${node.namespaceURI.split("/").pop()}:`;
      out.push({ line: `${"  ".repeat(depth)}<${ns}${node.tagName}${attributeLine(node)}>`, block: own });
      walk(node.tagName === "template" ? (node as DefaultTreeAdapterMap["template"]).content.childNodes : node.childNodes, depth + 1, own);
    });
    flush();
  };
  walk(nodes, 0, "(page)");
  return out;
}

export interface Comparison {
  equal: boolean;
  // How many nodes each side has.
  nodes: { server: number; react: number };
  // Where the first difference is, with a few lines of each side.
  message?: string;
}

export function compareCanonical(server: Canonical, react: Canonical, label = "render"): Comparison {
  const nodes = { server: server.length, react: react.length };
  const length = Math.max(server.length, react.length);
  for (let i = 0; i < length; i += 1) {
    if (server[i]?.line === react[i]?.line) continue;
    const show = (side: Canonical) => side.slice(Math.max(0, i - 3), i + 4).map((l, k) => `${Math.max(0, i - 3) + k === i ? ">" : " "} ${l.line}`).join("\n");
    const block = server[i]?.block ?? react[i]?.block ?? "(none)";
    return {
      equal: false,
      nodes,
      message: `${label}: the trees differ at node ${i + 1}, in block ${block}\n--- server\n${show(server)}\n--- react\n${show(react)}`,
    };
  }
  return { equal: true, nodes };
}

export function compareHtml(serverHtml: string, reactHtml: string, label?: string): Comparison {
  return compareCanonical(canonical(parseSections(serverHtml)), canonical(parseSections(reactHtml)), label);
}
