// The validator the browser gets is ajv's, compiled ahead of time: it must
// carry no require() and answer exactly as ajv compiled at run time does,
// which the schema's comparator holds to the server's json_schemer.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import Ajv2020Module from "ajv/dist/2020.js";
import standaloneModule from "ajv/dist/standalone/index.js";
import { describe, expect, test } from "vitest";
import compiled from "virtual:block-document-validator";
import { AJV_OPTIONS } from "../../schema/tools/ajv-options.ts";
import { parseDocument } from "../../schema/tools/rules.ts";
import { schemaDir } from "./paths.ts";
import { readSchema, replaceRequires, validatorSource } from "./validator.ts";

const Ajv2020 = Ajv2020Module.default;
const standaloneCode = standaloneModule.default;
const REQUIRE = /\brequire\s*\(/g;

describe("the compiled validator", () => {
  // Two compilations of the whole schema.
  test("ajv's own output calls require(), and the module the build serves calls none", { timeout: 60_000 }, () => {
    const ajv = new Ajv2020({ ...AJV_OPTIONS, code: { source: true, esm: true } });
    const raw = standaloneCode(ajv, ajv.compile(readSchema()));
    const before = raw.match(REQUIRE)?.length ?? 0;
    // Without this, the check below could pass because ajv stopped
    // emitting require(), not because the build replaced it.
    expect(before).toBeGreaterThan(0);

    const source = validatorSource();
    expect(source.requiresInAjvOutput).toBe(before);
    expect(source.runtimeModules).toEqual(["ajv/dist/runtime/ucs2length"]);
    expect(source.code.match(REQUIRE)).toBeNull();
    expect(source.code).toContain('import * as ajvRuntimeModule0 from "ajv/dist/runtime/ucs2length.js";');
  });

  test("a require() of a form the build does not know stops the build", () => {
    const planted = 'const func1 = require("ajv/dist/runtime/ucs2length").default;const other = require("fast-uri");';
    expect(() => replaceRequires(planted)).toThrow(/still calls require\(\)/);
  });

  // Every corpus file, twice: seconds on a busy machine.
  test("it answers every corpus file as ajv compiled at run time does, errors included", { timeout: 60_000 }, () => {
    const runtime = new Ajv2020({ ...AJV_OPTIONS }).compile(readSchema());
    const corpus = join(schemaDir, "corpus");
    let compared = 0;
    let invalid = 0;
    for (const folder of ["valid", "invalid"]) {
      for (const name of readdirSync(join(corpus, folder)).filter((f) => f.endsWith(".json"))) {
        const result = parseDocument(new Uint8Array(readFileSync(join(corpus, folder, name))));
        // A file the application rules refuse never reaches the schema.
        if (result.errors.length > 0) continue;
        const a = compiled(result.document);
        const b = runtime(result.document);
        expect(a, `${folder}/${name}`).toBe(b);
        const shape = (errors: typeof runtime.errors) => (errors ?? []).map((e) => `${e.instancePath} ${e.keyword} ${e.schemaPath} ${JSON.stringify(e.params)}`);
        expect(shape(compiled.errors), `${folder}/${name}`).toEqual(shape(runtime.errors));
        compared += 1;
        if (!a) invalid += 1;
      }
    }
    // The corpus had 181 files past the rules on 1 October 2026; a corpus
    // that shrank to nothing must not pass.
    expect(compared).toBeGreaterThanOrEqual(150);
    expect(invalid).toBeGreaterThanOrEqual(100);
  });
});
