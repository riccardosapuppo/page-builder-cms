// The schema's validator, compiled ahead of time. ajv compiles a schema into
// JavaScript and, at run time, turns that source into a function with
// `new Function`, which a Content-Security-Policy without 'unsafe-eval'
// refuses and which no browser bundle of this project should carry. Its
// standalone mode writes the compiled source out instead, as a module the
// bundler includes like any other: no compiler and no eval reach the
// browser.
//
// ajv 8.20.0's ESM output still names its runtime helpers with require()
// (for this schema, ucs2length, which counts code points for maxLength),
// which a browser cannot run. Each one is replaced here with an import of
// the same helper, and anything left that looks like a require() fails the
// build instead of reaching the bundle.
//
// The module has three validators of the page schema, sharing their
// compiled code: the default export checks a whole page document;
// validateBlock checks one block and everything under it against
// $defs/block, so the editor can check the one parent a change touches (a
// section that would get a fifth column) without validating the page;
// validateLine checks one line of text against $defs/line, the rule the
// server also holds a version's name and an image's alt text to, for the
// browser's storage adapter, which keeps both. And the collection schema's
// (schema/collection.schema.json), which refers to the page schema's
// definitions: validateCollection checks a collection's definition, and
// one validator for each definition the collection rules check an entry's
// parts against (COLLECTION_VALIDATORS), for the browser's storage too.
// The same plugin serves virtual:block-document-nesting, the nesting rule
// read from the schema (build/nesting.ts).
import { readFileSync } from "node:fs";
import type { Plugin } from "vite";
import Ajv2020Module from "ajv/dist/2020.js";
import standaloneModule from "ajv/dist/standalone/index.js";
import { AJV_OPTIONS } from "../../schema/tools/ajv-options.ts";
import { COLLECTION_SCHEMA_KEY, VALUE_DEFS } from "../../schema/tools/collection-rules.ts";
import { nestingSource } from "./nesting.ts";
import { ajvOptionsFile, collectionSchemaFile, schemaFile } from "./paths.ts";

// ajv is CommonJS: the constructor and the function are module.exports.default.
const Ajv2020 = Ajv2020Module.default;
const standaloneCode = standaloneModule.default;

export const VALIDATOR_MODULE = "virtual:block-document-validator";
const RESOLVED = `\0${VALIDATOR_MODULE}`;
export const NESTING_MODULE = "virtual:block-document-nesting";
const RESOLVED_NESTING = `\0${NESTING_MODULE}`;

// The one form ajv's standalone code uses for a runtime helper.
const RUNTIME_REQUIRE = /require\("(ajv\/dist\/runtime\/[a-z0-9_]+)"\)\.default/g;

export interface ValidatorSource {
  // The module, ready for the bundler.
  code: string;
  // How many require() calls ajv's own output had, and which helpers they named.
  requiresInAjvOutput: number;
  runtimeModules: string[];
}

export function readSchema(): object {
  return JSON.parse(readFileSync(schemaFile, "utf8")) as object;
}

export function readCollectionSchema(): object {
  return JSON.parse(readFileSync(collectionSchemaFile, "utf8")) as object;
}

// The validator a definition of the collection schema is exported as:
// validateCollection for the collection itself ("collection", as the rules
// name it), validateEntry for $defs/entry, validateTextValue for
// $defs/textValue, and so on for each type of field's value.
export const exportOf = (definition: string): string =>
  (definition === "collection" ? "validateCollection" : `validate${definition.charAt(0).toUpperCase()}${definition.slice(1)}`);

// The definitions the collection rules hand the schema, by the name of
// their export.
export const COLLECTION_VALIDATORS: Readonly<Record<string, string>> = Object.fromEntries(
  ["collection", "entry", ...Object.values(VALUE_DEFS)].map((definition) => [
    exportOf(definition),
    definition === "collection" ? COLLECTION_SCHEMA_KEY : `${COLLECTION_SCHEMA_KEY}#/$defs/${definition}`,
  ]),
);

// ajv's own standalone output for the schemas: `export const
// validateDocument` for the page, `export const validateBlock` for
// $defs/block, `export const validateLine` for $defs/line, the single line
// of plain text the server also holds a version's name and an image's alt
// text to; and the collection schema's (COLLECTION_VALIDATORS), added under
// the name its references to the page schema resolve by.
export function ajvStandalone(schema: object = readSchema(), collection: object = readCollectionSchema()): string {
  const id = (schema as { $id?: unknown }).$id;
  if (typeof id !== "string") throw new Error("the schema has no $id to name its validators by");
  const ajv = new Ajv2020({ ...AJV_OPTIONS, code: { source: true, esm: true } });
  ajv.addSchema(schema);
  ajv.addSchema(collection, COLLECTION_SCHEMA_KEY);
  return standaloneCode(ajv, { validateDocument: id, validateBlock: `${id}#/$defs/block`, validateLine: `${id}#/$defs/line`, ...COLLECTION_VALIDATORS });
}

// Compiles the schemas with the project's ajv options and returns them as
// an ES module whose default export validates a page document, and whose
// named exports validate a block, a line and a collection's parts.
export function validatorSource(schema: object = readSchema(), collection: object = readCollectionSchema()): ValidatorSource {
  const source = replaceRequires(ajvStandalone(schema, collection));
  return { ...source, code: `${source.code}\nexport default validateDocument;\n` };
}

export function replaceRequires(raw: string): ValidatorSource {
  const runtimeModules: string[] = [];
  let requiresInAjvOutput = 0;
  const body = raw.replace(RUNTIME_REQUIRE, (_whole, path: string) => {
    requiresInAjvOutput += 1;
    let index = runtimeModules.indexOf(path);
    if (index === -1) index = runtimeModules.push(path) - 1;
    return `ajvRuntime${index}`;
  });
  const left = /\brequire\s*\(/.exec(body);
  if (left) {
    throw new Error(`ajv's standalone output still calls require() after the known helpers were replaced: ${body.slice(left.index, left.index + 80)}`);
  }
  // The helpers are CommonJS with __esModule set. A bundler hands the
  // namespace's default as exports.default (the helper); Node, which runs
  // the unit tests, hands it module.exports (the object that holds it).
  // Taking the function from either keeps the two identical.
  const imports = runtimeModules.map((path, index) => [
    `import * as ajvRuntimeModule${index} from "${path}.js";`,
    `const ajvRuntime${index} = typeof ajvRuntimeModule${index}.default === "function" ? ajvRuntimeModule${index}.default : ajvRuntimeModule${index}.default.default;`,
  ].join("\n"));
  const code = `// Generated by builder/build/validator.ts from schema/block-document.schema.json and schema/collection.schema.json.\n${imports.join("\n")}\n${body}`;
  return { code, requiresInAjvOutput, runtimeModules };
}

// The Vite plugin: `import validate from "virtual:block-document-validator"`
// gives the compiled validator, and `import { CHILD_TYPES } from
// "virtual:block-document-nesting"` the nesting rule, both rebuilt from the
// schema file whenever the module is loaded, so neither can be older than
// the schema.
export function documentValidator(): Plugin {
  return {
    name: "page-builder-cms:document-validator",
    resolveId(source) {
      if (source === VALIDATOR_MODULE) return RESOLVED;
      if (source === NESTING_MODULE) return RESOLVED_NESTING;
      return null;
    },
    load(id) {
      if (id === RESOLVED) {
        this.addWatchFile(schemaFile);
        this.addWatchFile(collectionSchemaFile);
        this.addWatchFile(ajvOptionsFile);
        return validatorSource().code;
      }
      if (id === RESOLVED_NESTING) {
        this.addWatchFile(schemaFile);
        return nestingSource(readSchema());
      }
      return null;
    },
  };
}
