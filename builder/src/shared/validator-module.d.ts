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
  export default validate;
}

// The nesting rule, read from the schema when the editor is built
// (build/nesting.ts): for "page" and for every block type, the block types
// it may hold, in the schema's order; [] for a widget.
declare module "virtual:block-document-nesting" {
  export const CHILD_TYPES: Readonly<Record<string, readonly string[]>>;
}
