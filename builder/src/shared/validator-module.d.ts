// The schema's validator, compiled when the editor is built
// (build/validator.ts). Its default export is ajv's validate function.
declare module "virtual:block-document-validator" {
  import type { ErrorObject } from "ajv";

  interface CompiledValidator {
    (data: unknown): boolean;
    errors?: ErrorObject[] | null;
  }
  const validate: CompiledValidator;
  export default validate;
}
