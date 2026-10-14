// A site's own stylesheet (Custom CSS in Site style), checked before it is
// kept or drawn, the same way here and in the CMS (cms/app/models/
// custom_css.rb), on the shared cases of contract/custom-css/cases.json.
//
// The rules are drawn inside the site, in an @scope rule whose root is the
// page root (.site): on the canvas they style the page and never the
// editor around it, and on the published page they style the same things.
// So the stylesheet must keep to its scope: every "{" closed by its "}",
// read as the browser reads CSS (inside a comment or a string a brace is
// none, an escaped one is none, a string ends at its line's end), never a
// "}" that closes nothing; no @import, which a scoped stylesheet cannot
// hold and the pages' policy would not load; and no more than 50 000
// characters. What breaks a rule says where: its line, from 1.
//
// On the canvas, the page is drawn inside the editor, whose own
// stylesheets name classes too (btn, menu, label): a block named like one
// of them would take the editor's rules there. So on the canvas alone a
// class of the site's own carries a prefix (hero is own-hero), and its
// rules are renamed the same way (canvasCss); the published page keeps
// the names and the rules as written.
import { reservedClass } from "../../../schema/tools/rules.ts";

export const CUSTOM_CSS_MAX = 50_000;

// The prefix a class of the site's own carries on the canvas, which no
// class of the editor's starts with.
export const CANVAS_CLASS_PREFIX = "own-";

export interface CssProblem {
  message: string;
  line: number;
}

// The text as CSS reads it: a carriage return, the pair CR LF and a form
// feed end a line as a line feed does (CSS Syntax 3, preprocessing), and
// a string ends at any of them. Read so here, no string the browser ends
// there is read on past it, braces and all.
export function cssLines(css: string): string {
  return css.replace(/\r\n|\r|\f/g, "\n");
}

// Characters are counted as the CMS counts them, by code point; a word is
// ASCII letters, digits, "_" and "-", on both sides.
export function checkCustomCss(written: string): CssProblem | null {
  if ([...written].length > CUSTOM_CSS_MAX) return { message: `Keep it under ${CUSTOM_CSS_MAX.toLocaleString("en-US")} characters.`, line: 1 };
  const css = cssLines(written);
  let line = 1;
  const open: number[] = [];
  let i = 0;
  while (i < css.length) {
    const c = css[i]!;
    if (c === "\n") {
      line += 1;
      i += 1;
    } else if (c === "/" && css[i + 1] === "*") {
      const end = css.indexOf("*/", i + 2);
      if (end < 0) return { message: "A comment is not closed: end it with */.", line };
      line += countLines(css, i, end);
      i = end + 2;
    } else if (c === '"' || c === "'") {
      const start = line;
      i += 1;
      for (;;) {
        if (i >= css.length) return { message: "A string is not closed.", line: start };
        const s = css[i]!;
        if (s === "\\") {
          if (css[i + 1] === "\n") line += 1;
          i += 2;
        } else if (s === "\n") {
          return { message: "A string runs past the end of its line: close its quote.", line: start };
        } else {
          i += 1;
          if (s === c) break;
        }
      }
    } else if (c === "@" && startsName(css, i + 1) && lower(readName(css, i + 1).text) === "import") {
      return { message: "@import is not allowed: the page loads only its own stylesheets.", line };
    } else if (startsName(css, i)) {
      // A name, read whole with its escapes undone. After url( however it
      // is written (u\72l is url to the browser), an address not in quotes
      // runs to the first ) no escape holds: a brace inside it would be
      // read as one here and as part of the address by the browser.
      const name = readName(css, i);
      const address = isUrl(css, name) ? unquotedAddress(css, name.end + 1) : null;
      if (address === null) {
        line += countLines(css, i, name.end);
        i = name.end;
      } else if (address.end < 0) {
        return { message: "A url( is not closed: end it with ).", line };
      } else if (/[{}]/.test(css.slice(address.start, address.end))) {
        return { message: "A url( holds a brace: put the address in quotes.", line };
      } else {
        line += countLines(css, i, address.end);
        i = address.end + 1;
      }
    } else if (c === "\\") {
      // Before a line's end a backslash escapes nothing.
      if (css[i + 1] === "\n") line += 1;
      i += 2;
    } else if (c === "{") {
      open.push(line);
      i += 1;
    } else if (c === "}") {
      if (open.length === 0) return { message: "This } closes nothing.", line };
      open.pop();
      i += 1;
    } else {
      i += 1;
    }
  }
  if (open.length > 0) return { message: "This { is not closed: end the rule with }.", line: open[open.length - 1]! };
  return null;
}

// Lower case in ASCII only, as CSS compares names, and as the CMS does.
const lower = (text: string) => text.replace(/[A-Z]/g, (letter) => letter.toLowerCase());

// Whether a name starts at `at`, as CSS reads one: a letter, "_", "-" or a
// character past ASCII, or a backslash that escapes something (not a
// line's end).
function startsName(css: string, at: number): boolean {
  const c = css[at];
  if (c === undefined) return false;
  if (c === "\\") return at + 1 < css.length && css[at + 1] !== "\n";
  return /[A-Za-z_-]/.test(c) || c.charCodeAt(0) >= 0x80;
}

// The name that starts at `at`, its escapes undone as CSS undoes them (\72
// is r, and so is \72 with one blank after it; \{ is {), and where it ends.
function readName(css: string, at: number): { text: string; end: number } {
  let text = "";
  let i = at;
  while (i < css.length) {
    const c = css[i]!;
    if (c === "\\" && i + 1 < css.length && css[i + 1] !== "\n") {
      const hex = /^[0-9A-Fa-f]{1,6}/.exec(css.slice(i + 1, i + 7));
      if (hex) {
        const code = parseInt(hex[0], 16);
        text += code === 0 || (code >= 0xd800 && code <= 0xdfff) || code > 0x10ffff ? "�" : String.fromCodePoint(code);
        i += 1 + hex[0].length;
        if (/[ \t\n]/.test(css[i] ?? "")) i += 1;
      } else {
        text += css[i + 1];
        i += 2;
      }
    } else if (/[A-Za-z0-9_-]/.test(c) || c.charCodeAt(0) >= 0x80) {
      text += c;
      i += 1;
    } else {
      break;
    }
  }
  return { text, end: i };
}

// Whether a name is url with its "(" after it.
const isUrl = (css: string, name: { text: string; end: number }) => lower(name.text) === "url" && css[name.end] === "(";

// The address after "url(" at `from`, when it is not in quotes: where it
// starts, past any blanks, and the ) that ends it, the first no escape
// holds (-1 when there is none). null when it is in quotes: a string, read
// as one.
function unquotedAddress(css: string, from: number): { start: number; end: number } | null {
  let start = from;
  while (start < css.length && /[ \t\n]/.test(css[start]!)) start += 1;
  if (css[start] === '"' || css[start] === "'") return null;
  let end = start;
  while (end < css.length && css[end] !== ")") end += css[end] === "\\" ? 2 : 1;
  return { start, end: end < css.length ? end : -1 };
}

function countLines(text: string, from: number, to: number): number {
  let n = 0;
  for (let k = from; k < to; k += 1) if (text[k] === "\n") n += 1;
  return n;
}

// The stylesheet as the page draws it, inside the site: an @scope rule
// whose root is the page root, so its rules style the page and nothing
// around it. With `leave`, a selector of things drawn in the page that its
// rules stop at (@scope's lower boundary): the editor's controls on the
// canvas. Empty when there is none.
export function scopedCss(css: string, leave?: string): string {
  const trimmed = css.replace(/^[ \t\n\r\f]+|[ \t\n\r\f]+$/g, "");
  return trimmed === "" ? "" : `@scope (.site)${leave ? ` to (${leave})` : ""} {\n${trimmed}\n}\n`;
}

// The stylesheet as the canvas draws it: in its selectors, each class of
// the site's own renamed as the canvas names it (.hero is .own-hero), the
// theme's (.sw-btn, .bg-primary), which the canvas draws as they are, left
// alone. Selectors are a rule's and a nested rule's, @scope's and those in
// @supports' selector(); declarations, strings, comments, addresses and
// every other at-rule stay as written. A class matched another way
// ([class~="hero"]) is not renamed, so it matches on the page only. For a
// stylesheet checkCustomCss takes, its lines read as CSS reads them.
export function canvasCss(written: string, prefix: string = CANVAS_CLASS_PREFIX): string {
  const css = cssLines(written);
  let out = "";
  let from = 0;
  for (let i = 0; i < css.length;) {
    const skip = lexeme(css, i);
    if (skip > 0) {
      i += skip;
      continue;
    }
    const c = css[i];
    if (c === "{") {
      out += `${prelude(css.slice(from, i), prefix)}{`;
      from = i + 1;
    } else if (c === "}" || c === ";") {
      out += css.slice(from, i + 1);
      from = i + 1;
    }
    i += 1;
  }
  return out + css.slice(from);
}

// The length of what CSS reads as one piece from `at`, where no brace,
// semicolon or dot means what it would outside: a comment, a string (to
// its quote, or to its line's end), a name with its escapes (u\72l is url),
// and after url( an address not in quotes, to the first ) no escape holds.
// 0 for anything else, read one character at a time.
function lexeme(css: string, at: number): number {
  const c = css[at];
  if (c === "/" && css[at + 1] === "*") {
    const end = css.indexOf("*/", at + 2);
    return (end < 0 ? css.length : end + 2) - at;
  }
  if (c === '"' || c === "'") {
    let i = at + 1;
    while (i < css.length && css[i] !== c && css[i] !== "\n") i += css[i] === "\\" ? 2 : 1;
    return Math.min(i + 1, css.length) - at;
  }
  if (startsName(css, at)) {
    const name = readName(css, at);
    const address = isUrl(css, name) ? unquotedAddress(css, name.end + 1) : null;
    return (address === null ? name.end : address.end < 0 ? css.length : address.end + 1) - at;
  }
  if (c === "\\") return Math.min(2, css.length - at);
  return 0;
}

// A prelude, what comes before a "{": a selector list, its classes
// renamed; @scope's, the same; @supports', only inside selector(); any
// other at-rule's (@media, @layer, @keyframes), as it is.
function prelude(text: string, prefix: string): string {
  const keyword = /^(?:[ \t\n\r\f]|\/\*[\s\S]*?\*\/)*@([A-Za-z-]+)/.exec(text)?.[1]?.toLowerCase();
  if (keyword === undefined || keyword === "scope") return renameClasses(text, prefix);
  if (keyword === "supports") return renameInSelectors(text, prefix);
  return text;
}

// Every ".name" of a selector whose name is a class the site may give a
// block (ASCII, not the theme's), with the prefix after the dot. A name
// written with an escape, or that goes on past ASCII, is no class of the
// site's.
function renameClasses(text: string, prefix: string): string {
  let out = "";
  for (let i = 0; i < text.length;) {
    if (text[i] === "." && startsName(text, i + 1)) {
      const name = readName(text, i + 1);
      const written = text.slice(i + 1, name.end);
      const own = written === name.text && /^[A-Za-z][A-Za-z0-9_-]*$/.test(written) && reservedClass(written) === null;
      out += own ? `.${prefix}${written}` : `.${written}`;
      i = name.end;
      continue;
    }
    const skip = lexeme(text, i);
    if (skip > 0) {
      out += text.slice(i, i + skip);
      i += skip;
      continue;
    }
    out += text[i];
    i += 1;
  }
  return out;
}

// The classes inside each selector() of an @supports prelude, renamed.
function renameInSelectors(text: string, prefix: string): string {
  let out = "";
  for (let i = 0; i < text.length;) {
    if (startsName(text, i)) {
      const name = readName(text, i);
      if (lower(name.text) === "selector" && text[name.end] === "(") {
        let depth = 0;
        let j = name.end;
        while (j < text.length) {
          const inner = lexeme(text, j);
          if (inner > 0) {
            j += inner;
            continue;
          }
          if (text[j] === "(") depth += 1;
          else if (text[j] === ")" && --depth === 0) break;
          j += 1;
        }
        out += `${text.slice(i, name.end + 1)}${renameClasses(text.slice(name.end + 1, j), prefix)}${text.slice(j, j + 1)}`;
        i = j + 1;
        continue;
      }
    }
    const skip = lexeme(text, i);
    if (skip > 0) {
      out += text.slice(i, i + skip);
      i += skip;
      continue;
    }
    out += text[i];
    i += 1;
  }
  return out;
}
