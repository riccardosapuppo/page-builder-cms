// Checks a page document in the browser the way the server checks it
// before storing it: first the application rules, the checks JSON Schema
// cannot make (unique ids, depth, finite and exact numbers, well-formed
// strings, duplicate keys in a text), then the schema. The rules are
// schema/tools/rules.ts itself, the twin of the server's
// cms/lib/block_document/rules.rb that the comparator holds to it; the
// schema's validator is ajv's, compiled ahead of time with the options the
// comparator uses. The server still decides: this lets the editor say what
// is wrong before a save is refused for it.
import validateSchema, { validateBlock, validateLine } from "virtual:block-document-validator";
import { checkDocument, checkTree, escapePointer, parseDocument, type ParseResult } from "../../../schema/tools/rules.ts";
import type { Block, PageDocument } from "./document.ts";

// The pieces of the application rules the editor's checks of one change
// use (../document/check.ts, ../document/clipboard.ts), and the pointer
// escape the browser's storage writes its refusals with, passed on from
// here like everything else the editor takes from outside builder/.
export { checkTree, duplicateAnchors, escapePointer, MAX_NESTING, normalise, scanJson } from "../../../schema/tools/rules.ts";

// Whether a text is one line of plain text with a visible character, at
// most `max` characters as a reader counts them (code points): the
// schema's $defs/line, which the server holds a version's name and an
// image's alt text to (Schema.line? in cms/app/models/block_document/schema.rb).
export function isLine(text: unknown, max: number): boolean {
  return typeof text === "string" && [...text].length <= max && validateLine(text);
}

export interface DocumentError {
  // A JSON pointer into the document, as the server's 422 gives it.
  pointer: string;
  // The rule broken: a keyword of the application rules or of the schema.
  keyword: string;
  message: string;
  layer: "rules" | "schema";
  // The schema's number for a count or a length (4 for "at most 4
  // columns"), when the keyword has one: the editor words its own message
  // with it.
  limit?: number;
}

export type Validation =
  | { valid: true; document: PageDocument }
  | { valid: false; errors: DocumentError[] };

// A document already in memory, as the editor holds it.
export function validateDocument(value: unknown): Validation {
  return finish(checkDocument(value));
}

// A document as text or bytes, as a file or the clipboard gives it: the
// text steps of the rules apply too (strict JSON, duplicate keys, UTF-8).
export function parseAndValidate(input: Uint8Array | string): Validation {
  return finish(parseDocument(input));
}

// A document the editor itself holds, checked by the same rules and schema
// as validateDocument but not normalised: in memory JavaScript has one
// number type, so there is no 2.0 to turn into 2, and the copy normalising
// makes is the larger part of the cost on a large page.
export function validateHeldDocument(value: unknown): Validation {
  const errors = checkTree(value);
  if (errors.length > 0) return finish({ document: value, errors });
  return validateDocumentSchema(value);
}

// The schema alone, no application rules: for a page whose values the
// rules have already seen (../document/check.ts checks each value a change
// brings in).
export function validateDocumentSchema(value: unknown): Validation {
  if (validateSchema(value)) return { valid: true, document: value as PageDocument };
  return { valid: false, errors: schemaErrors(validateSchema.errors) };
}

// One block and everything under it, against the schema's $defs/block: the
// schema alone, no application rules, with pointers from the block itself
// ("/children/2/props/text"). It says nothing about where the block sits:
// whether its type may go there is the nesting rule's to say
// (../document/nesting.ts), and the editor runs the application rules on
// what a change brings in (../document/check.ts).
export type BlockValidation = { valid: true; block: Block } | { valid: false; errors: DocumentError[] };

export function validateBlockSchema(value: unknown): BlockValidation {
  if (validateBlock(value)) return { valid: true, block: value as Block };
  return { valid: false, errors: schemaErrors(validateBlock.errors) };
}

// What a header or footer is refused for that a page is not: a form, whose
// answers belong to the page it is on, and a section anchor, since the
// header and footer are drawn in every page beside its own sections, whose
// anchors theirs are not checked against. The server's words
// (SiteParts::FORM, SiteParts::ANCHOR).
export const PART_FORM = "A header or footer holds no form: a form's answers belong to the page it is on.";
export const PART_ANCHOR = "A header or footer section takes no anchor: it would be on every page, where the page's own sections have theirs.";

// The pointer of every form block of a document, in page order, as the
// server's SiteParts.forms finds them.
export function partForms(document: PageDocument): string[] {
  return document.sections.flatMap((section, s) => section.children.flatMap((column, c) =>
    column.children.flatMap((block, w) => (block.type === "form" ? [`/sections/${s}/children/${c}/children/${w}`] : []))));
}

// The pointer of every section anchor of a document, as the server's
// SiteParts.anchors finds them.
export function partAnchors(document: PageDocument): string[] {
  return document.sections.flatMap((section, s) => (section.props.anchor === undefined ? [] : [`/sections/${s}/props/anchor`]));
}

// Every fault of a part's own rules, in the server's order (SiteParts.check):
// its forms, then its anchors.
export function partFaults(document: PageDocument): Array<{ pointer: string; keyword: "part"; message: string }> {
  return [
    ...partForms(document).map((pointer) => ({ pointer, keyword: "part" as const, message: PART_FORM })),
    ...partAnchors(document).map((pointer) => ({ pointer, keyword: "part" as const, message: PART_ANCHOR })),
  ];
}

// A part's document (the site's header or footer), checked as the server
// checks a part's draft (SiteParts.check): a page's checks, then the
// part's own rules.
export function validatePart(value: unknown): Validation {
  const result = validateDocument(value);
  if (!result.valid) return result;
  const faults = partFaults(result.document);
  if (faults.length === 0) return result;
  return { valid: false, errors: faults.map((fault) => ({ ...fault, layer: "rules" })) };
}

function finish(result: ParseResult): Validation {
  if (result.errors.length > 0) {
    return {
      valid: false,
      errors: result.errors.map((e) => ({ pointer: e.pointer, keyword: e.keyword, message: e.message, layer: "rules" })),
    };
  }
  const document = result.document;
  if (validateSchema(document)) return { valid: true, document: document as PageDocument };
  return { valid: false, errors: schemaErrors(validateSchema.errors) };
}

// ajv adds an "if" error at every block whose matching branch failed, on
// top of the branch's own errors; the server reports only those.
function schemaErrors(errors: typeof validateSchema.errors): DocumentError[] {
  return (errors ?? []).filter((e) => e.keyword !== "if").map((e) => {
    // ajv names the unknown or missing key in params and points at the
    // object that holds it; the server points at the key itself.
    const params = e.params as { additionalProperty?: unknown; limit?: unknown };
    const key = e.keyword === "additionalProperties" && typeof params.additionalProperty === "string" ? params.additionalProperty : undefined;
    const error: DocumentError = {
      pointer: key === undefined ? e.instancePath : `${e.instancePath}/${escapePointer(key)}`,
      keyword: e.keyword,
      message: e.message ?? e.keyword,
      layer: "schema",
    };
    if (typeof params.limit === "number") error.limit = params.limit;
    return error;
  });
}
