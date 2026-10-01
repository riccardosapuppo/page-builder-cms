// Application rules for page documents: the checks JSON Schema cannot make,
// run before the schema. cms/lib/block_document/rules.rb is the same code in
// Ruby, rule for rule and pointer for pointer; the comparator in this folder
// runs both over the corpus and fails if they ever answer differently.
//
// No dependencies and no Node APIs, so the editor can import this file as is.
//
// The pipeline, the same on both sides:
//   1. the bytes must be UTF-8                         -> "encoding"
//   2. the text must be strict JSON, checked by a scanner of our own:
//      grammar ("parse"), duplicate keys ("duplicateKey"), nesting deeper
//      than MAX_NESTING ("maxNesting"), lone surrogates ("wellFormed")
//   3. the language's own parser reads the text; after a clean scan it cannot
//      fail, so if it does, that is a bug and it throws
//   4. the tree: well-formed strings ("wellFormed"), finite numbers
//      ("finite"), exact integers ("safeInteger"), unique block ids
//      ("uniqueId")
//   5. normalisation: an integral number becomes an integer (2.0 -> 2)
// Then the schema runs on the normalised document.

export const MAX_NESTING = 64;
export const MAX_SAFE_INTEGER = 9007199254740991; // 2^53 - 1, the largest integer both languages read exactly

export type RuleKeyword =
  | "encoding"
  | "parse"
  | "duplicateKey"
  | "maxNesting"
  | "wellFormed"
  | "finite"
  | "safeInteger"
  | "uniqueId";

export interface RuleError {
  pointer: string;
  keyword: RuleKeyword;
  message: string;
}

export interface ParseResult {
  // Present when the text was read, even if the tree broke a rule; normalised
  // only when errors is empty.
  document?: unknown;
  errors: RuleError[];
}

// Reads a document from the bytes received (or from a string already decoded)
// and applies every rule. The document is ready for the schema only when
// errors is empty.
export function parseDocument(input: Uint8Array | string): ParseResult {
  let text: string;
  if (typeof input === "string") {
    text = input;
  } else {
    const decoded = decodeUtf8(input);
    if (typeof decoded !== "string") return { errors: [decoded] };
    text = decoded;
  }
  const scanError = scanJson(text);
  if (scanError) return { errors: [scanError] };
  const document: unknown = JSON.parse(text);
  const errors = checkTree(document);
  if (errors.length > 0) return { document, errors };
  return { document: normalise(document), errors: [] };
}

// Applies the rules to a document already in memory, as the editor holds it.
// Same as parseDocument without the text steps, which a value cannot break.
export function checkDocument(document: unknown): ParseResult {
  const errors = checkTree(document);
  if (errors.length > 0) return { document, errors };
  return { document: normalise(document), errors: [] };
}

const utf8 = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

// ignoreBOM keeps a byte-order mark in the text, where the scanner rejects it
// like Ruby's parser does, instead of silently dropping it.
export function decodeUtf8(bytes: Uint8Array): string | RuleError {
  try {
    return utf8.decode(bytes);
  } catch {
    return { pointer: "", keyword: "encoding", message: "The text is not valid UTF-8." };
  }
}

export function escapePointer(key: string): string {
  return key.replace(/~/g, "~0").replace(/\//g, "~1");
}

// ---------------------------------------------------------------------------
// Step 2: the scanner. Iterative, so a deep text cannot exhaust the stack. It
// stops at the first problem; the pointer says where it is, except for
// grammar errors, which carry "" and the position in the message.
// ---------------------------------------------------------------------------

interface ObjectFrame {
  kind: "object";
  keys: Set<string>;
  key: string;
}
interface ArrayFrame {
  kind: "array";
  index: number;
}
type Frame = ObjectFrame | ArrayFrame;

function pointerOf(frames: readonly Frame[], count = frames.length): string {
  let pointer = "";
  for (let k = 0; k < count; k++) {
    const frame = frames[k] as Frame;
    pointer += "/" + (frame.kind === "array" ? String(frame.index) : escapePointer(frame.key));
  }
  return pointer;
}

const isHex = (c: number): boolean => (c >= 0x30 && c <= 0x39) || (c >= 0x41 && c <= 0x46) || (c >= 0x61 && c <= 0x66);
const isDigit = (c: number): boolean => c >= 0x30 && c <= 0x39;

export function scanJson(text: string): RuleError | null {
  const n = text.length;
  const frames: Frame[] = [];
  let i = 0;

  const parseError = (what: string): RuleError => ({
    pointer: "",
    keyword: "parse",
    message: `${what} at position ${i}.`,
  });
  const skipWhitespace = (): void => {
    while (i < n) {
      const c = text.charCodeAt(i);
      if (c === 0x20 || c === 0x09 || c === 0x0a || c === 0x0d) i++;
      else break;
    }
  };
  const hex4 = (at: number): number => {
    if (at + 4 > n) return -1;
    for (let k = at; k < at + 4; k++) if (!isHex(text.charCodeAt(k))) return -1;
    return parseInt(text.slice(at, at + 4), 16);
  };

  // i is on the opening quote. surrogatePointer is where a lone surrogate is
  // reported: the value itself, or for a key the object that holds it.
  const readString = (surrogatePointer: () => string): RuleError | null => {
    const lone = (): RuleError => ({
      pointer: surrogatePointer(),
      keyword: "wellFormed",
      message: "A string holds half of a surrogate pair.",
    });
    i++;
    while (i < n) {
      const c = text.charCodeAt(i);
      if (c === 0x22) {
        i++;
        return null;
      }
      if (c < 0x20) return parseError("Control character inside a string");
      if (c === 0x5c) {
        const e = text.charCodeAt(i + 1);
        if (e === 0x22 || e === 0x5c || e === 0x2f || e === 0x62 || e === 0x66 || e === 0x6e || e === 0x72 || e === 0x74) {
          i += 2;
        } else if (e === 0x75) {
          const code = hex4(i + 2);
          if (code < 0) return parseError("Invalid \\u escape");
          i += 6;
          if (code >= 0xd800 && code <= 0xdbff) {
            const low = text.charCodeAt(i) === 0x5c && text.charCodeAt(i + 1) === 0x75 ? hex4(i + 2) : -1;
            if (low < 0xdc00 || low > 0xdfff) return lone();
            i += 6;
          } else if (code >= 0xdc00 && code <= 0xdfff) {
            return lone();
          }
        } else {
          return parseError("Invalid escape");
        }
      } else if (c >= 0xd800 && c <= 0xdbff) {
        // Only a string handed in already decoded can hold a raw lone surrogate.
        const next = text.charCodeAt(i + 1);
        if (!(next >= 0xdc00 && next <= 0xdfff)) return lone();
        i += 2;
      } else if (c >= 0xdc00 && c <= 0xdfff) {
        return lone();
      } else {
        i++;
      }
    }
    return parseError("Unterminated string");
  };

  // i is just after "{" or ","; reads the member name and the colon.
  const readKey = (frame: ObjectFrame): RuleError | null => {
    skipWhitespace();
    if (text.charCodeAt(i) !== 0x22) return parseError("Expected a member name");
    const start = i;
    const error = readString(() => pointerOf(frames, frames.length - 1));
    if (error) return error;
    const raw = text.slice(start, i);
    const key = raw.includes("\\") ? (JSON.parse(raw) as string) : raw.slice(1, -1);
    frame.key = key;
    if (frame.keys.has(key)) {
      return { pointer: pointerOf(frames), keyword: "duplicateKey", message: `The name "${key}" appears twice in one object.` };
    }
    frame.keys.add(key);
    skipWhitespace();
    if (text.charCodeAt(i) !== 0x3a) return parseError("Expected ':'");
    i++;
    return null;
  };

  const readNumber = (): RuleError | null => {
    if (text.charCodeAt(i) === 0x2d) i++;
    const first = text.charCodeAt(i);
    if (first === 0x30) {
      i++;
    } else if (first >= 0x31 && first <= 0x39) {
      while (isDigit(text.charCodeAt(i))) i++;
    } else {
      return parseError("Invalid number");
    }
    if (text.charCodeAt(i) === 0x2e) {
      i++;
      if (!isDigit(text.charCodeAt(i))) return parseError("Invalid number");
      while (isDigit(text.charCodeAt(i))) i++;
    }
    const e = text.charCodeAt(i);
    if (e === 0x65 || e === 0x45) {
      i++;
      const sign = text.charCodeAt(i);
      if (sign === 0x2b || sign === 0x2d) i++;
      if (!isDigit(text.charCodeAt(i))) return parseError("Invalid number");
      while (isDigit(text.charCodeAt(i))) i++;
    }
    return null;
  };

  let expectValue = true;
  for (;;) {
    if (expectValue) {
      skipWhitespace();
      if (i >= n) return parseError("Unexpected end of text");
      const c = text.charCodeAt(i);
      if (c === 0x7b || c === 0x5b) {
        if (frames.length + 1 > MAX_NESTING) {
          return {
            pointer: pointerOf(frames),
            keyword: "maxNesting",
            message: `Objects and arrays are nested deeper than ${MAX_NESTING} levels.`,
          };
        }
        i++;
        skipWhitespace();
        if (c === 0x7b) {
          const frame: ObjectFrame = { kind: "object", keys: new Set(), key: "" };
          frames.push(frame);
          if (text.charCodeAt(i) === 0x7d) {
            i++;
            frames.pop();
            expectValue = false;
          } else {
            const error = readKey(frame);
            if (error) return error;
          }
        } else {
          frames.push({ kind: "array", index: 0 });
          if (text.charCodeAt(i) === 0x5d) {
            i++;
            frames.pop();
            expectValue = false;
          }
        }
        continue;
      }
      let error: RuleError | null = null;
      if (c === 0x22) {
        error = readString(() => pointerOf(frames));
      } else if (c === 0x2d || isDigit(c)) {
        error = readNumber();
      } else if (text.startsWith("true", i)) {
        i += 4;
      } else if (text.startsWith("false", i)) {
        i += 5;
      } else if (text.startsWith("null", i)) {
        i += 4;
      } else {
        error = parseError("Unexpected character");
      }
      if (error) return error;
      expectValue = false;
      continue;
    }

    // After a value: close containers or move to the next member.
    skipWhitespace();
    const top = frames[frames.length - 1];
    if (!top) {
      return i === n ? null : parseError("Unexpected text after the document");
    }
    const c = text.charCodeAt(i);
    if (c === 0x2c) {
      i++;
      if (top.kind === "object") {
        const error = readKey(top);
        if (error) return error;
      } else {
        top.index++;
      }
      expectValue = true;
    } else if ((top.kind === "object" && c === 0x7d) || (top.kind === "array" && c === 0x5d)) {
      i++;
      frames.pop();
    } else {
      return parseError(top.kind === "object" ? "Expected ',' or '}'" : "Expected ',' or ']'");
    }
  }
}

// ---------------------------------------------------------------------------
// Step 4: rules on the tree.
// ---------------------------------------------------------------------------

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function checkTree(document: unknown): RuleError[] {
  const errors: RuleError[] = [];

  // Every value, iteratively. depth is the number of containers above.
  const stack: Array<{ value: unknown; pointer: string; depth: number }> = [{ value: document, pointer: "", depth: 0 }];
  for (let item = stack.pop(); item; item = stack.pop()) {
    const { value, pointer, depth } = item;
    if (typeof value === "string") {
      if (!value.isWellFormed()) {
        errors.push({ pointer, keyword: "wellFormed", message: "A string holds half of a surrogate pair." });
      }
    } else if (typeof value === "number") {
      if (!Number.isFinite(value)) {
        errors.push({ pointer, keyword: "finite", message: "A number is too large to be stored." });
      } else if (Number.isInteger(value) && Math.abs(value) > MAX_SAFE_INTEGER) {
        errors.push({ pointer, keyword: "safeInteger", message: `An integer is beyond ${MAX_SAFE_INTEGER}, where it stops being exact.` });
      }
    } else if (Array.isArray(value) || isObject(value)) {
      if (depth + 1 > MAX_NESTING) {
        errors.push({ pointer, keyword: "maxNesting", message: `Objects and arrays are nested deeper than ${MAX_NESTING} levels.` });
        continue;
      }
      if (Array.isArray(value)) {
        value.forEach((child, k) => stack.push({ value: child, pointer: `${pointer}/${k}`, depth: depth + 1 }));
      } else {
        for (const [key, child] of Object.entries(value)) {
          if (!key.isWellFormed()) {
            errors.push({ pointer, keyword: "wellFormed", message: "A member name holds half of a surrogate pair." });
            continue;
          }
          stack.push({ value: child, pointer: `${pointer}/${escapePointer(key)}`, depth: depth + 1 });
        }
      }
    }
  }

  // Block ids, in document order: the second block with an id is the one
  // reported.
  if (isObject(document) && Array.isArray(document.sections)) {
    const seen = new Set<string>();
    const blocks: Array<{ block: unknown; pointer: string }> = [];
    const pushChildren = (list: unknown[], pointer: string): void => {
      for (let k = list.length - 1; k >= 0; k--) blocks.push({ block: list[k], pointer: `${pointer}/${k}` });
    };
    pushChildren(document.sections, "/sections");
    for (let item = blocks.pop(); item; item = blocks.pop()) {
      const { block, pointer } = item;
      if (!isObject(block)) continue;
      if (typeof block.id === "string") {
        if (seen.has(block.id)) {
          errors.push({ pointer: `${pointer}/id`, keyword: "uniqueId", message: `The id "${block.id}" is already used by another block.` });
        } else {
          seen.add(block.id);
        }
      }
      if (Array.isArray(block.children)) pushChildren(block.children, `${pointer}/children`);
    }
  }
  return errors;
}

// ---------------------------------------------------------------------------
// Step 5: normalisation. JavaScript has one number type, so 2.0 is already 2
// here and only -0 changes; the Ruby twin turns integral Floats into Integers.
// Call it only on a document that passed checkTree.
// ---------------------------------------------------------------------------

export function normalise(value: unknown): unknown {
  if (typeof value === "number") return Object.is(value, -0) ? 0 : value;
  if (Array.isArray(value)) return value.map(normalise);
  // fromEntries defines "__proto__" as an ordinary member, as JSON.parse does.
  if (isObject(value)) return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, normalise(v)]));
  return value;
}
