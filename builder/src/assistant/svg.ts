// An illustration as a model wrote it, an SVG document, cleaned before it
// is drawn (./README.md, "Pictures made for a page"). It is never put on a
// page as it came: it is read by the small parser below, which takes only
// the plainest XML (elements, attributes in quotes, white space, comments),
// held to a strict allowlist, and written out anew from what the list
// keeps. ./draw.ts then draws that to a canvas, in an image (which runs no
// script and loads nothing), and what goes to the library is the picture
// the canvas makes, never the SVG.
//
// What is kept:
// - Shapes (path, rect, circle, ellipse, line, polyline, polygon), in g
//   groups, under the one svg element.
// - Gradients (linearGradient, radialGradient) with their stops, in defs
//   or beside the shapes, each with an id of its own, which a fill or a
//   stroke names as url(#id): a gradient of this document, and nothing else.
// - Attributes: each shape's geometry, fill, stroke and their settings,
//   opacity, a transform of numbers, a gradient's own; and the root's
//   viewBox and xmlns, the SVG namespace.
// Every value is held to what it may be: a number, a length, path data,
// points, a colour, url(#id), a transform of numbers.
//
// What is refused, the whole illustration with it: any other element
// (script, style, foreignObject, image, use, a, text, filter, animation...),
// any other attribute (an event handler, href or xlink:href, style, any
// attribute with a prefix...), url() of anything but a gradient of its
// own, words in it, a DOCTYPE, an entity or any `&`, CDATA, a processing
// instruction, an element written wrongly, more than SVG_MOST characters,
// elements nested deeper than MOST_DEPTH, or more than MOST_ELEMENTS.
//
// Left out without refusing, since they draw nothing and are not kept:
// comments, a title or desc and its words, an id on what is not a
// gradient, class, data-* and aria-* attributes, role, and the root's
// width, height, version, baseProfile, preserveAspectRatio, xml:space and
// the xlink namespace's declaration. The root is written with the
// picture's size and covers it (preserveAspectRatio slice).

// The longest illustration taken, in characters. The question asks for a
// few kilobytes.
export const SVG_MOST = 64 * 1024;
const MOST_ELEMENTS = 1500;
const MOST_DEPTH = 16;
const SVG_NS = "http://www.w3.org/2000/svg";
const XLINK_NS = "http://www.w3.org/1999/xlink";

export type Cleaning = { ok: true; svg: string } | { ok: false; reason: string };

class Refused extends Error {}
const refuse = (why: string): never => {
  throw new Refused(why);
};

// ------------------------------------------------------------- the values

// Every value is checked as it is kept: its white space made single
// spaces first, then matched token by token, so that no check takes
// longer than the value is long, whatever a model wrote.
const tidy = (value: string): string => value.trim().replace(/\s+/g, " ");
const NUMBER = /^[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?$/;
const LENGTH = /^([-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?)(?:px|%)?$/;
const ID = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;

type Check = (value: string) => boolean;
const pattern = (expression: RegExp): Check => (value) => expression.test(value);
const oneOf = (...values: string[]): Check => (value) => values.includes(value);

const number = pattern(NUMBER);
const length = pattern(LENGTH);
const opacity = (value: string): boolean => number(value.endsWith("%") ? value.slice(0, -1) : value);
// Numbers apart by a comma or a space: points, a dash pattern, a viewBox.
const items = (value: string): string[] => (value === "" ? [] : value.split(/ ?, ?| /));
const numbers = (value: string): boolean => items(value).every(number);
const dashes = (value: string): boolean => value === "none" || numbers(value);
// Path data: its commands' letters and numbers only.
const pathData = pattern(/^[MmZzLlHhVvCcSsQqTtAa0-9eE+\-., ]*$/);
// Transform functions of numbers only, one after another.
const TRANSFORM = /^(?:matrix|translate|scale|rotate|skewX|skewY) ?\(([^()]*)\) ?,? ?/;
function transform(value: string): boolean {
  let rest = value;
  if (rest === "") return false;
  while (rest !== "") {
    const found = TRANSFORM.exec(rest);
    if (!found || !numbers(found[1]!.trim()) || found[1]!.trim() === "") return false;
    rest = rest.slice(found[0].length);
  }
  return true;
}
// A colour: by its hex, rgb() or rgba() of numbers, or a keyword (a name,
// none, transparent, currentColor): letters only.
const color = pattern(/^(?:#[0-9a-fA-F]{3,4}|#[0-9a-fA-F]{6}|#[0-9a-fA-F]{8}|rgba?\([0-9.%, ]+\)|[a-zA-Z]{3,20})$/);
const LOCAL = /^url\( ?#([A-Za-z][A-Za-z0-9_-]{0,63}) ?\)$/;
// A fill or a stroke: a colour, or a gradient of this document by its id.
const paint = (value: string): boolean => color(value) || LOCAL.test(value);

// What a shape, a group and the root may say of how they are painted.
const PAINTING: Readonly<Record<string, Check>> = {
  fill: paint,
  stroke: paint,
  "stroke-width": length,
  "stroke-linecap": oneOf("butt", "round", "square"),
  "stroke-linejoin": oneOf("miter", "miter-clip", "round", "bevel", "arcs"),
  "stroke-miterlimit": number,
  "stroke-dasharray": dashes,
  "stroke-dashoffset": length,
  "fill-rule": oneOf("nonzero", "evenodd"),
  opacity,
  "fill-opacity": opacity,
  "stroke-opacity": opacity,
  transform,
};

const lengths = (...names: string[]): Record<string, Check> => Object.fromEntries(names.map((name) => [name, length]));
const GRADIENT = { gradientUnits: oneOf("userSpaceOnUse", "objectBoundingBox"), gradientTransform: transform, spreadMethod: oneOf("pad", "reflect", "repeat") };

// Each element kept: the attributes it may have, and what it may hold.
interface Rule {
  attributes: Readonly<Record<string, Check>>;
  holds: readonly string[];
}
const SHAPES = ["path", "rect", "circle", "ellipse", "line", "polyline", "polygon"] as const;
const GRADIENTS = ["linearGradient", "radialGradient"] as const;
const CONTAINS = ["g", "defs", ...SHAPES, ...GRADIENTS];
const shape = (attributes: Record<string, Check>): Rule => ({ attributes: { ...attributes, ...PAINTING }, holds: [] });
const RULES: Readonly<Record<string, Rule>> = {
  svg: { attributes: { ...PAINTING, viewBox: numbers }, holds: CONTAINS },
  g: { attributes: PAINTING, holds: CONTAINS },
  defs: { attributes: {}, holds: GRADIENTS },
  path: shape({ d: pathData }),
  rect: shape(lengths("x", "y", "width", "height", "rx", "ry")),
  circle: shape(lengths("cx", "cy", "r")),
  ellipse: shape(lengths("cx", "cy", "rx", "ry")),
  line: shape(lengths("x1", "y1", "x2", "y2")),
  polyline: shape({ points: numbers }),
  polygon: shape({ points: numbers }),
  linearGradient: { attributes: { id: pattern(ID), ...lengths("x1", "y1", "x2", "y2"), ...GRADIENT }, holds: ["stop"] },
  radialGradient: { attributes: { id: pattern(ID), ...lengths("cx", "cy", "r", "fx", "fy", "fr"), ...GRADIENT }, holds: ["stop"] },
  stop: { attributes: { offset: opacity, "stop-color": color, "stop-opacity": opacity }, holds: [] },
};
// Elements that draw nothing, left out with their words.
const SAID_ONLY = ["title", "desc"];
// Attributes that change nothing drawn, left out: an id where nothing can
// name it, class (no style can reach it), data-* and aria-* and role.
const unkept = (name: string): boolean => name === "id" || name === "class" || name === "role" || /^(?:data|aria)-[a-z0-9-]+$/.test(name);
// The root's own, left out: its size is the picture's.
const ROOT_UNKEPT = new Set(["width", "height", "x", "y", "version", "baseProfile", "preserveAspectRatio", "xml:space"]);

// ------------------------------------------------------------- the parser

interface Parsed {
  name: string;
  attributes: Array<[string, string]>;
  children: Parsed[];
  // Whether words stand in it, between its children.
  words: boolean;
}

const NAME = /[A-Za-z_][A-Za-z0-9_.:-]*/y;
const SPACE = /[ \t\r\n]*/y;

// The plainest XML: an optional declaration, then one element; elements
// with attributes in quotes, white space, comments. Anything else is refused.
function parse(text: string): Parsed {
  let at = 0;
  let count = 0;
  const space = (): void => {
    SPACE.lastIndex = at;
    SPACE.exec(text);
    at = SPACE.lastIndex;
  };
  const name = (): string => {
    NAME.lastIndex = at;
    const found = NAME.exec(text);
    if (!found) refuse("it is not written as an SVG document");
    at = NAME.lastIndex;
    return found![0];
  };
  const comment = (): void => {
    const end = text.indexOf("-->", at + 4);
    if (end < 0) refuse("a comment in it never ends");
    at = end + 3;
  };
  const between = (): void => {
    for (;;) {
      space();
      if (!text.startsWith("<!--", at)) return;
      comment();
    }
  };

  function element(depth: number): Parsed {
    if (depth > MOST_DEPTH) refuse(`its elements are nested more than ${MOST_DEPTH} deep`);
    count += 1;
    if (count > MOST_ELEMENTS) refuse(`it has more than ${MOST_ELEMENTS} elements`);
    at += 1;
    const parsed: Parsed = { name: name(), attributes: [], children: [], words: false };
    for (;;) {
      const before = at;
      space();
      if (text.startsWith("/>", at)) {
        at += 2;
        return parsed;
      }
      if (text[at] === ">") {
        at += 1;
        break;
      }
      if (at === before || at >= text.length) refuse(`its ${parsed.name} element is written wrongly`);
      const attribute = name();
      space();
      if (text[at] !== "=") refuse(`its ${parsed.name} element is written wrongly`);
      at += 1;
      space();
      const quote = text[at];
      if (quote !== "\"" && quote !== "'") refuse(`its ${parsed.name} element is written wrongly`);
      const end = text.indexOf(quote!, at + 1);
      if (end < 0) refuse(`its ${parsed.name} element is written wrongly`);
      const value = text.slice(at + 1, end);
      if (value.includes("<")) refuse(`its ${parsed.name} element is written wrongly`);
      at = end + 1;
      if (parsed.attributes.some(([had]) => had === attribute)) refuse(`its ${parsed.name} element has ${attribute} twice`);
      parsed.attributes.push([attribute, value]);
    }
    for (;;) {
      const start = at;
      const next = text.indexOf("<", at);
      at = next < 0 ? text.length : next;
      if (text.slice(start, at).trim() !== "") parsed.words = true;
      if (at >= text.length) refuse(`its ${parsed.name} element never ends`);
      if (text.startsWith("<!--", at)) {
        comment();
        continue;
      }
      if (text.startsWith("</", at)) {
        at += 2;
        if (name() !== parsed.name) refuse(`its ${parsed.name} element is closed by another`);
        space();
        if (text[at] !== ">") refuse(`its ${parsed.name} element is written wrongly`);
        at += 1;
        return parsed;
      }
      if (text.startsWith("<!", at) || text.startsWith("<?", at)) refuse("it holds a declaration or an instruction");
      parsed.children.push(element(depth + 1));
    }
  }

  // A declaration first, if any: version, encoding and standalone only.
  const declaration = /^\s*<\?xml(?:\s+(?:version|encoding|standalone)\s*=\s*(?:"[^"<>?]*"|'[^'<>?]*'))*\s*\?>/.exec(text);
  if (declaration) at = declaration[0].length;
  between();
  if (text[at] !== "<" || text.startsWith("<?", at) || text.startsWith("<!", at)) refuse("it is not written as an SVG document");
  const root = element(1);
  between();
  if (at !== text.length) refuse("something follows its svg element");
  return root;
}

// ------------------------------------------------------------ the cleaner

// A value as it is written out: it passed its check, so it holds no
// quote, `<` or `&`; escaped all the same.
const escape = (value: string): string => value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
const shown = (value: string): string => (value.length > 60 ? `${value.slice(0, 60)}…` : value);

// What the walk gathers: the gradients defined, those painted with, and
// how many shapes there are.
interface Walk {
  gradients: Set<string>;
  named: string[];
  shapes: number;
}

// The illustration as it may be drawn, `size` its pixels, or why it may not.
export function cleanSvg(raw: unknown, size: { width: number; height: number }): Cleaning {
  try {
    if (typeof raw !== "string" || raw.trim() === "") refuse("it is empty");
    const text = raw as string;
    if (text.length > SVG_MOST) refuse(`it is ${Math.ceil(text.length / 1024)} KB, and an illustration here is at most ${SVG_MOST / 1024} KB`);
    if (/<!DOCTYPE/i.test(text)) refuse("it holds a DOCTYPE, which can declare entities");
    if (/<!ENTITY/i.test(text)) refuse("it declares an entity");
    if (/<!\[CDATA\[/i.test(text)) refuse("it holds a CDATA section");
    if (text.includes("&")) refuse("it holds an entity or a character reference (&)");
    const root = parse(text);
    if (root.name !== "svg") refuse(`its root is ${root.name}, not svg`);
    if (root.words) refuse("its svg element holds words, and an illustration here holds none");
    const walk: Walk = { gradients: new Set(), named: [], shapes: 0 };
    const painting = kept(root, RULES.svg!, walk);
    const viewBox = painting.find(([attribute]) => attribute === "viewBox")?.[1];
    if (viewBox === undefined) refuse("it has no viewBox");
    const box = items(viewBox!).map(Number);
    if (box.length !== 4 || !box.every(Number.isFinite) || box[2]! <= 0 || box[3]! <= 0) refuse(`its viewBox, "${shown(viewBox!)}", is not four numbers with a size above nothing`);
    const body = root.children.map((child) => write(child, "svg", walk)).join("");
    for (const id of walk.named) if (!walk.gradients.has(id)) refuse(`it paints with url(#${id}), a gradient it does not define`);
    if (walk.shapes === 0) refuse("it draws nothing");
    const own = painting.filter(([attribute]) => attribute !== "viewBox").map(([attribute, value]) => ` ${attribute}="${escape(value)}"`).join("");
    return { ok: true, svg: `<svg xmlns="${SVG_NS}" viewBox="${box.join(" ")}" width="${size.width}" height="${size.height}" preserveAspectRatio="xMidYMid slice"${own}>${body}</svg>` };
  } catch (error) {
    if (error instanceof Refused) return { ok: false, reason: error.message };
    throw error;
  }
}

// An element's attributes kept, each checked as its white space is made
// single spaces; the gradients it paints with gathered.
function kept(element: Parsed, rule: Rule, walk: Walk): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  const root = element.name === "svg";
  for (const [attribute, raw] of element.attributes) {
    const value = tidy(raw);
    if (root && attribute === "xmlns") {
      if (value !== SVG_NS) refuse(`its namespace is ${shown(value) || "none"}, not SVG's`);
      continue;
    }
    if (root && attribute === "xmlns:xlink") {
      if (value !== XLINK_NS) refuse("it declares a namespace of its own");
      continue;
    }
    const check = Object.hasOwn(rule.attributes, attribute) ? rule.attributes[attribute] : undefined;
    if (check === undefined) {
      if ((root && ROOT_UNKEPT.has(attribute)) || unkept(attribute)) continue;
      refuse(`its ${element.name} element has ${attribute}, which an illustration here may not have`);
    }
    if (!check!(value)) refuse(`its ${element.name} element's ${attribute} is "${shown(value)}", which it may not be`);
    const local = LOCAL.exec(value);
    if (local && (attribute === "fill" || attribute === "stroke")) walk.named.push(local[1]!);
    out.push([attribute, value]);
  }
  return out;
}

// One element written anew, under `parent`, from what is kept of it.
function write(element: Parsed, parent: string, walk: Walk): string {
  if (SAID_ONLY.includes(element.name)) return "";
  const rule = Object.hasOwn(RULES, element.name) && element.name !== "svg" ? RULES[element.name] : undefined;
  if (rule === undefined) refuse(`it holds a ${element.name} element, which an illustration here may not hold`);
  if (!RULES[parent]!.holds.includes(element.name)) refuse(`it holds a ${element.name} element inside its ${parent} element`);
  if (element.words) refuse(`its ${element.name} element holds words, and an illustration here holds none`);
  const attributes = kept(element, rule!, walk);
  if (element.name === "linearGradient" || element.name === "radialGradient") {
    const id = attributes.find(([attribute]) => attribute === "id")?.[1];
    if (id === undefined) refuse(`its ${element.name} has no id to be named by`);
    if (walk.gradients.has(id!)) refuse(`it names two gradients ${id}`);
    walk.gradients.add(id!);
  }
  if ((SHAPES as readonly string[]).includes(element.name)) walk.shapes += 1;
  const open = `<${element.name}${attributes.map(([attribute, value]) => ` ${attribute}="${escape(value)}"`).join("")}`;
  const inner = element.children.map((child) => write(child, element.name, walk)).join("");
  return inner === "" ? `${open}/>` : `${open}>${inner}</${element.name}>`;
}
