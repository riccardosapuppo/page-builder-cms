// The editor's side: ajv 8.20.0 with the project's configuration, after the
// application rules of rules.ts. Prints a header line, then one JSON line per
// corpus file.
//
//   node validate.ts [--schema PATH] [--corpus DIR] [--rules on|off] [--def NAME]
//
// --rules off skips the application rules (the comparator uses it to show
// what they protect against). --def validates against $defs/NAME of the
// schema instead of its root: the site's header and footer are $defs/site.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import type { ErrorObject } from "ajv";
import { makeAjv } from "./ajv.ts";
import { CORPUS, SCHEMA, argValue, listCorpus, type ReportedError, type ResultLine } from "./corpus.ts";
import { parseDocument } from "./rules.ts";

function reported(errors: ErrorObject[] | null | undefined): ReportedError[] {
  return (errors ?? []).map((e) => {
    const params = e.params as { additionalProperty?: unknown; missingProperty?: unknown };
    const property = params.additionalProperty ?? params.missingProperty;
    return typeof property === "string"
      ? { pointer: e.instancePath, keyword: e.keyword, property }
      : { pointer: e.instancePath, keyword: e.keyword };
  });
}

const argv = process.argv.slice(2);
const schemaPath = argValue(argv, "--schema", SCHEMA);
const corpus = argValue(argv, "--corpus", CORPUS);
const useRules = argValue(argv, "--rules", "on") === "on";
const def = argValue(argv, "--def", "");

const schema = JSON.parse(readFileSync(schemaPath, "utf8")) as { $id: string };
const validate = def === "" ? makeAjv().compile(schema) : definition(schema, def);

// $defs/NAME, compiled with the whole schema around it, so its $refs to
// the rest of the file resolve as they do from the root.
function definition(whole: { $id: string }, name: string) {
  const ajv = makeAjv();
  ajv.addSchema(whole);
  const found = ajv.getSchema(`${whole.$id}#/$defs/${name}`);
  if (!found) throw new Error(`the schema has no $defs/${name}`);
  return found;
}

const ajvVersion = (createRequire(import.meta.url)("ajv/package.json") as { version: string }).version;
process.stdout.write(JSON.stringify({ engine: `ajv ${ajvVersion}`, parser: "JSON.parse", runtime: `node ${process.version}`, rules: useRules, def }) + "\n");

for (const file of listCorpus(corpus)) {
  let line: ResultLine;
  try {
    const bytes = new Uint8Array(readFileSync(join(corpus, file)));
    let document: unknown;
    if (useRules) {
      const result = parseDocument(bytes);
      if (result.errors.length > 0) {
        line = {
          file,
          valid: false,
          layer: "rules",
          errors: result.errors.map((e) => ({ pointer: e.pointer, keyword: e.keyword })),
          normalized: null,
        };
        process.stdout.write(JSON.stringify(line) + "\n");
        continue;
      }
      document = result.document;
    } else {
      try {
        document = JSON.parse(new TextDecoder().decode(bytes));
      } catch {
        line = { file, valid: false, layer: "rules", errors: [{ pointer: "", keyword: "parse" }], normalized: null };
        process.stdout.write(JSON.stringify(line) + "\n");
        continue;
      }
    }
    const ok = validate(document) as boolean;
    line = { file, valid: ok, layer: "schema", errors: reported(validate.errors), normalized: JSON.stringify(document) };
  } catch (e) {
    line = { file, exception: e instanceof Error ? `${e.name}: ${e.message}` : String(e) };
  }
  process.stdout.write(JSON.stringify(line) + "\n");
}
