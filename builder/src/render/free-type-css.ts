// The stylesheet of a page's free type (../shared/free-type.ts): each value
// of free type its headings, texts and quotes set, on every device, as a
// rule on the data attribute their roots carry it by (./style.ts,
// freeTypeData). The canvas puts it in the editor's page, the browser demo
// in the pages it draws; the CMS serves the same rules
// (cms/app/models/free_type.rb).
//
// Every rule is written from the number read and a unit of a closed list,
// never from the text a document holds: a value the schema or the rules
// refuse writes nothing. A size in vw is written in cqw, a hundredth of the
// width of the page root (.site, the container every query of the page
// asks): on the published page that is the page's width, and on the canvas,
// where the page is drawn 768 or 390 wide inside a wider window, the
// page's too, where vw would measure the editor's window. No other size
// container stands between a heading, a text or a quote and the page root
// (site.css: only a menu block is one, and it holds no block).
import { isObject } from "../document/json.ts";
import { DEVICES, type Device } from "../shared/document.ts";
import { FREE_TYPE_BLOCKS, FREE_TYPE_KEYS, fontSizeOf, freeTypeText, hundredthsText, type FreeTypeKey } from "../shared/free-type.ts";
import { LAYOUT_BREAKPOINTS } from "../shared/site-tokens.ts";
import { FREE_TYPE_FAMILY } from "./style.ts";

// What the stylesheet needs: on each device, the values each key of free
// type takes there, as the documents hold them.
export type FreeTypeInput = Partial<Record<Device, Partial<Record<FreeTypeKey, readonly unknown[]>>>>;

const QUERIES: Readonly<Record<"tablet" | "phone", string>> = {
  tablet: `${LAYOUT_BREAKPOINTS.phone}px <= width < ${LAYOUT_BREAKPOINTS.tablet}px`,
  phone: `width < ${LAYOUT_BREAKPOINTS.phone}px`,
};

// The property's value for a value as the page writes it: a size in its
// unit, a vw as a cqw; letter spacing in em; a letter width a percentage.
function cssValue(key: FreeTypeKey, text: string): string {
  if (key === "fontSize") {
    const size = fontSizeOf(text)!;
    return `${hundredthsText(size.hundredths)}${size.unit === "vw" ? "cqw" : size.unit}`;
  }
  if (key === "letterSpacing") return `${text}em`;
  if (key === "letterWidth") return `${text}%`;
  return text;
}

// Which rule wins: a block's own type over its step's and its face's, on
// every device (tokens.css's size and face classes: .size-display,
// .w.face-heading, .w.tablet-face-body, which this stylesheet comes
// after), and a tablet's or a phone's own value over the desktop's. So a
// desktop's rule weighs two, a widget and its attribute
// (.w[data-font-weight="800"]), as much as a face class and later; a
// device's three, its attribute named twice as the free colours' are
// (.w[data-tablet-font-weight="800"][data-tablet-font-weight]).
function rule(device: Device, key: FreeTypeKey, text: string): string {
  const name = device === "base" ? `data-${FREE_TYPE_FAMILY[key]}` : `data-${device}-${FREE_TYPE_FAMILY[key]}`;
  const selector = device === "base" ? `.w[${name}="${text}"]` : `.w[${name}="${text}"][${name}]`;
  return `${selector} { ${FREE_TYPE_FAMILY[key]}: ${cssValue(key, text)}; }`;
}

// One device's rules: each key in its order, each value once, sorted as
// the page writes them.
function deviceRules(device: Device, values: unknown): string[] {
  return FREE_TYPE_KEYS.flatMap((key) => {
    const list = isObject(values) && Object.hasOwn(values, key) ? values[key] : undefined;
    const texts = (Array.isArray(list) ? list : []).map((value) => freeTypeText(key, value)).filter((text): text is string => text !== null);
    return [...new Set(texts)].sort().map((text) => rule(device, key, text));
  });
}

// The stylesheet for the free type of a page, from the values each key
// takes on each device ({ base: { fontSize: ["6vw"] } }): the desktop's
// rules, then a tablet's and a phone's inside their container queries.
// Empty when there is none.
export function freeTypeCss(input: FreeTypeInput): string {
  const out: string[] = [];
  for (const device of DEVICES) {
    const rules = deviceRules(device, isObject(input) && Object.hasOwn(input, device) ? input[device] : undefined);
    if (rules.length === 0) continue;
    if (device === "base") out.push(...rules);
    else out.push(`@container site (${QUERIES[device]}) {`, ...rules.map((line) => `  ${line}`), "}");
  }
  if (out.length === 0) return "";
  return `${["/* Free type of this page: the sizes, weights, letter spacing, line heights and letter widths its headings, texts and quotes set. */", ...out].join("\n")}\n`;
}

// The values of free type a document's headings, texts and quotes hold, on
// each device, as stored: what the stylesheet reads them from.
export function freeTypeOf(document: unknown): FreeTypeInput {
  const found: Record<Device, Record<FreeTypeKey, unknown[]>> = Object.fromEntries(DEVICES.map((device) => [device, Object.fromEntries(FREE_TYPE_KEYS.map((key) => [key, []]))])) as never;
  const walk = (blocks: unknown): void => {
    if (!Array.isArray(blocks)) return;
    for (const block of blocks) {
      if (typeof block !== "object" || block === null) continue;
      const { type, style, children } = block as { type?: unknown; style?: unknown; children?: unknown };
      if ((FREE_TYPE_BLOCKS as readonly unknown[]).includes(type) && typeof style === "object" && style !== null) {
        for (const device of DEVICES) {
          const part = Object.hasOwn(style, device) ? (style as Record<string, unknown>)[device] : undefined;
          if (typeof part !== "object" || part === null) continue;
          for (const key of FREE_TYPE_KEYS) if (Object.hasOwn(part, key)) found[device][key].push((part as Record<string, unknown>)[key]);
        }
      }
      walk(children);
    }
  };
  walk(typeof document === "object" && document !== null ? (document as { sections?: unknown }).sections : undefined);
  return found;
}

// What the stylesheet needs from the documents a page draws (its own, the
// header's and the footer's): their values, together.
export function freeTypeFor(documents: readonly unknown[]): FreeTypeInput {
  const all = documents.map(freeTypeOf);
  return Object.fromEntries(DEVICES.map((device) => [device, Object.fromEntries(FREE_TYPE_KEYS.map((key) => [key, all.flatMap((input) => input[device]?.[key] ?? [])]))]));
}
