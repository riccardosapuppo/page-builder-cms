// The safety check of a rendered page, run on the React render of every
// contract fixture and every page of the agreement check, and on the
// server's goldens: what a page must never carry, whatever its document
// holds.
//
// - no <script>, in any namespace, and none of the elements that load or
//   run something of their own (style, base, object, embed, link, meta);
// - no form but the form widget's own, the one element right inside a
//   root of data-block-type "form", with no attribute but class="sw-form"
//   and method="post": it has no action, so it is sent to the page's own
//   address and nowhere else; and Add to cart's, the one element right
//   inside a root of data-block-type "addToCart", with no attribute but
//   class="sw-cart-add", method="post" and action="/cart/items", the
//   cart's own address on the site; and no formaction or formtarget
//   anywhere, which would send either elsewhere;
// - no event handler attribute (on*), and no srcdoc;
// - no address that runs script or carries its own content: href, src and
//   the other attributes that hold a URL, read as a browser reads them
//   (leading and trailing spaces and control characters cut, tabs and line
//   breaks taken out, any case), never start with javascript:, vbscript:
//   or data:;
// - an iframe only from an origin of the URL policy (FRAME_ORIGINS).
import type { DefaultTreeAdapterMap } from "parse5";
import { FRAME_ORIGINS } from "../src/render/policy.ts";
import { parseSections } from "./html-compare.ts";

type Node = DefaultTreeAdapterMap["node"];
type Element = DefaultTreeAdapterMap["element"];

const FORBIDDEN_ELEMENTS = new Set(["script", "style", "base", "object", "embed", "link", "meta"]);

// The form widget's own form: right inside its block's root, sent to the
// page's own address; and Add to cart's, sent to the cart's.
const WIDGET_FORMS: Readonly<Record<string, string>> = { form: "class=sw-form method=post", addToCart: "action=/cart/items class=sw-cart-add method=post" };
function widgetForm(element: Element, parent: Element | null): boolean {
  const attributes = element.attrs.map((a) => `${a.name}=${a.value}`).sort();
  const type = parent?.attrs.find((a) => a.name === "data-block-type")?.value;
  return type !== undefined && Object.hasOwn(WIDGET_FORMS, type) && attributes.join(" ") === WIDGET_FORMS[type];
}
const URL_ATTRIBUTES = new Set(["href", "src", "xlink:href", "action", "formaction", "poster", "data", "background", "cite", "longdesc", "ping", "srcset", "usemap", "manifest", "codebase", "archive"]);
const BAD_SCHEMES = ["javascript:", "vbscript:", "data:"];

// The URL a browser would read: C0 controls and spaces at both ends cut,
// ASCII tab and line breaks anywhere taken out (the URL standard's rules).
export function browserUrl(value: string): string {
  const cut = (code: number) => code <= 0x20;
  let start = 0;
  let end = value.length;
  while (start < end && cut(value.charCodeAt(start))) start += 1;
  while (end > start && cut(value.charCodeAt(end - 1))) end -= 1;
  return value.slice(start, end).replaceAll("\t", "").replaceAll("\n", "").replaceAll("\r", "").toLowerCase();
}

export function safetyProblems(html: string): string[] {
  const problems: string[] = [];
  const walk = (nodes: readonly Node[], path: string, parent: Element | null) => {
    for (const node of nodes) {
      if (!("tagName" in node)) continue;
      const element = node as Element;
      const here = `${path} > ${element.tagName}`;
      if (FORBIDDEN_ELEMENTS.has(element.tagName)) problems.push(`${here}: a <${element.tagName}> element`);
      if (element.tagName === "form" && !widgetForm(element, parent)) problems.push(`${here}: a <form> that is not the form widget's own`);
      for (const attribute of element.attrs) {
        const name = (attribute.prefix ? `${attribute.prefix}:${attribute.name}` : attribute.name).toLowerCase();
        if (name.startsWith("on")) problems.push(`${here}: an event handler, ${name}`);
        if (name === "srcdoc") problems.push(`${here}: srcdoc`);
        if (name === "formaction" || name === "formtarget") problems.push(`${here}: ${name}, which sends a form elsewhere`);
        if (URL_ATTRIBUTES.has(name)) {
          const values = name === "srcset" ? attribute.value.split(",").map((part) => part.trim().split(/\s+/)[0] ?? "") : [attribute.value];
          for (const value of values) {
            const url = browserUrl(value);
            const scheme = BAD_SCHEMES.find((bad) => url.startsWith(bad));
            if (scheme) problems.push(`${here}: ${name} is a ${scheme} address`);
          }
        }
      }
      if (element.tagName === "iframe") {
        const src = element.attrs.find((a) => a.name === "src")?.value ?? "";
        if (!FRAME_ORIGINS.some((origin) => src.startsWith(`${origin}/`))) problems.push(`${here}: an iframe from ${JSON.stringify(src)}`);
      }
      walk(element.tagName === "template" ? (element as DefaultTreeAdapterMap["template"]).content.childNodes : element.childNodes, here, element);
    }
  };
  walk(parseSections(html), "(page)", null);
  return problems;
}
