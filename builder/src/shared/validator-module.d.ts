// The schema's validators, compiled when the editor is built
// (build/validator.ts). The default export is ajv's validate function for a
// page document; validateBlock validates one block, with everything under
// it, against the schema's $defs/block.
declare module "virtual:block-document-validator" {
  import type { ErrorObject } from "ajv";

  interface CompiledValidator {
    (data: unknown): boolean;
    errors?: ErrorObject[] | null;
  }
  const validate: CompiledValidator;
  export const validateBlock: CompiledValidator;
  // The schema's $defs/line: one line of plain text with a visible
  // character, as a page's title is.
  export const validateLine: CompiledValidator;
  // The collection schema's: a collection's definition, an entry's title,
  // slug and values as an object, and the value of each type of field
  // (schema/tools/collection-rules.ts, VALUE_DEFS).
  export const validateCollection: CompiledValidator;
  export const validateEntry: CompiledValidator;
  export const validateTextValue: CompiledValidator;
  export const validateParagraphValue: CompiledValidator;
  export const validateRichTextValue: CompiledValidator;
  export const validateNumberValue: CompiledValidator;
  export const validateDateValue: CompiledValidator;
  export const validateImageValue: CompiledValidator;
  export const validateLinkValue: CompiledValidator;
  export const validateToggleValue: CompiledValidator;
  export const validateChoiceValue: CompiledValidator;
  export default validate;
}

// The nesting rule, read from the schema when the editor is built
// (build/nesting.ts): for "page" and for every block type, the block types
// it may hold, in the schema's order; [] for a widget.
declare module "virtual:block-document-nesting" {
  export const CHILD_TYPES: Readonly<Record<string, readonly string[]>>;
}
