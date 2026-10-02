// What a change must not break, checked where it can break it.
//
// A block's validity is its own and its subtree's: the schema's $defs/block
// says nothing about the rest of the page. So a page that was valid stays
// valid after a change when:
// - every block the change put somewhere is a type its new container may
//   hold (the nesting rule, ./nesting.ts);
// - every container whose children changed, and every block whose props or
//   style changed, still passes the schema, validated alone with everything
//   under it (a section that would get a fifth column fails here, by the
//   schema's own "at most 4", not by a count written again in the editor);
// - what the change brought in keeps the application rules: well-formed
//   strings, finite and exact numbers, nesting depth where it now sits, and
//   ids nobody else on the page has.
// The page itself is checked as a shell, its sections without their
// widgets, when its own keys or its list of sections changed.
//
// The whole page is validated only when asked (a drop, a document read from
// outside): milliseconds on 500 blocks, against microseconds for one parent
// (the measurements are in ./README.md).
import type { BlockType, PageDocument } from "../shared/document.ts";
import {
  checkTree, MAX_NESTING, validateBlockSchema, validateDocumentSchema, validateHeldDocument, type DocumentError,
} from "../shared/validate.ts";
import { blockWithPlace, ITEM_NAMES, plural, TYPE_NAMES } from "./labels.ts";
import { canContain, childTypes, containersFor, type ContainerType } from "./nesting.ts";
import { duplicateId, locate, pointerOf, type ParentId } from "./tree.ts";

export type Reason =
  // The block, container or item is not on the page.
  | "unknown"
  // The page is not the one the command was made for.
  | "stale"
  // The block's type may not go into that container.
  | "nesting"
  // The container holds as many as the schema allows.
  | "full"
  // The container would hold fewer than the schema requires.
  | "empty"
  // An id the page already has.
  | "duplicateId"
  // Anything else the schema or the application rules refuse.
  | "invalid"
  // There is nowhere for it to go (a paste with nothing that can hold it).
  | "noTarget"
  // The command would change nothing.
  | "nothing";

export interface CommandError {
  reason: Reason;
  // For the person using the editor, in en-US.
  message: string;
  // The validator's own findings, pointers from the page, when it had any.
  errors?: DocumentError[];
}

export function refusal(reason: Reason, message: string, errors?: DocumentError[]): CommandError {
  return errors ? { reason, message, errors } : { reason, message };
}

const article = (word: string): string => (/^[aeiou]/i.test(word) ? `an ${word}` : `a ${word}`);

// Why a block of this type cannot go into that container: "Widgets go
// inside a column." The design's own words for the commonest case.
export function nestingMessage(type: BlockType, container: ContainerType): string {
  const homes = containersFor(type);
  const where = homes.length === 0
    ? "nowhere on the page"
    : homes.map((home) => (home === "page" ? "on the page" : `inside ${article(TYPE_NAMES[home].toLowerCase())}`)).join(" or ");
  const what = type === "section" || type === "column" ? `${TYPE_NAMES[type]}s` : "Widgets";
  const into = container === "page" ? "the page" : article(TYPE_NAMES[container].toLowerCase());
  return `${what} go ${where}, not into ${into}.`;
}

export function checkNesting(container: ContainerType, type: BlockType): CommandError | null {
  return canContain(container, type) ? null : refusal("nesting", nestingMessage(type, container));
}

// The application rules on a value a change brings in, `depth` objects and
// arrays below the top of the page.
export function checkValueRules(value: unknown, pointer: string, depth: number): CommandError | null {
  const errors: DocumentError[] = checkTree(value).map((e) => ({ pointer: `${pointer}${e.pointer}`, keyword: e.keyword, message: e.message, layer: "rules" }));
  const deepest = containerDepth(value);
  if (deepest >= 0 && depth + deepest + 1 > MAX_NESTING) {
    errors.push({ pointer, keyword: "maxNesting", message: `Objects and arrays are nested deeper than ${MAX_NESTING} levels.`, layer: "rules" });
  }
  // checkTree finds the same depth on its own from 64 levels down; one
  // finding of each is enough.
  const seen = new Set<string>();
  const unique = errors.filter((e) => !seen.has(`${e.pointer} ${e.keyword}`) && seen.add(`${e.pointer} ${e.keyword}`));
  return unique.length === 0 ? null : refusal("invalid", unique[0]?.message ?? "invalid", unique);
}

// How many objects and arrays deep the deepest one in a value is: -1 for a
// string or a number, 0 for an object holding only those.
function containerDepth(value: unknown): number {
  let deepest = -1;
  const stack: Array<{ value: unknown; level: number }> = [{ value, level: 0 }];
  for (let item = stack.pop(); item; item = stack.pop()) {
    if (item.value === null || typeof item.value !== "object") continue;
    deepest = Math.max(deepest, item.level);
    for (const child of Object.values(item.value)) stack.push({ value: child, level: item.level + 1 });
  }
  return deepest;
}

// A container whose children changed, or a block whose props or style did,
// validated alone with everything under it. For the page: its own keys and
// its list of sections, with each column emptied (which the schema allows),
// so the widgets are not validated again.
export function checkContainer(doc: PageDocument, id: ParentId): CommandError | null {
  if (id === null) return checkPageShell(doc);
  const found = locate(doc, id);
  if (!found) return refusal("unknown", `There is no block ${id} on the page.`);
  const result = validateBlockSchema(found.block);
  if (result.valid) return null;
  const at = pointerOf(found.path);
  const errors = result.errors.map((e) => ({ ...e, pointer: `${at}${e.pointer}` }));
  return countRefusal(doc, id, found.block.type, result.errors) ?? refusal("invalid", `${blockWithPlace(doc, id)} would not be valid: ${errors[0]?.message ?? "invalid"}.`, errors);
}

// The shell is checked by the schema alone: the values in it are the
// page's own and the sections' and columns' props and style, which the
// application rules saw when each came in.
function checkPageShell(doc: PageDocument): CommandError | null {
  const shell = {
    ...doc,
    sections: doc.sections.map((section) => ({ ...section, children: section.children.map((column) => ({ ...column, children: [] })) })),
  };
  const result = validateDocumentSchema(shell);
  if (result.valid) return null;
  return countRefusal(doc, null, "page", result.errors, "/sections")
    ?? refusal("invalid", `The page would not be valid: ${result.errors[0]?.message ?? "invalid"}.`, result.errors);
}

// A count the schema refuses, said as one: "Hero is full: it holds at most
// 4 columns." Counts of blocks (a container's children, the page's
// sections) and of a widget's items (a gallery's images).
function countRefusal(doc: PageDocument, id: ParentId, type: ContainerType, errors: DocumentError[], list = "/children"): CommandError | null {
  const items = type === "page" ? undefined : ITEM_NAMES[type];
  const count = errors.find((e) => (e.pointer === list || (items && e.pointer === "/props/items")) && (e.keyword === "maxItems" || e.keyword === "minItems"));
  if (!count || count.limit === undefined) return null;
  const name = id === null ? "The page" : blockWithPlace(doc, id);
  const what = count.pointer === "/props/items" && items ? (count.limit === 1 ? items.one : items.many) : childrenWord(type, count.limit);
  const at = id === null ? "" : pointerOf(locate(doc, id)?.path ?? []);
  const located = errors.map((e) => ({ ...e, pointer: `${at}${e.pointer}` }));
  return count.keyword === "maxItems"
    ? refusal("full", `${name} is full: it holds at most ${count.limit} ${what}.`, located)
    : refusal("empty", `${name} must keep at least ${count.limit} ${what}.`, located);
}

// What a container holds, by the nesting rule: sections, columns, widgets.
function childrenWord(type: ContainerType, count: number): string {
  const types = childTypes(type);
  const only = types.length === 1 ? types[0] : undefined;
  if (only) return plural(only, count);
  return count === 1 ? "widget" : "widgets";
}

// Ids the page holds twice once the change is made.
export function checkUniqueIds(doc: PageDocument): CommandError | null {
  const twice = duplicateId(doc);
  if (!twice) return null;
  return refusal("duplicateId", `The id ${twice.id} is already used by another block.`, [
    { pointer: `${pointerOf(twice.path)}/id`, keyword: "uniqueId", message: `The id "${twice.id}" is already used by another block.`, layer: "rules" },
  ]);
}

// The whole page, as the server will check it: the application rules, then
// the schema.
export function checkRoot(doc: PageDocument): CommandError | null {
  const result = validateHeldDocument(doc);
  if (result.valid) return null;
  return refusal("invalid", `The page would not be valid: ${result.errors[0]?.message ?? "invalid"}.`, result.errors);
}
