// The editor's side: ajv 8.20.0 with the project's configuration, after the
// application rules of rules.ts. Prints a header line, then one JSON line per
// corpus file.
//
//   node validate.ts [--kind page|collection] [--schema PATH] [--corpus DIR] [--rules on|off]
//
// --kind collection reads the collection corpus: each file a case of a
// collection and, maybe, an entry of it, checked by the JSON rules of
// rules.ts, then by collection-rules.ts with the collection schema (and
// the page schema it refers to). --rules off skips the application rules
// (the comparator uses it to show what they protect against).
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import type { ErrorObject } from "ajv";
import { makeAjv } from "./ajv.ts";
import { checkCollection, checkEntry, type CheckError, type FoundError, type SchemaCheck } from "./collection-rules.ts";
import { COLLECTION_CORPUS, COLLECTION_KEY, COLLECTION_SCHEMA, CORPUS, SCHEMA, argValue, kindOf, listCorpus, type ReportedError, type ResultLine } from "./corpus.ts";
import { parseDocument, parseJson } from "./rules.ts";

function reported(errors: ErrorObject[] | null | undefined): FoundError[] {
  return (errors ?? []).map((e) => {
    const params = e.params as { additionalProperty?: unknown; missingProperty?: unknown };
    const property = params.additionalProperty ?? params.missingProperty;
    return typeof property === "string"
      ? { pointer: e.instancePath, keyword: e.keyword, message: e.message ?? "", property }
      : { pointer: e.instancePath, keyword: e.keyword, message: e.message ?? "" };
  });
}
const asReported = (errors: readonly FoundError[]): ReportedError[] =>
  errors.map(({ pointer, keyword, property }) => (property === undefined ? { pointer, keyword } : { pointer, keyword, property }));

const argv = process.argv.slice(2);
const kind = kindOf(argv);
const schemaPath = argValue(argv, "--schema", kind === "page" ? SCHEMA : COLLECTION_SCHEMA);
const corpus = argValue(argv, "--corpus", kind === "page" ? CORPUS : COLLECTION_CORPUS);
const useRules = argValue(argv, "--rules", "on") === "on";

const ajvVersion = (createRequire(import.meta.url)("ajv/package.json") as { version: string }).version;
process.stdout.write(JSON.stringify({ engine: `ajv ${ajvVersion}`, parser: "JSON.parse", runtime: `node ${process.version}`, rules: useRules, kind }) + "\n");

// The bytes of a file as the rules read them, or as JSON.parse does with
// the rules off: the value, or the errors that refused it.
function read(bytes: Uint8Array, parse: typeof parseDocument): { value: unknown } | { errors: ReportedError[] } {
  if (useRules) {
    const result = parse(bytes);
    if (result.errors.length > 0) return { errors: result.errors.map((e) => ({ pointer: e.pointer, keyword: e.keyword })) };
    return { value: result.document };
  }
  try {
    return { value: JSON.parse(new TextDecoder().decode(bytes)) };
  } catch {
    return { errors: [{ pointer: "", keyword: "parse" }] };
  }
}

if (kind === "page") {
  const schema = JSON.parse(readFileSync(schemaPath, "utf8")) as { $id: string };
  const validate = makeAjv().compile(schema);
  for (const file of listCorpus(corpus)) {
    let line: ResultLine;
    try {
      const document = read(new Uint8Array(readFileSync(join(corpus, file))), parseDocument);
      if ("errors" in document) {
        line = { file, valid: false, layer: "rules", errors: document.errors, normalized: null };
      } else {
        const ok = validate(document.value) as boolean;
        line = { file, valid: ok, layer: "schema", errors: asReported(reported(validate.errors)), normalized: JSON.stringify(document.value) };
      }
    } catch (e) {
      line = { file, exception: e instanceof Error ? `${e.name}: ${e.message}` : String(e) };
    }
    process.stdout.write(JSON.stringify(line) + "\n");
  }
} else {
  // The collection schema refers to the page schema's definitions, by its
  // $id: both are added, the collection's under its name.
  const ajv = makeAjv();
  ajv.addSchema(JSON.parse(readFileSync(SCHEMA, "utf8")) as object);
  ajv.addSchema(JSON.parse(readFileSync(schemaPath, "utf8")) as object, COLLECTION_KEY);
  const check: SchemaCheck = (definition, value) => {
    const validate = ajv.getSchema(definition === "collection" ? COLLECTION_KEY : `${COLLECTION_KEY}#/$defs/${definition}`);
    if (!validate) throw new Error(`the collection schema has no definition ${definition}`);
    return validate(value) ? [] : reported(validate.errors);
  };
  const under = (errors: readonly CheckError[], prefix: string): CheckError[] =>
    errors.filter((e) => useRules || e.layer === "schema").map((e) => ({ ...e, pointer: `${prefix}${e.pointer}` }));
  for (const file of listCorpus(corpus)) {
    let line: ResultLine;
    try {
      const parsed = read(new Uint8Array(readFileSync(join(corpus, file))), parseJson);
      if ("errors" in parsed) {
        line = { file, valid: false, layer: "rules", errors: parsed.errors, normalized: null };
      } else {
        const found = parsed.value as { collection?: unknown; entry?: unknown };
        let errors = under(checkCollection(found.collection, check), "/collection");
        if (errors.length === 0 && "entry" in found) errors = under(checkEntry(found.collection, found.entry, check), "/entry");
        line = {
          file,
          valid: errors.length === 0,
          layer: errors.some((e) => e.layer === "rules") ? "rules" : "schema",
          errors: asReported(errors),
          normalized: JSON.stringify(parsed.value),
        };
      }
    } catch (e) {
      line = { file, exception: e instanceof Error ? `${e.name}: ${e.message}` : String(e) };
    }
    process.stdout.write(JSON.stringify(line) + "\n");
  }
}
