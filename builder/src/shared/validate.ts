// Checks a page document in the browser the way the server checks it
// before storing it: first the application rules, the checks JSON Schema
// cannot make (unique ids, depth, finite and exact numbers, well-formed
// strings, duplicate keys in a text), then the schema. The rules are
// schema/tools/rules.ts itself, the twin of the server's
// cms/lib/block_document/rules.rb that the comparator holds to it; the
// schema's validator is ajv's, compiled ahead of time with the options the
// comparator uses. The server still decides: this lets the editor say what
// is wrong before a save is refused for it.
import validateSchema, { validateBlock } from "virtual:block-document-validator";
import { checkDocument, parseDocument, type ParseResult } from "../../../schema/tools/rules.ts";
import type { Block, PageDocument } from "./document.ts";

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
      pointer: key === undefined ? e.instancePath : `${e.instancePath}/${key.replaceAll("~", "~0").replaceAll("/", "~1")}`,
      keyword: e.keyword,
      message: e.message ?? e.keyword,
      layer: "schema",
    };
    if (typeof params.limit === "number") error.limit = params.limit;
    return error;
  });
}
