// The safety check of a rendered page, run on the React render of every
// contract fixture and every page of the agreement check, and on the
// server's goldens: what a page must never carry, whatever its document
// holds.
//
// - no <script>, in any namespace, and none of the elements that load or
//   run something of their own (style, base, object, embed, link, meta,
//   form);
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

const FORBIDDEN_ELEMENTS = new Set(["script", "style", "base", "object", "embed", "link", "meta", "form"]);
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
  const walk = (nodes: readonly Node[], path: string) => {
    for (const node of nodes) {
      if (!("tagName" in node)) continue;
      const element = node as Element;
      const here = `${path} > ${element.tagName}`;
      if (FORBIDDEN_ELEMENTS.has(element.tagName)) problems.push(`${here}: a <${element.tagName}> element`);
      for (const attribute of element.attrs) {
        const name = (attribute.prefix ? `${attribute.prefix}:${attribute.name}` : attribute.name).toLowerCase();
        if (name.startsWith("on")) problems.push(`${here}: an event handler, ${name}`);
        if (name === "srcdoc") problems.push(`${here}: srcdoc`);
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
      walk(element.tagName === "template" ? (element as DefaultTreeAdapterMap["template"]).content.childNodes : element.childNodes, here);
    }
  };
  walk(parseSections(html), "(page)");
  return problems;
}
